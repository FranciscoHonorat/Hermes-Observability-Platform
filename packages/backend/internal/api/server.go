// Package api serves the dashboard's REST API: telemetry queries, alert
// rules, insights, sessions (signup/login) and tenant administration.
//
// It replaces three former Node services (api, users, admin) with the same
// routes, so the UI and existing sessions keep working unchanged.
package api

import (
	"errors"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/auth"
	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/httpx"
)

const maxBodyBytes = 1 << 20

type Config struct {
	CORSOrigins []string
	// SecureCookies marks the session cookie Secure (production, HTTPS).
	SecureCookies bool
	RateLimit     int
	RateWindow    time.Duration
	// AuthRateLimit applies to signup and login on top of RateLimit.
	AuthRateLimit int
	TrustedHops   int
}

type Server struct {
	db      *pgxpool.Pool
	rdb     *redis.Client
	signer  *auth.Signer
	cfg     Config
	log     *slog.Logger
	started time.Time
}

func New(db *pgxpool.Pool, rdb *redis.Client, signer *auth.Signer, cfg Config, log *slog.Logger) *Server {
	return &Server{db: db, rdb: rdb, signer: signer, cfg: cfg, log: log, started: time.Now()}
}

func (s *Server) Handler() http.Handler {
	clientIP := httpx.ClientIP(s.cfg.TrustedHops)
	authLimit := httpx.NewRateLimiter(s.cfg.AuthRateLimit, s.cfg.RateWindow).Middleware(clientIP)

	mux := http.NewServeMux()
	// Public.
	mux.HandleFunc("GET /health", s.health)
	mux.HandleFunc("GET /{$}", s.index)
	mux.Handle("POST /api/v1/auth/signup", authLimit(s.handle(s.signup)))
	mux.Handle("POST /api/v1/auth/login", authLimit(s.handle(s.login)))
	mux.Handle("POST /api/v1/auth/logout", s.handle(s.logout))

	// Any signed-in user.
	user := func(pattern string, h handlerFunc) { mux.Handle(pattern, s.signer.Authenticate(s.handle(h))) }
	user("GET /api/v1/auth/me", s.me)
	user("GET /api/v1/metrics", s.listMetrics)
	user("GET /api/v1/metrics/timeseries", s.metricTimeseries)
	user("GET /api/v1/metrics/names", s.metricNames)
	user("GET /api/v1/metrics/latest", s.latestMetrics)
	user("GET /api/v1/applications", s.listApplications)
	user("GET /api/v1/applications/{name}", s.getApplication)
	user("GET /api/v1/applications/{name}/metrics", s.applicationMetrics)
	user("GET /api/v1/alerts", s.listAlertRules)
	user("GET /api/v1/alerts/{id}", s.getAlertRule)
	user("GET /api/v1/alerts/{id}/history", s.alertHistory)
	user("GET /api/v1/traces", s.listTraces)
	user("GET /api/v1/traces/{traceId}", s.getTrace)
	user("GET /api/v1/logs", s.listLogs)
	user("GET /api/v1/service-map", s.serviceMap)
	user("GET /api/v1/anomalies", s.listAnomalies)
	user("GET /api/v1/anomalies/{id}", s.getAnomaly)
	user("GET /api/v1/recommendations", s.listRecommendations)
	user("GET /api/v1/recommendations/{id}", s.getRecommendation)

	// Tenant admins only.
	admin := func(pattern string, h handlerFunc) {
		mux.Handle(pattern, s.signer.Authenticate(auth.RequireRole(auth.RoleAdmin)(s.handle(h))))
	}
	admin("POST /api/v1/alerts", s.createAlertRule)
	admin("PUT /api/v1/alerts/{id}", s.updateAlertRule)
	admin("DELETE /api/v1/alerts/{id}", s.deleteAlertRule)
	admin("PUT /api/v1/recommendations/{id}", s.updateRecommendation)
	admin("GET /api/v1/admin/users", s.listUsers)
	admin("POST /api/v1/admin/users", s.createUser)
	admin("PUT /api/v1/admin/users/{id}/role", s.updateUserRole)
	admin("DELETE /api/v1/admin/users/{id}", s.deleteUser)
	admin("GET /api/v1/admin/api-keys", s.listAPIKeys)
	admin("POST /api/v1/admin/api-keys", s.createAPIKey)
	admin("DELETE /api/v1/admin/api-keys/{id}", s.revokeAPIKey)

	mux.HandleFunc("/", httpx.NotFound)

	return httpx.Chain(mux,
		httpx.Recover(s.log),
		httpx.SecurityHeaders,
		httpx.CORS(s.cfg.CORSOrigins, true),
		httpx.NewRateLimiter(s.cfg.RateLimit, s.cfg.RateWindow).Middleware(clientIP),
		httpx.AccessLog(s.log, clientIP),
	)
}

// handlerFunc returns an error instead of writing one; handle maps
// *httpError to its status and anything else to a logged 500.
type handlerFunc func(w http.ResponseWriter, r *http.Request) error

type httpError struct {
	status int
	msg    string
}

func (e *httpError) Error() string { return e.msg }

func badRequest(msg string) error { return &httpError{http.StatusBadRequest, msg} }
func notFound(msg string) error   { return &httpError{http.StatusNotFound, msg} }

func (s *Server) handle(h handlerFunc) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		err := h(w, r)
		if err == nil || errors.Is(err, errDecoded) {
			return
		}
		var he *httpError
		if errors.As(err, &he) {
			httpx.Error(w, he.status, he.msg)
			return
		}
		httpx.InternalError(w, r, s.log, err)
	})
}

// decode reads the JSON body into dst; errDecoded means a 4xx response was
// already written.
func decode(w http.ResponseWriter, r *http.Request, dst any) error {
	if !httpx.DecodeJSON(w, r, maxBodyBytes, dst) {
		return errDecoded
	}
	return nil
}

// errDecoded signals that DecodeJSON already answered the request.
var errDecoded = errors.New("request body rejected")

func (s *Server) health(w http.ResponseWriter, r *http.Request) {
	status, code := "ok", http.StatusOK
	if err := s.db.Ping(r.Context()); err != nil {
		status, code = "database unavailable", http.StatusServiceUnavailable
	}
	httpx.WriteJSON(w, code, map[string]any{
		"status":    status,
		"service":   "hermes-api",
		"timestamp": time.Now().UTC().Format(time.RFC3339Nano),
		"uptime":    time.Since(s.started).Seconds(),
	})
}

func (s *Server) index(w http.ResponseWriter, _ *http.Request) {
	httpx.WriteJSON(w, http.StatusOK, map[string]any{
		"service": "Hermes API",
		"endpoints": map[string]string{
			"health":          "/health",
			"auth":            "/api/v1/auth/{signup,login,logout,me}",
			"metrics":         "/api/v1/metrics",
			"applications":    "/api/v1/applications",
			"alerts":          "/api/v1/alerts",
			"traces":          "/api/v1/traces",
			"logs":            "/api/v1/logs",
			"serviceMap":      "/api/v1/service-map",
			"anomalies":       "/api/v1/anomalies",
			"recommendations": "/api/v1/recommendations",
			"admin":           "/api/v1/admin/{users,api-keys}",
		},
	})
}

func session(r *http.Request) auth.Session {
	sess, _ := auth.FromContext(r.Context())
	return sess
}
