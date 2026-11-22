// Command collector accepts telemetry batches from agents and queues them on
// Redis Streams for the processor.
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/collector"
	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/env"
	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/httpx"
	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/logx"
)

func main() {
	log := logx.New("collector")
	if err := run(log); err != nil {
		log.Error("collector exited", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	var r env.Reader
	addr := ":" + r.String("COLLECTOR_PORT", "4318")
	cfg := collector.Config{
		MaxBatchSize:  r.Int("MAX_BATCH_SIZE", 1000),
		RequireAPIKey: env.Production(),
		RateLimit:     r.Int("RATE_LIMIT_MAX", 120),
		RateWindow:    r.Millis("RATE_LIMIT_WINDOW_MS", time.Minute),
		TrustedHops:   r.NonNegative("TRUSTED_PROXY_HOPS", 1),
	}
	rdb := redis.NewClient(&redis.Options{Addr: r.RedisAddr(), Password: r.RedisPassword()})
	defer rdb.Close()
	if err := r.Err(); err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()
	if err := rdb.Ping(ctx).Err(); err != nil {
		return err
	}

	srv := collector.New(collector.NewRedisStore(rdb), cfg, log)
	log.Info("collector starting", "require_api_key", cfg.RequireAPIKey, "max_batch_size", cfg.MaxBatchSize)
	return httpx.Serve(ctx, httpx.NewServer(addr, srv.Handler()), log)
}
