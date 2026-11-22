// Package stream runs a Redis Streams consumer-group loop that decodes
// batches, persists them through a Pipeline and acknowledges them only after
// they are stored (or deliberately dead-lettered).
package stream

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// Item is a decoded stream entry paired with its Redis message ID.
type Item[T any] struct {
	ID    string
	Value T
}

// Pipeline decodes raw payloads and persists batches of decoded items.
type Pipeline[T any] struct {
	// Decode returns an error for payloads that can never be persisted;
	// those are logged and acknowledged (dead-lettered) without retry.
	Decode func(data []byte) (T, error)
	// Persist must be idempotent: Redis Streams deliver at least once.
	Persist func(ctx context.Context, items []Item[T]) error
}

type Options struct {
	Stream       string
	Group        string
	Consumer     string
	BatchSize    int64
	BlockTimeout time.Duration
	ClaimMinIdle time.Duration
	RetryBackoff time.Duration
	// IsPermanent reports whether a Persist error will fail again on retry
	// (bad data, constraint violation). Such batches are split so the
	// offending item can be dead-lettered without blocking the rest.
	IsPermanent func(error) bool
}

type Consumer[T any] struct {
	rdb      *redis.Client
	opts     Options
	pipeline Pipeline[T]
	log      *slog.Logger
}

func NewConsumer[T any](rdb *redis.Client, opts Options, p Pipeline[T], log *slog.Logger) *Consumer[T] {
	if opts.IsPermanent == nil {
		opts.IsPermanent = func(error) bool { return false }
	}
	return &Consumer[T]{
		rdb:      rdb,
		opts:     opts,
		pipeline: p,
		log:      log.With("stream", opts.Stream, "group", opts.Group, "consumer", opts.Consumer),
	}
}

// Run blocks until ctx is cancelled. Unlike the Node processor, which only
// ever read new messages (">"), it first drains this consumer's pending list
// and claims messages abandoned by dead consumers, so a failed batch is
// actually retried instead of sitting unacknowledged forever.
func (c *Consumer[T]) Run(ctx context.Context) error {
	if err := c.ensureGroup(ctx); err != nil {
		return err
	}
	c.log.Info("consumer started")

	recovering := true
	for ctx.Err() == nil {
		if recovering {
			if err := c.claimAbandoned(ctx); err != nil {
				c.log.Error("claiming abandoned messages", "err", err)
			}
		}

		start := ">"
		if recovering {
			start = "0"
		}
		msgs, err := c.read(ctx, start)
		if err != nil {
			if ctx.Err() == nil {
				c.log.Error("reading stream", "err", err)
				c.sleep(ctx)
			}
			continue
		}
		if len(msgs) == 0 {
			recovering = false
			continue
		}

		if err := c.process(ctx, msgs); err != nil {
			c.log.Error("batch left pending for retry", "size", len(msgs), "err", err)
			recovering = true
			c.sleep(ctx)
		}
	}
	c.log.Info("consumer stopped")
	return nil
}

// process decodes msgs once, dead-letters the invalid ones, then persists
// and acknowledges the rest.
func (c *Consumer[T]) process(ctx context.Context, msgs []redis.XMessage) error {
	items := make([]Item[T], 0, len(msgs))
	var rejected []string
	for _, m := range msgs {
		// The collector writes each event as a single "data" field (XADD ... data <json>).
		data, _ := m.Values["data"].(string)
		v, err := c.pipeline.Decode([]byte(data))
		if err != nil {
			c.log.Warn("message dead-lettered", "id", m.ID, "err", err, "raw", data)
			rejected = append(rejected, m.ID)
			continue
		}
		items = append(items, Item[T]{ID: m.ID, Value: v})
	}
	if len(rejected) > 0 {
		if err := c.ack(ctx, rejected); err != nil {
			return err
		}
	}
	return c.persist(ctx, items)
}

// persist stores and acknowledges items. On a permanent failure it bisects
// the batch until the poison items are isolated and dead-lettered.
func (c *Consumer[T]) persist(ctx context.Context, items []Item[T]) error {
	if len(items) == 0 {
		return nil
	}
	err := c.pipeline.Persist(ctx, items)
	if err == nil {
		return c.ack(ctx, ids(items))
	}
	if !c.opts.IsPermanent(err) {
		return err
	}
	if len(items) == 1 {
		c.log.Warn("message dead-lettered", "id", items[0].ID, "err", err)
		return c.ack(ctx, ids(items))
	}
	mid := len(items) / 2
	if err := c.persist(ctx, items[:mid]); err != nil {
		return err
	}
	return c.persist(ctx, items[mid:])
}

func (c *Consumer[T]) read(ctx context.Context, start string) ([]redis.XMessage, error) {
	res, err := c.rdb.XReadGroup(ctx, &redis.XReadGroupArgs{
		Group:    c.opts.Group,
		Consumer: c.opts.Consumer,
		Streams:  []string{c.opts.Stream, start},
		Count:    c.opts.BatchSize,
		Block:    c.opts.BlockTimeout,
	}).Result()
	if errors.Is(err, redis.Nil) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if len(res) == 0 {
		return nil, nil
	}
	return res[0].Messages, nil
}

// claimAbandoned moves messages idle longer than ClaimMinIdle in any
// consumer's pending list into ours; the next read from "0" picks them up.
func (c *Consumer[T]) claimAbandoned(ctx context.Context) error {
	cursor := "0-0"
	for {
		claimed, next, err := c.rdb.XAutoClaimJustID(ctx, &redis.XAutoClaimArgs{
			Stream:   c.opts.Stream,
			Group:    c.opts.Group,
			Consumer: c.opts.Consumer,
			MinIdle:  c.opts.ClaimMinIdle,
			Start:    cursor,
			Count:    c.opts.BatchSize,
		}).Result()
		if err != nil {
			return err
		}
		if len(claimed) > 0 {
			c.log.Info("claimed abandoned messages", "count", len(claimed))
		}
		if next == "0-0" {
			return nil
		}
		cursor = next
	}
}

func (c *Consumer[T]) ack(ctx context.Context, ids []string) error {
	// Use a fresh context so a shutdown signal can't strand a batch that was
	// already persisted; re-delivery would be harmless but wasteful.
	ackCtx, cancel := context.WithTimeout(context.WithoutCancel(ctx), 5*time.Second)
	defer cancel()
	if err := c.rdb.XAck(ackCtx, c.opts.Stream, c.opts.Group, ids...).Err(); err != nil {
		return fmt.Errorf("ack %d messages: %w", len(ids), err)
	}
	return nil
}

func (c *Consumer[T]) ensureGroup(ctx context.Context) error {
	err := c.rdb.XGroupCreateMkStream(ctx, c.opts.Stream, c.opts.Group, "0").Err()
	if err != nil && !strings.HasPrefix(err.Error(), "BUSYGROUP") {
		return fmt.Errorf("create consumer group %s on %s: %w", c.opts.Group, c.opts.Stream, err)
	}
	return nil
}

func (c *Consumer[T]) sleep(ctx context.Context) {
	select {
	case <-ctx.Done():
	case <-time.After(c.opts.RetryBackoff):
	}
}

func ids[T any](items []Item[T]) []string {
	out := make([]string, len(items))
	for i, it := range items {
		out[i] = it.ID
	}
	return out
}
