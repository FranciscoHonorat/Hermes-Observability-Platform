// Package collector receives metric, span and log batches from agents over
// HTTP, validates each item, stamps it with the caller's tenant and queues it
// on a Redis Stream for the processor.
package collector

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/auth"
	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/httpx"
	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/model"
	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/streams"
)

const (
	maxBodyBytes = 10 << 20
	// devTenantID is used for unauthenticated requests outside production
	// (the "default" tenant seeded by docker/init-db.sql).
	devTenantID = 1
	maxErrors   = 10
)

// Store is the collector's view of Redis.
type Store interface {
	// TenantForKey resolves an API key digest; ok is false for unknown keys.
	TenantForKey(ctx context.Context, keyHash string) (tenantID int32, ok bool, err error)
	// Publish appends payloads to stream in one round trip.
	Publish(ctx context.Context, stream string, payloads [][]byte) error
	Ping(ctx context.Context) error
}

type Config struct {
	MaxBatchSize int
	// RequireAPIKey rejects requests without x-api-key (production).
	RequireAPIKey bool
	RateLimit     int
	RateWindow    time.Duration
	TrustedHops   int
}

type Server struct {
	store Store
	cfg   Config
	log   *slog.Logger
}

func New(store Store, cfg Config, log *slog.Logger) *Server {
	return &Server{store: store, cfg: cfg, log: log}
}

// signal describes one ingestion endpoint.
type signal struct {
	path   string // URL segment and batch field: "metrics", "traces", "logs"
	field  string // JSON field holding the batch
	label  string // prefix for per-item error messages
	noun   string // plural used in messages
	stream string
	decode func([]byte) error
}

func validate[T interface{ Validate() error }](b []byte) error {
	_, err := model.Decode[T](b)
	return err
}

var signals = []signal{
	{"metrics", "metrics", "Metric", "metrics", streams.Metrics, validate[model.Metric]},
	{"traces", "spans", "Span", "spans", streams.Traces, validate[model.Span]},
	{"logs", "logs", "Log", "logs", streams.Logs, validate[model.LogEntry]},
}

func (s *Server) Handler() http.Handler {
	clientIP := httpx.ClientIP(s.cfg.TrustedHops)
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", s.health)
	mux.HandleFunc("GET /{$}", func(w http.ResponseWriter, r *http.Request) {
		httpx.WriteJSON(w, http.StatusOK, map[string]any{
			"service": "Hermes Collector",
			"endpoints": map[string]string{
				"health":  "/health",
				"metrics": "/api/v1/metrics",
				"traces":  "/api/v1/traces",
				"logs":    "/api/v1/logs",
			},
		})
	})
	for _, sig := range signals {
		base := "/api/v1/" + sig.path
		mux.Handle("POST "+base, s.authenticate(s.ingest(sig)))
		mux.Handle("GET "+base+"/health", s.authenticate(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			httpx.WriteJSON(w, http.StatusOK, map[string]any{"status": "ok", "endpoint": base, "maxBatchSize": s.cfg.MaxBatchSize})
		})))
	}
	mux.HandleFunc("/", httpx.NotFound)

	return httpx.Chain(mux,
		httpx.Recover(s.log),
		httpx.SecurityHeaders,
		httpx.CORS([]string{"*"}, false),
		httpx.NewRateLimiter(s.cfg.RateLimit, s.cfg.RateWindow).Middleware(clientIP),
		httpx.AccessLog(s.log, clientIP),
	)
}

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	status, code := "ok", http.StatusOK
	if err := s.store.Ping(ctx); err != nil {
		status, code = "redis unavailable", http.StatusServiceUnavailable
	}
	httpx.WriteJSON(w, code, map[string]string{
		"status":    status,
		"service":   "hermes-collector",
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
	})
}

type tenantKey struct{}

// authenticate resolves x-api-key to a tenant. Without a key, production
// rejects the request and development attributes it to the default tenant.
func (s *Server) authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key := r.Header.Get("x-api-key")
		var tenant int32 = devTenantID
		if key == "" {
			if s.cfg.RequireAPIKey {
				httpx.Error(w, http.StatusUnauthorized, "Missing or invalid API key")
				return
			}
		} else {
			t, ok, err := s.store.TenantForKey(r.Context(), auth.HashAPIKey(key))
			if err != nil {
				httpx.InternalError(w, r, s.log, err)
				return
			}
			if !ok {
				s.log.Warn("rejected invalid API key", "path", r.URL.Path)
				httpx.Error(w, http.StatusUnauthorized, "Missing or invalid API key")
				return
			}
			tenant = t
		}
		next.ServeHTTP(w, r.WithContext(context.WithValue(r.Context(), tenantKey{}, tenant)))
	})
}

type ingestResponse struct {
	Accepted   int      `json:"accepted"`
	Rejected   int      `json:"rejected"`
	Total      int      `json:"total"`
	Message    string   `json:"message"`
	Errors     []string `json:"errors,omitempty"`
	MoreErrors int      `json:"moreErrors,omitempty"`
}

func (s *Server) ingest(sig signal) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var body map[string]json.RawMessage
		if !httpx.DecodeJSON(w, r, maxBodyBytes, &body) {
			return
		}
		var items []json.RawMessage
		if err := json.Unmarshal(body[sig.field], &items); err != nil || items == nil {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]string{
				"error":   "Invalid batch format",
				"message": fmt.Sprintf("Expected { %s: [...] }", sig.field),
			})
			return
		}
		if len(items) > s.cfg.MaxBatchSize {
			httpx.WriteJSON(w, http.StatusBadRequest, map[string]any{
				"error":    "Batch too large",
				"message":  fmt.Sprintf("Maximum %d %s per batch", s.cfg.MaxBatchSize, sig.noun),
				"received": len(items),
			})
			return
		}

		tenant := r.Context().Value(tenantKey{}).(int32)
		resp := ingestResponse{Total: len(items), Message: capitalize(sig.noun) + " queued for processing"}
		payloads := make([][]byte, 0, len(items))
		for i, item := range items {
			payload, err := stamp(item, tenant, sig.decode)
			if err != nil {
				resp.Rejected++
				if len(resp.Errors) < maxErrors {
					resp.Errors = append(resp.Errors, sig.label+" "+strconv.Itoa(i)+": "+err.Error())
				} else {
					resp.MoreErrors++
				}
				continue
			}
			payloads = append(payloads, payload)
		}

		if len(payloads) > 0 {
			if err := s.store.Publish(r.Context(), sig.stream, payloads); err != nil {
				httpx.InternalError(w, r, s.log, err)
				return
			}
		}
		resp.Accepted = len(payloads)
		s.log.Debug("batch queued", "signal", sig.path, "tenant", tenant, "accepted", resp.Accepted, "rejected", resp.Rejected)
		httpx.WriteJSON(w, http.StatusAccepted, resp)
	})
}

// stamp validates item and returns it with tenantId set to the caller's
// tenant (overriding any value the client sent). Unknown fields are kept.
func stamp(item json.RawMessage, tenant int32, validate func([]byte) error) ([]byte, error) {
	if err := validate(item); err != nil {
		return nil, err
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(item, &fields); err != nil {
		return nil, err
	}
	fields["tenantId"] = json.RawMessage(strconv.Itoa(int(tenant)))
	return json.Marshal(fields)
}

func capitalize(s string) string {
	if s == "" {
		return s
	}
	return string(s[0]-'a'+'A') + s[1:]
}
