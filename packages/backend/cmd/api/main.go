// Command api serves the dashboard REST API, sessions and tenant admin.
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/redis/go-redis/v9"

	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/api"
	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/auth"
	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/env"
	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/httpx"
	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/logx"
	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/pg"
)

func main() {
	log := logx.New("api")
	if err := run(log); err != nil {
		log.Error("api exited", "err", err)
		os.Exit(1)
	}
}

func run(log *slog.Logger) error {
	var r env.Reader
	prod := env.Production()

	secret := r.String("JWT_SECRET", "")
	origins := r.List("CORS_ORIGIN")
	if prod {
		secret = r.Required("JWT_SECRET")
		if len(origins) == 0 {
			r.Required("CORS_ORIGIN")
		}
	} else {
		if secret == "" {
			log.Warn("JWT_SECRET not set; using the insecure development secret")
			secret = auth.DevSecret
		}
		if len(origins) == 0 {
			origins = []string{"*"}
		}
	}

	addr := ":" + r.String("API_PORT", "3000")
	cfg := api.Config{
		CORSOrigins:   origins,
		SecureCookies: prod,
		RateLimit:     r.Int("RATE_LIMIT_MAX", 300),
		RateWindow:    r.Millis("RATE_LIMIT_WINDOW_MS", time.Minute),
		AuthRateLimit: r.Int("AUTH_RATE_LIMIT_MAX", 60),
		TrustedHops:   r.NonNegative("TRUSTED_PROXY_HOPS", 1),
	}
	dsn := r.PostgresDSN()
	rdb := redis.NewClient(&redis.Options{Addr: r.RedisAddr(), Password: r.RedisPassword()})
	defer rdb.Close()
	if err := r.Err(); err != nil {
		return err
	}

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	db, err := pg.Connect(ctx, dsn)
	if err != nil {
		return err
	}
	defer db.Close()
	if err := rdb.Ping(ctx).Err(); err != nil {
		return err
	}

	active, revoked, err := api.SyncAPIKeys(ctx, db, rdb)
	if err != nil {
		return err
	}
	log.Info("api key cache synced", "active", active, "revoked", revoked)

	srv := api.New(db, rdb, auth.NewSigner(secret), cfg, log)
	return httpx.Serve(ctx, httpx.NewServer(addr, srv.Handler()), log)
}
