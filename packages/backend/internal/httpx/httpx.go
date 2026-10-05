// Package httpx holds the HTTP plumbing shared by the collector and the api:
// JSON helpers, middleware (security headers, CORS, rate limiting, access
// log, panic recovery) and graceful serving.
package httpx

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"time"

	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/jsonx"
)

// WriteJSON writes v as JSON with the given status.
func WriteJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

// Error writes the {"error": msg} body every Hermes endpoint uses.
func Error(w http.ResponseWriter, status int, msg string) {
	WriteJSON(w, status, map[string]string{"error": msg})
}

// InternalError logs err and hides it from the client.
func InternalError(w http.ResponseWriter, r *http.Request, log *slog.Logger, err error) {
	log.ErrorContext(r.Context(), "request failed", "method", r.Method, "path", r.URL.Path, "err", err)
	Error(w, http.StatusInternalServerError, "Internal server error")
}

// DecodeJSON reads a JSON body of at most maxBytes into dst. An empty body
// leaves dst unchanged, like express.json(). On failure it writes a 400/413
// response and returns false.
func DecodeJSON(w http.ResponseWriter, r *http.Request, maxBytes int64, dst any) bool {
	r.Body = http.MaxBytesReader(w, r.Body, maxBytes)
	err := json.NewDecoder(r.Body).Decode(dst)
	if err == nil || errors.Is(err, io.EOF) {
		return true
	}
	var tooLarge *http.MaxBytesError
	switch {
	case errors.As(err, &tooLarge):
		Error(w, http.StatusRequestEntityTooLarge, "Request body too large")
	default:
		msg, ok := jsonx.TypeError(err)
		if !ok {
			msg = "Invalid JSON body"
		}
		Error(w, http.StatusBadRequest, msg)
	}
	return false
}

// NotFound answers unmatched routes with a JSON 404.
func NotFound(w http.ResponseWriter, r *http.Request) {
	WriteJSON(w, http.StatusNotFound, map[string]string{"error": "Not found", "path": r.URL.Path, "method": r.Method})
}

// Serve runs srv until ctx is cancelled, then drains in-flight requests.
func Serve(ctx context.Context, srv *http.Server, log *slog.Logger) error {
	errCh := make(chan error, 1)
	go func() { errCh <- srv.ListenAndServe() }()
	log.Info("http server listening", "addr", srv.Addr)

	select {
	case err := <-errCh:
		return err
	case <-ctx.Done():
	}
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		return err
	}
	if err := <-errCh; !errors.Is(err, http.ErrServerClosed) {
		return err
	}
	return nil
}

// NewServer applies timeouts suited to a JSON API behind a proxy.
func NewServer(addr string, h http.Handler) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           h,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       30 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       2 * time.Minute,
	}
}
