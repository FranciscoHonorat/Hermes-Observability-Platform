package hermes

import (
	"context"
	"net/http"
	"time"
)

// HTTPMiddleware returns stdlib net/http middleware that starts (or
// continues, via an incoming traceparent header) a span for every request,
// and records http_requests_total / http_request_duration_ms /
// http_errors_total — the same metric names packages/agent/src/metrics/http.ts
// uses. Composes into anything built on net/http (chi, gorilla/mux, a bare
// ServeMux); framework-specific adapters (Gin, Echo) aren't included here.
func (c *Client) HTTPMiddleware() func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			ctx := r.Context()

			if traceID, parentSpanID, ok := parseTraceparent(r.Header.Get("traceparent")); ok {
				ctx = context.WithValue(ctx, spanCtxKey, spanContext{traceID: traceID, spanID: parentSpanID})
			}

			ctx, handle := c.StartSpan(ctx, r.Method+" "+r.URL.Path, map[string]any{
				"http.method": r.Method,
				"http.route":  r.URL.Path,
			})

			rw := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
			rw.Header().Set("traceparent", formatTraceparent(handle.TraceID(), handle.SpanID()))

			next.ServeHTTP(rw, r.WithContext(ctx))

			duration := float64(time.Since(start)) / float64(time.Millisecond)
			status := SpanOK
			if rw.status >= 400 {
				status = SpanError
			}
			handle.SetAttribute("http.status_code", rw.status)
			handle.End(status)

			labels := map[string]any{"method": r.Method, "path": r.URL.Path, "status": rw.status}
			c.Increment("http_requests_total", 1, labels)
			c.Histogram("http_request_duration_ms", duration, UnitMilliseconds, labels)
			if rw.status >= 400 {
				c.Increment("http_errors_total", 1, labels)
			}
		})
	}
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (r *statusRecorder) WriteHeader(status int) {
	r.status = status
	r.ResponseWriter.WriteHeader(status)
}
