// Command processor drains the collector's Redis Streams into TimescaleDB.
// It also runs the alert engine, which evaluates alert_rules on an interval.
package main

import (
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"sync"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/logx"
	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/pg"
	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/processor/alert"
	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/processor/config"
	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/processor/pipeline"
	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/processor/store"
	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/processor/stream"
	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/streams"
)

func main() {
	log := logx.New("processor")
	if err := run(log); err != nil {
		log.Error("processor exited", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	cfg, err := config.Load()
	if err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	pool, err := pg.Connect(ctx, cfg.DatabaseURL)
	if err != nil {
		return err
	}
	defer pool.Close()
	db := store.New(pool)

	rdb := redis.NewClient(&redis.Options{Addr: cfg.RedisAddr, Password: cfg.RedisPassword})
	defer rdb.Close()
	if err := rdb.Ping(ctx).Err(); err != nil {
		return err
	}

	srv := &http.Server{Addr: cfg.HTTPAddr, Handler: healthHandler(pool, rdb), ReadHeaderTimeout: 5 * time.Second}
	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("health server", "err", err)
		}
	}()

	opts := func(name string) stream.Options {
		return stream.Options{
			Stream:       name,
			Group:        streams.Groups[name],
			Consumer:     cfg.ConsumerName,
			BatchSize:    cfg.BatchSize,
			BlockTimeout: cfg.BlockTimeout,
			ClaimMinIdle: cfg.ClaimMinIdle,
			RetryBackoff: cfg.RetryBackoff,
			IsPermanent:  pg.IsPermanent,
		}
	}
	var notifier alert.Notifier = alert.LogNotifier{Log: log}
	if cfg.SMTP.Configured() {
		notifier = alert.NewSMTPNotifier(alert.SMTPConfig(cfg.SMTP))
	} else {
		log.Warn("SMTP_USER/SMTP_PASSWORD not set; alert emails will be logged, not sent")
	}

	workers := []func(context.Context) error{
		stream.NewConsumer(rdb, opts(streams.Metrics), pipeline.Metrics(db), log).Run,
		stream.NewConsumer(rdb, opts(streams.Traces), pipeline.Spans(db), log).Run,
		stream.NewConsumer(rdb, opts(streams.Logs), pipeline.Logs(db), log).Run,
		alert.NewEngine(db, notifier, cfg.AlertCheckInterval, log).Run,
	}

	var wg sync.WaitGroup
	errs := make(chan error, len(workers))
	for _, run := range workers {
		wg.Go(func() {
			if err := run(ctx); err != nil {
				errs <- err
				stop()
			}
		})
	}
	log.Info("processor started", "consumer", cfg.ConsumerName, "batch_size", cfg.BatchSize)

	<-ctx.Done()
	log.Info("shutting down")
	wg.Wait()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)

	close(errs)
	return <-errs // nil when every consumer stopped cleanly
}

// healthHandler reports dependency health plus per-group backlog, so an
// operator can see the processor falling behind without running XLEN by hand.
func healthHandler(db *pgxpool.Pool, rdb *redis.Client) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()

		status, code := "ok", http.StatusOK
		if err := db.Ping(ctx); err != nil {
			status, code = "postgres unavailable", http.StatusServiceUnavailable
		} else if err := rdb.Ping(ctx).Err(); err != nil {
			status, code = "redis unavailable", http.StatusServiceUnavailable
		}

		type backlog struct {
			Lag     int64 `json:"lag"`     // entries not yet delivered to the group
			Pending int64 `json:"pending"` // delivered but not yet acknowledged
		}
		backlogs := map[string]backlog{}
		if code == http.StatusOK {
			for name, group := range streams.Groups {
				infos, err := rdb.XInfoGroups(ctx, name).Result()
				if err != nil {
					continue
				}
				for _, g := range infos {
					if g.Name == group {
						backlogs[name] = backlog{Lag: g.Lag, Pending: g.Pending}
					}
				}
			}
		}

		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(code)
		_ = json.NewEncoder(w).Encode(map[string]any{"status": status, "streams": backlogs})
	})
	return mux
}
