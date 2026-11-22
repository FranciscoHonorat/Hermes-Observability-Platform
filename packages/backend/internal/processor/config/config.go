// Package config loads processor settings from environment variables.
package config

import (
	"os"
	"time"

	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/env"
)

type Config struct {
	DatabaseURL   string
	RedisAddr     string
	RedisPassword string

	ConsumerName string
	BatchSize    int64
	BlockTimeout time.Duration
	// ClaimMinIdle is how long a message must sit unacknowledged in another
	// consumer's pending list before this consumer takes it over.
	ClaimMinIdle time.Duration
	RetryBackoff time.Duration

	HTTPAddr string

	AlertCheckInterval time.Duration
	SMTP               SMTP
}

// SMTP is optional: without User and Password, alert emails are logged
// instead of sent.
type SMTP struct {
	Host     string
	Port     string
	User     string
	Password string
	From     string
}

func (s SMTP) Configured() bool { return s.User != "" && s.Password != "" }

func Load() (Config, error) {
	var r env.Reader
	hostname, _ := os.Hostname()
	if hostname == "" {
		hostname = "processor"
	}
	cfg := Config{
		DatabaseURL:        r.PostgresDSN(),
		RedisAddr:          r.RedisAddr(),
		RedisPassword:      r.RedisPassword(),
		ConsumerName:       r.String("PROCESSOR_CONSUMER_NAME", hostname),
		BatchSize:          int64(r.Int("PROCESSOR_BATCH_SIZE", 500)),
		BlockTimeout:       r.Duration("PROCESSOR_BLOCK_TIMEOUT", 2*time.Second),
		ClaimMinIdle:       r.Duration("PROCESSOR_CLAIM_MIN_IDLE", time.Minute),
		RetryBackoff:       r.Duration("PROCESSOR_RETRY_BACKOFF", 5*time.Second),
		HTTPAddr:           r.String("PROCESSOR_HTTP_ADDR", ":4010"),
		AlertCheckInterval: r.Duration("ALERT_CHECK_INTERVAL", 30*time.Second),
		SMTP: SMTP{
			Host:     r.String("SMTP_HOST", "smtp.gmail.com"),
			Port:     r.String("SMTP_PORT", "587"),
			User:     os.Getenv("SMTP_USER"),
			Password: os.Getenv("SMTP_PASSWORD"),
			From:     r.String("SMTP_FROM", "alerts@hermes.io"),
		},
	}
	return cfg, r.Err()
}
