// Package env reads service configuration from environment variables.
// Variable names are shared by every Hermes service so one .env file can
// configure the whole stack.
package env

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"
)

// Reader accumulates parse errors so a service can report every bad
// variable at once instead of failing on the first.
type Reader struct {
	errs []error
}

func (r *Reader) Err() error { return errors.Join(r.errs...) }

func (r *Reader) String(name, fallback string) string {
	if v := os.Getenv(name); v != "" {
		return v
	}
	return fallback
}

func (r *Reader) Required(name string) string {
	v := os.Getenv(name)
	if v == "" {
		r.errs = append(r.errs, fmt.Errorf("missing required environment variable: %s", name))
	}
	return v
}

func (r *Reader) Int(name string, fallback int) int {
	v := os.Getenv(name)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		r.errs = append(r.errs, fmt.Errorf("%s must be a positive integer, got %q", name, v))
	}
	return n
}

func (r *Reader) Duration(name string, fallback time.Duration) time.Duration {
	v := os.Getenv(name)
	if v == "" {
		return fallback
	}
	d, err := time.ParseDuration(v)
	if err != nil || d <= 0 {
		r.errs = append(r.errs, fmt.Errorf("%s must be a positive duration like 30s or 1m, got %q", name, v))
	}
	return d
}

// NonNegative reads an integer that may be zero.
func (r *Reader) NonNegative(name string, fallback int) int {
	v := os.Getenv(name)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil || n < 0 {
		r.errs = append(r.errs, fmt.Errorf("%s must be a non-negative integer, got %q", name, v))
	}
	return n
}

// Millis reads a duration expressed in milliseconds, the unit the former
// Node services used (e.g. RATE_LIMIT_WINDOW_MS).
func (r *Reader) Millis(name string, fallback time.Duration) time.Duration {
	v := os.Getenv(name)
	if v == "" {
		return fallback
	}
	n, err := strconv.Atoi(v)
	if err != nil || n <= 0 {
		r.errs = append(r.errs, fmt.Errorf("%s must be a positive number of milliseconds, got %q", name, v))
	}
	return time.Duration(n) * time.Millisecond
}

// List splits a comma-separated variable, trimming blanks.
func (r *Reader) List(name string) []string {
	var out []string
	for _, s := range strings.Split(os.Getenv(name), ",") {
		if s = strings.TrimSpace(s); s != "" {
			out = append(out, s)
		}
	}
	return out
}

// Production reports whether HERMES_ENV (or the legacy NODE_ENV) is
// "production". Production turns on the fail-closed checks: required
// secrets, authenticated ingestion and Secure cookies.
func Production() bool {
	v := os.Getenv("HERMES_ENV")
	if v == "" {
		v = os.Getenv("NODE_ENV")
	}
	return v == "production"
}

// PostgresDSN builds a connection string from the POSTGRES_* variables.
func (r *Reader) PostgresDSN() string {
	password := r.Required("POSTGRES_PASSWORD")
	dsn := url.URL{
		Scheme: "postgres",
		User:   url.UserPassword(r.String("POSTGRES_USER", "hermes"), password),
		Host:   r.String("POSTGRES_HOST", "localhost") + ":" + r.String("POSTGRES_PORT", "5432"),
		Path:   r.String("POSTGRES_DB", "hermes_observability"),
	}
	q := dsn.Query()
	q.Set("sslmode", r.String("POSTGRES_SSLMODE", "disable"))
	q.Set("pool_max_conns", strconv.Itoa(r.Int("POSTGRES_POOL_SIZE", 10)))
	dsn.RawQuery = q.Encode()
	return dsn.String()
}

func (r *Reader) RedisAddr() string {
	return r.String("REDIS_HOST", "localhost") + ":" + r.String("REDIS_PORT", "6379")
}

func (r *Reader) RedisPassword() string { return os.Getenv("REDIS_PASSWORD") }
