package collector

import (
	"context"
	"errors"
	"fmt"
	"strconv"

	"github.com/redis/go-redis/v9"

	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/streams"
)

type RedisStore struct {
	rdb *redis.Client
}

func NewRedisStore(rdb *redis.Client) *RedisStore { return &RedisStore{rdb: rdb} }

func (s *RedisStore) Ping(ctx context.Context) error { return s.rdb.Ping(ctx).Err() }

func (s *RedisStore) TenantForKey(ctx context.Context, keyHash string) (int32, bool, error) {
	v, err := s.rdb.HGet(ctx, streams.APIKeys, keyHash).Result()
	if errors.Is(err, redis.Nil) {
		return 0, false, nil
	}
	if err != nil {
		return 0, false, err
	}
	id, err := strconv.ParseInt(v, 10, 32)
	if err != nil {
		return 0, false, fmt.Errorf("api key cache holds non-numeric tenant %q", v)
	}
	return int32(id), true, nil
}

// Publish writes each payload as a single "data" field, the format the
// processor reads.
func (s *RedisStore) Publish(ctx context.Context, stream string, payloads [][]byte) error {
	_, err := s.rdb.Pipelined(ctx, func(p redis.Pipeliner) error {
		for _, b := range payloads {
			p.XAdd(ctx, &redis.XAddArgs{Stream: stream, Values: []any{"data", b}})
		}
		return nil
	})
	if err != nil {
		return fmt.Errorf("publish %d entries to %s: %w", len(payloads), stream, err)
	}
	return nil
}
