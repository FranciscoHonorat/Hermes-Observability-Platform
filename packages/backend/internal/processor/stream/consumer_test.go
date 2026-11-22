package stream

import (
	"context"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"os"
	"strconv"
	"sync"
	"testing"
	"time"

	"github.com/redis/go-redis/v9"
)

var errPoison = errors.New("poison")

// Integration test: needs a disposable Redis, e.g.
//
//	docker run --rm -d -p 56379:6379 redis:7-alpine
//	TEST_REDIS_ADDR=localhost:56379 go test ./internal/stream/
func newTestRedis(t *testing.T) (*redis.Client, string) {
	t.Helper()
	addr := os.Getenv("TEST_REDIS_ADDR")
	if addr == "" {
		t.Skip("TEST_REDIS_ADDR not set")
	}
	rdb := redis.NewClient(&redis.Options{Addr: addr})
	t.Cleanup(func() { rdb.Close() })
	key := fmt.Sprintf("test:%s:%d", t.Name(), time.Now().UnixNano())
	t.Cleanup(func() { rdb.Del(context.Background(), key) })
	return rdb, key
}

type recorder struct {
	mu       sync.Mutex
	stored   []int
	failOnce bool
}

// pipeline decodes integer payloads; values < 0 are invalid and the value 13
// is a permanent persist failure. With failOnce, the first Persist call fails
// transiently.
func (r *recorder) pipeline() Pipeline[int] {
	return Pipeline[int]{
		Decode: func(data []byte) (int, error) {
			n, err := strconv.Atoi(string(data))
			if err == nil && n < 0 {
				err = errors.New("negative")
			}
			return n, err
		},
		Persist: func(_ context.Context, items []Item[int]) error {
			r.mu.Lock()
			defer r.mu.Unlock()
			if r.failOnce {
				r.failOnce = false
				return errors.New("connection reset")
			}
			for _, it := range items {
				if it.Value == 13 {
					return errPoison
				}
			}
			for _, it := range items {
				r.stored = append(r.stored, it.Value)
			}
			return nil
		},
	}
}

func (r *recorder) count() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.stored)
}

func runUntil(t *testing.T, c *Consumer[int], done func() bool) {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	finished := make(chan error)
	go func() { finished <- c.Run(ctx) }()
	deadline := time.Now().Add(10 * time.Second)
	for !done() {
		if time.Now().After(deadline) {
			cancel()
			t.Fatal("timed out waiting for consumer")
		}
		time.Sleep(20 * time.Millisecond)
	}
	cancel()
	if err := <-finished; err != nil {
		t.Fatal(err)
	}
}

func testOptions(stream string) Options {
	return Options{
		Stream:       stream,
		Group:        "g",
		Consumer:     "c1",
		BatchSize:    100,
		BlockTimeout: 50 * time.Millisecond,
		ClaimMinIdle: 50 * time.Millisecond,
		RetryBackoff: 50 * time.Millisecond,
		IsPermanent:  func(err error) bool { return errors.Is(err, errPoison) },
	}
}

func pending(t *testing.T, rdb *redis.Client, stream string) int64 {
	t.Helper()
	p, err := rdb.XPending(context.Background(), stream, "g").Result()
	if err != nil {
		t.Fatal(err)
	}
	return p.Count
}

func TestConsumerIsolatesInvalidAndPoisonMessages(t *testing.T) {
	rdb, stream := newTestRedis(t)
	ctx := context.Background()
	for _, v := range []string{"1", "2", "x", "13", "-1", "4", "5"} {
		rdb.XAdd(ctx, &redis.XAddArgs{Stream: stream, Values: map[string]any{"data": v}})
	}

	rec := &recorder{}
	c := NewConsumer(rdb, testOptions(stream), rec.pipeline(), slog.New(slog.NewTextHandler(io.Discard, nil)))
	runUntil(t, c, func() bool { return rec.count() == 4 })

	if got := pending(t, rdb, stream); got != 0 {
		t.Fatalf("want empty pending list, got %d", got)
	}
}

func TestConsumerRetriesTransientFailure(t *testing.T) {
	rdb, stream := newTestRedis(t)
	ctx := context.Background()
	for _, v := range []string{"1", "2", "3"} {
		rdb.XAdd(ctx, &redis.XAddArgs{Stream: stream, Values: map[string]any{"data": v}})
	}

	rec := &recorder{failOnce: true}
	c := NewConsumer(rdb, testOptions(stream), rec.pipeline(), slog.New(slog.NewTextHandler(io.Discard, nil)))
	runUntil(t, c, func() bool { return rec.count() == 3 })

	if got := pending(t, rdb, stream); got != 0 {
		t.Fatalf("want empty pending list, got %d", got)
	}
}

func TestConsumerClaimsAbandonedMessages(t *testing.T) {
	rdb, stream := newTestRedis(t)
	ctx := context.Background()
	rdb.XGroupCreateMkStream(ctx, stream, "g", "0")
	rdb.XAdd(ctx, &redis.XAddArgs{Stream: stream, Values: map[string]any{"data": "7"}})
	// A different consumer reads the message and dies without acknowledging it.
	if err := rdb.XReadGroup(ctx, &redis.XReadGroupArgs{Group: "g", Consumer: "dead", Streams: []string{stream, ">"}}).Err(); err != nil {
		t.Fatal(err)
	}
	time.Sleep(100 * time.Millisecond) // exceed ClaimMinIdle

	rec := &recorder{}
	c := NewConsumer(rdb, testOptions(stream), rec.pipeline(), slog.New(slog.NewTextHandler(io.Discard, nil)))
	runUntil(t, c, func() bool { return rec.count() == 1 })

	if got := pending(t, rdb, stream); got != 0 {
		t.Fatalf("want empty pending list, got %d", got)
	}
}
