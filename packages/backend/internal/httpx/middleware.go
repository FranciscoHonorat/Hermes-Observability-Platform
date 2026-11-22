package httpx

import (
	"log/slog"
	"net"
	"net/http"
	"slices"
	"strings"
	"time"
)

type Middleware func(http.Handler) http.Handler

// Chain applies middleware so the first one listed runs first.
func Chain(h http.Handler, mw ...Middleware) http.Handler {
	for i := len(mw) - 1; i >= 0; i-- {
		h = mw[i](h)
	}
	return h
}

// Recover turns a panic into a logged 500 instead of a dropped connection.
func Recover(log *slog.Logger) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			defer func() {
				if v := recover(); v != nil {
					if v == http.ErrAbortHandler {
						panic(v)
					}
					log.Error("panic serving request", "method", r.Method, "path", r.URL.Path, "panic", v)
					Error(w, http.StatusInternalServerError, "Internal server error")
				}
			}()
			next.ServeHTTP(w, r)
		})
	}
}

type statusRecorder struct {
	http.ResponseWriter
	status int
}

func (s *statusRecorder) WriteHeader(code int) {
	s.status = code
	s.ResponseWriter.WriteHeader(code)
}

// AccessLog logs each request at debug level.
func AccessLog(log *slog.Logger, ip ClientIPFunc) Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			start := time.Now()
			rec := &statusRecorder{ResponseWriter: w, status: http.StatusOK}
			next.ServeHTTP(rec, r)
			log.Debug("request", "method", r.Method, "path", r.URL.Path, "status", rec.status,
				"duration_ms", time.Since(start).Milliseconds(), "ip", ip(r))
		})
	}
}

// SecurityHeaders sets the headers helmet() used to add, tightened for an
// API that only ever returns JSON.
func SecurityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")
		h.Set("Cross-Origin-Resource-Policy", "same-origin")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Strict-Transport-Security", "max-age=15552000; includeSubDomains")
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		next.ServeHTTP(w, r)
	})
}

// CORS allows the listed origins. Listed origins are echoed back and, with
// credentials, may send cookies. "*" allows any origin but never with
// credentials: reflecting arbitrary origins alongside
// Access-Control-Allow-Credentials would let any website read the API with
// the visitor's session.
func CORS(origins []string, credentials bool) Middleware {
	anyOrigin := slices.Contains(origins, "*")
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			origin := r.Header.Get("Origin")
			h := w.Header()
			h.Add("Vary", "Origin")
			if origin != "" {
				switch {
				case slices.Contains(origins, origin):
					h.Set("Access-Control-Allow-Origin", origin)
					if credentials {
						h.Set("Access-Control-Allow-Credentials", "true")
					}
				case anyOrigin:
					h.Set("Access-Control-Allow-Origin", "*")
				}
			}
			if r.Method == http.MethodOptions && r.Header.Get("Access-Control-Request-Method") != "" {
				h.Set("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE")
				if reqHeaders := r.Header.Get("Access-Control-Request-Headers"); reqHeaders != "" {
					h.Set("Access-Control-Allow-Headers", reqHeaders)
				}
				h.Set("Access-Control-Max-Age", "600")
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// ClientIPFunc extracts the caller's address for logging and rate limiting.
type ClientIPFunc func(*http.Request) string

// ClientIP trusts the given number of reverse-proxy hops in X-Forwarded-For,
// like Express's "trust proxy". With 0 hops the header is ignored entirely,
// which is the safe choice when the service is exposed directly.
func ClientIP(trustedHops int) ClientIPFunc {
	return func(r *http.Request) string {
		if trustedHops > 0 {
			if xff := r.Header.Values("X-Forwarded-For"); len(xff) > 0 {
				var hops []string
				for _, v := range xff {
					for _, p := range strings.Split(v, ",") {
						if p = strings.TrimSpace(p); p != "" {
							hops = append(hops, p)
						}
					}
				}
				if len(hops) >= trustedHops {
					return hops[len(hops)-trustedHops]
				}
				if len(hops) > 0 {
					return hops[0]
				}
			}
		}
		host, _, err := net.SplitHostPort(r.RemoteAddr)
		if err != nil {
			return r.RemoteAddr
		}
		return host
	}
}
