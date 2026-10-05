// Package logx builds the JSON logger every service uses.
package logx

import (
	"log/slog"
	"os"
)

// New returns a JSON logger tagged with service, at the level in LOG_LEVEL
// (debug, info, warn, error; default info).
func New(service string) *slog.Logger {
	var lvl slog.Level
	if err := lvl.UnmarshalText([]byte(os.Getenv("LOG_LEVEL"))); err != nil {
		lvl = slog.LevelInfo
	}
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: lvl})).With("service", service)
}
