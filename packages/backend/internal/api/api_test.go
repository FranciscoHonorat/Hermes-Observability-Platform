package api

// Integration tests: they run the real handlers against Postgres (with
// docker/init-db.sql applied) and Redis. They are skipped unless both are
// configured, e.g.:
//
//	docker run -d --rm -p 55432:5432 -e POSTGRES_USER=hermes -e POSTGRES_PASSWORD=test \
//	  -e POSTGRES_DB=hermes_observability \
//	  -v $PWD/docker/init-db.sql:/docker-entrypoint-initdb.d/init.sql:ro timescale/timescaledb:latest-pg15
//	docker run -d --rm -p 56379:6379 redis:7-alpine
//	TEST_DATABASE_URL=postgres://hermes:test@localhost:55432/hermes_observability?sslmode=disable \
//	TEST_REDIS_ADDR=localhost:56379 go test ./internal/api/
//
// Every test signs up its own tenant, so they can share one database.

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"

	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/auth"
	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/streams"
)

type env struct {
	t   *testing.T
	db  *pgxpool.Pool
	rdb *redis.Client
	h   http.Handler
}

func setup(t *testing.T) *env {
	t.Helper()
	dsn, addr := os.Getenv("TEST_DATABASE_URL"), os.Getenv("TEST_REDIS_ADDR")
	if dsn == "" || addr == "" {
		t.Skip("TEST_DATABASE_URL and TEST_REDIS_ADDR not set")
	}
	db, err := pgxpool.New(context.Background(), dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(db.Close)
	rdb := redis.NewClient(&redis.Options{Addr: addr})
	t.Cleanup(func() { rdb.Close() })
	srv := New(db, rdb, auth.NewSigner("test-secret"), Config{
		CORSOrigins: []string{"*"}, RateLimit: 100000, AuthRateLimit: 100000, RateWindow: time.Minute,
	}, slog.New(slog.NewTextHandler(testLog{t}, nil)))
	return &env{t: t, db: db, rdb: rdb, h: srv.Handler()}
}

// testLog routes server logs to t.Log, shown only when a test fails.
type testLog struct{ t *testing.T }

func (l testLog) Write(p []byte) (int, error) {
	l.t.Log(strings.TrimSpace(string(p)))
	return len(p), nil
}

type resp struct {
	code   int
	body   map[string]any
	header http.Header
}

func (e *env) do(method, path, cookie string, body any) resp {
	e.t.Helper()
	var rd io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rd = strings.NewReader(string(b))
	}
	r := httptest.NewRequest(method, path, rd)
	if cookie != "" {
		r.AddCookie(&http.Cookie{Name: auth.CookieName, Value: cookie})
	}
	w := httptest.NewRecorder()
	e.h.ServeHTTP(w, r)
	out := resp{code: w.Code, header: w.Header()}
	_ = json.Unmarshal(w.Body.Bytes(), &out.body)
	return out
}

func sessionCookie(t *testing.T, r resp) string {
	t.Helper()
	for _, c := range (&http.Response{Header: r.header}).Cookies() {
		if c.Name == auth.CookieName {
			return c.Value
		}
	}
	t.Fatalf("no session cookie in %v", r.header)
	return ""
}

var seq atomic.Int64

// tenantFixture signs up a fresh tenant and returns its admin's cookie,
// tenant id and slug.
type tenantFixture struct {
	admin    string
	tenantID int32
	slug     string
}

func (e *env) newTenant() tenantFixture {
	e.t.Helper()
	name := fmt.Sprintf("Test %s %d %d", e.t.Name(), time.Now().UnixNano(), seq.Add(1))
	r := e.do("POST", "/api/v1/auth/signup", "", map[string]any{"tenantName": name, "email": "admin@x.io", "password": "password123"})
	if r.code != http.StatusCreated {
		e.t.Fatalf("signup: %d %v", r.code, r.body)
	}
	tn := r.body["tenant"].(map[string]any)
	return tenantFixture{admin: sessionCookie(e.t, r), tenantID: int32(tn["id"].(float64)), slug: tn["slug"].(string)}
}

// viewer creates a viewer in the tenant and returns its session cookie.
func (e *env) viewer(tf tenantFixture) string {
	e.t.Helper()
	if r := e.do("POST", "/api/v1/admin/users", tf.admin, map[string]any{"email": "viewer@x.io", "password": "password123"}); r.code != http.StatusCreated {
		e.t.Fatalf("create viewer: %d %v", r.code, r.body)
	}
	r := e.do("POST", "/api/v1/auth/login", "", map[string]any{"tenantSlug": tf.slug, "email": "viewer@x.io", "password": "password123"})
	if r.code != http.StatusOK {
		e.t.Fatalf("viewer login: %d %v", r.code, r.body)
	}
	return sessionCookie(e.t, r)
}

func (e *env) exec(sql string, args ...any) {
	e.t.Helper()
	if _, err := e.db.Exec(context.Background(), sql, args...); err != nil {
		e.t.Fatal(err)
	}
}

func expect(t *testing.T, r resp, code int) {
	t.Helper()
	if r.code != code {
		t.Fatalf("status %d, want %d: %v", r.code, code, r.body)
	}
}

func TestSignupAndLogin(t *testing.T) {
	e := setup(t)

	expect(t, e.do("POST", "/api/v1/auth/signup", "", map[string]any{"email": "a@x.io", "password": "password123"}), 400)
	expect(t, e.do("POST", "/api/v1/auth/signup", "", map[string]any{"tenantName": "x", "email": "a@x.io", "password": "short"}), 400)

	tf := e.newTenant()
	me := e.do("GET", "/api/v1/auth/me", tf.admin, nil)
	expect(t, me, 200)
	if me.body["role"] != "admin" || me.body["tenant_slug"] != tf.slug || me.body["email"] != "admin@x.io" {
		t.Fatalf("me: %v", me.body)
	}

	expect(t, e.do("POST", "/api/v1/auth/login", "", map[string]any{"tenantSlug": tf.slug}), 400)
	expect(t, e.do("POST", "/api/v1/auth/login", "", map[string]any{"tenantSlug": "nope", "email": "admin@x.io", "password": "password123"}), 401)
	expect(t, e.do("POST", "/api/v1/auth/login", "", map[string]any{"tenantSlug": tf.slug, "email": "admin@x.io", "password": "wrong-password"}), 401)
	ok := e.do("POST", "/api/v1/auth/login", "", map[string]any{"tenantSlug": tf.slug, "email": "admin@x.io", "password": "password123"})
	expect(t, ok, 200)
	sessionCookie(t, ok)

	out := e.do("POST", "/api/v1/auth/logout", "", nil)
	expect(t, out, 200)
	if !strings.Contains(out.header.Get("Set-Cookie"), "Max-Age=0") {
		t.Fatalf("logout did not clear cookie: %v", out.header)
	}
	expect(t, e.do("GET", "/api/v1/auth/me", "", nil), 401)
}

func TestSignupSlugCollisionGetsSuffix(t *testing.T) {
	e := setup(t)
	name := fmt.Sprintf("Collide %d", time.Now().UnixNano())
	body := map[string]any{"tenantName": name, "email": "a@x.io", "password": "password123"}
	first, second := e.do("POST", "/api/v1/auth/signup", "", body), e.do("POST", "/api/v1/auth/signup", "", body)
	expect(t, first, 201)
	expect(t, second, 201)
	s1 := first.body["tenant"].(map[string]any)["slug"].(string)
	s2 := second.body["tenant"].(map[string]any)["slug"].(string)
	if s1 == s2 || !strings.HasPrefix(s2, s1+"-") {
		t.Fatalf("slugs %q %q", s1, s2)
	}
}

func TestAlertRulesCRUDAndRoles(t *testing.T) {
	e := setup(t)
	tf := e.newTenant()
	viewer := e.viewer(tf)
	rule := map[string]any{"name": "High CPU", "metric_name": "cpu", "condition": "gt", "threshold": 90, "email_recipients": []string{"ops@x.io"}}

	expect(t, e.do("POST", "/api/v1/alerts", "", rule), 401)
	expect(t, e.do("POST", "/api/v1/alerts", viewer, rule), 403)
	bad := e.do("POST", "/api/v1/alerts", tf.admin, map[string]any{"name": "x", "metric_name": "cpu", "condition": "between", "threshold": 1, "email_recipients": []string{"a@x.io"}})
	expect(t, bad, 400)
	if bad.body["error"] != "Alert rule condition must be one of: gt, lt, eq" {
		t.Fatalf("message: %v", bad.body)
	}
	expect(t, e.do("POST", "/api/v1/alerts", tf.admin, map[string]any{"name": "x", "metric_name": "cpu", "condition": "gt", "threshold": "1", "email_recipients": []string{"a@x.io"}}), 400)
	expect(t, e.do("POST", "/api/v1/alerts", tf.admin, map[string]any{"name": "x", "metric_name": "cpu", "condition": "gt", "threshold": 1, "email_recipients": []string{"nope"}}), 400)

	created := e.do("POST", "/api/v1/alerts", tf.admin, rule)
	expect(t, created, 201)
	if created.body["enabled"] != true || created.body["description"] != nil {
		t.Fatalf("defaults: %v", created.body)
	}
	id := int(created.body["id"].(float64))
	path := fmt.Sprintf("/api/v1/alerts/%d", id)

	listed := e.do("GET", "/api/v1/alerts", viewer, nil)
	expect(t, listed, 200)
	if listed.body["count"] != 1.0 {
		t.Fatalf("list: %v", listed.body)
	}

	upd := e.do("PUT", path, tf.admin, map[string]any{"enabled": false})
	expect(t, upd, 200)
	if upd.body["enabled"] != false || upd.body["name"] != "High CPU" {
		t.Fatalf("partial update: %v", upd.body)
	}
	expect(t, e.do("PUT", path, tf.admin, map[string]any{"name": ""}), 400)
	expect(t, e.do("GET", "/api/v1/alerts?enabled=true", viewer, nil).with(t, func(b map[string]any) bool { return b["count"] == 0.0 }), 200)

	e.exec(`INSERT INTO alert_history (tenant_id, alert_rule_id, app_name, triggered_at, metric_value) VALUES ($1, $2, 'api', NOW(), 95)`, tf.tenantID, id)
	hist := e.do("GET", path+"/history", viewer, nil)
	expect(t, hist, 200)
	if hist.body["count"] != 1.0 || hist.body["alert_id"] != float64(id) {
		t.Fatalf("history: %v", hist.body)
	}

	// Another tenant can neither see nor touch the rule.
	other := e.newTenant()
	expect(t, e.do("GET", path, other.admin, nil), 404)
	expect(t, e.do("DELETE", path, other.admin, nil), 404)

	expect(t, e.do("DELETE", path, viewer, nil), 403)
	expect(t, e.do("DELETE", path, tf.admin, nil), 200)
	expect(t, e.do("GET", path, tf.admin, nil), 404)
	expect(t, e.do("GET", "/api/v1/alerts/abc", tf.admin, nil), 400)
}

func (r resp) with(t *testing.T, check func(map[string]any) bool) resp {
	t.Helper()
	if !check(r.body) {
		t.Fatalf("unexpected body: %v", r.body)
	}
	return r
}

func TestMetricsQueries(t *testing.T) {
	e := setup(t)
	tf := e.newTenant()
	base := time.Now().Add(-10 * time.Minute).Truncate(time.Minute)
	for i := 0; i < 3; i++ {
		e.exec(`INSERT INTO metrics (time, tenant_id, app_name, metric_name, metric_type, value, labels, stream_id)
			VALUES ($1, $2, 'api', 'cpu', 'gauge', $3, '{"host":"a"}', $4)`, base.Add(time.Duration(i)*time.Second), tf.tenantID, float64(10*(i+1)), fmt.Sprintf("%d-%d", base.UnixNano(), i))
	}
	e.exec(`INSERT INTO applications (tenant_id, name) VALUES ($1, 'api')`, tf.tenantID)

	list := e.do("GET", "/api/v1/metrics?appName=api&limit=2", tf.admin, nil)
	expect(t, list, 200)
	rows := list.body["metrics"].([]any)
	first := rows[0].(map[string]any)
	if len(rows) != 2 || first["value"] != 30.0 || first["labels"].(map[string]any)["host"] != "a" {
		t.Fatalf("metrics: %v", list.body)
	}
	// Dates keep the Date.toJSON() shape the UI has always parsed.
	if ts := first["time"].(string); len(ts) != len("2006-01-02T15:04:05.000Z") || !strings.HasSuffix(ts, "Z") {
		t.Fatalf("time format %q", ts)
	}

	from, to := base.Add(-time.Minute).UnixMilli(), base.Add(time.Minute).UnixMilli()
	ts := e.do("GET", fmt.Sprintf("/api/v1/metrics/timeseries?appName=api&metricName=cpu&from=%d&to=%d", from, to), tf.admin, nil)
	expect(t, ts, 200)
	pt := ts.body["timeseries"].([]any)[0].(map[string]any)
	if pt["avg_value"] != 20.0 || pt["max_value"] != 30.0 || pt["count"] != 3.0 {
		t.Fatalf("timeseries: %v", ts.body)
	}
	expect(t, e.do("GET", "/api/v1/metrics/timeseries?appName=api", tf.admin, nil), 400)
	expect(t, e.do("GET", fmt.Sprintf("/api/v1/metrics/timeseries?appName=api&metricName=cpu&from=%d&to=%d&interval=banana", from, to), tf.admin, nil), 400)
	expect(t, e.do("GET", "/api/v1/metrics?limit=abc", tf.admin, nil), 400)

	expect(t, e.do("GET", "/api/v1/metrics/latest", tf.admin, nil).with(t, func(b map[string]any) bool { return b["count"] == 1.0 }), 200)
	expect(t, e.do("GET", "/api/v1/metrics/names", tf.admin, nil).with(t, func(b map[string]any) bool { return b["count"] == 1.0 }), 200)

	apps := e.do("GET", "/api/v1/applications", tf.admin, nil)
	expect(t, apps, 200)
	if a := apps.body["applications"].([]any)[0].(map[string]any); a["name"] != "api" || a["is_active"] != true {
		t.Fatalf("applications: %v", apps.body)
	}
	expect(t, e.do("GET", "/api/v1/applications/api/metrics?limit=1", tf.admin, nil).with(t, func(b map[string]any) bool { return b["count"] == 1.0 }), 200)
	expect(t, e.do("GET", "/api/v1/applications/missing", tf.admin, nil), 404)

	// Other tenants see nothing.
	other := e.newTenant()
	expect(t, e.do("GET", "/api/v1/metrics", other.admin, nil).with(t, func(b map[string]any) bool { return b["count"] == 0.0 }), 200)
}

func TestTracesLogsAndServiceMap(t *testing.T) {
	e := setup(t)
	tf := e.newTenant()
	trace := fmt.Sprintf("%032x", time.Now().UnixNano())
	start := time.Now().Add(-time.Minute)
	e.exec(`INSERT INTO spans (trace_id, span_id, tenant_id, parent_span_id, service_name, operation_name, start_time, duration_ms, status)
		VALUES ($1, 'aaaaaaaaaaaaaaaa', $2, NULL, 'gateway', 'GET /', $3, 100, 'ok'),
		       ($1, 'bbbbbbbbbbbbbbbb', $2, 'aaaaaaaaaaaaaaaa', 'users', 'SELECT', $4, 20, 'error')`,
		trace, tf.tenantID, start, start.Add(10*time.Millisecond))
	e.exec(`INSERT INTO logs (time, tenant_id, app_name, level, message, trace_id, attributes, stream_id)
		VALUES ($1, $2, 'gateway', 'warn', 'slow upstream', $3, '{"k":1}', 'l-1'),
		       ($1, $2, 'gateway', 'info', 'no trace here', NULL, NULL, 'l-2')`, start, tf.tenantID, trace)

	traces := e.do("GET", "/api/v1/traces", tf.admin, nil)
	expect(t, traces, 200)
	tr := traces.body["traces"].([]any)[0].(map[string]any)
	if tr["traceId"] != trace || tr["rootService"] != "gateway" || tr["spanCount"] != 2.0 || tr["hasError"] != true ||
		tr["durationMs"] != 100.0 || tr["startTime"] != float64(start.UnixMilli()) {
		t.Fatalf("trace summary: %v", tr)
	}

	detail := e.do("GET", "/api/v1/traces/"+trace, tf.admin, nil)
	expect(t, detail, 200)
	spans := detail.body["spans"].([]any)
	if _, has := spans[0].(map[string]any)["parentSpanId"]; has || spans[1].(map[string]any)["parentSpanId"] != "aaaaaaaaaaaaaaaa" {
		t.Fatalf("spans: %v", spans)
	}
	other := e.newTenant()
	expect(t, e.do("GET", "/api/v1/traces/"+trace, other.admin, nil), 404)

	logs := e.do("GET", "/api/v1/logs?search=SLOW", tf.admin, nil)
	expect(t, logs, 200)
	l := logs.body["logs"].([]any)
	if len(l) != 1 || l[0].(map[string]any)["serviceName"] != "gateway" || l[0].(map[string]any)["traceId"] != trace {
		t.Fatalf("logs: %v", logs.body)
	}
	noTrace := e.do("GET", "/api/v1/logs?level=info", tf.admin, nil).body["logs"].([]any)[0].(map[string]any)
	if _, has := noTrace["traceId"]; has {
		t.Fatalf("traceId should be omitted: %v", noTrace)
	}

	sm := e.do("GET", "/api/v1/service-map", tf.admin, nil)
	expect(t, sm, 200)
	edge := sm.body["edges"].([]any)[0].(map[string]any)
	if edge["source"] != "gateway" || edge["target"] != "users" || edge["errorCount"] != 1.0 {
		t.Fatalf("edges: %v", sm.body)
	}
	nodes := sm.body["nodes"].([]any)
	if users := nodes[1].(map[string]any); users["serviceName"] != "users" || users["errorRate"] != 1.0 {
		t.Fatalf("nodes: %v", nodes)
	}
}

func TestServiceMapNodeStatsSumIncomingEdges(t *testing.T) {
	nodes := buildNodes([]serviceEdge{
		{Source: "a", Target: "c", CallCount: 3, ErrorCount: 1},
		{Source: "b", Target: "c", CallCount: 1, ErrorCount: 1},
	})
	// Order is first appearance: a, c (edge 1), then b.
	if len(nodes) != 3 || nodes[1].ServiceName != "c" || nodes[1].CallCount != 4 || nodes[1].ErrorRate != 0.5 ||
		nodes[0].ServiceName != "a" || nodes[0].CallCount != 0 || nodes[2].ServiceName != "b" {
		t.Fatalf("%+v", nodes)
	}
}

func TestInsights(t *testing.T) {
	e := setup(t)
	tf := e.newTenant()
	viewer := e.viewer(tf)
	var anomalyID, recID int64
	ctx := context.Background()
	if err := e.db.QueryRow(ctx, `INSERT INTO anomalies (tenant_id, time, app_name, metric_name, value, anomaly_score, severity)
		VALUES ($1, NOW(), 'api', 'cpu', 99, 0.9, 'critical') RETURNING id`, tf.tenantID).Scan(&anomalyID); err != nil {
		t.Fatal(err)
	}
	if err := e.db.QueryRow(ctx, `INSERT INTO recommendations (tenant_id, app_name, category, title, description)
		VALUES ($1, 'api', 'latency', 'Add an index', 'Slow query') RETURNING id`, tf.tenantID).Scan(&recID); err != nil {
		t.Fatal(err)
	}

	expect(t, e.do("GET", "/api/v1/anomalies?severity=critical&appName=api", viewer, nil).with(t, func(b map[string]any) bool { return b["count"] == 1.0 }), 200)
	expect(t, e.do("GET", fmt.Sprintf("/api/v1/anomalies/%d", anomalyID), viewer, nil), 200)
	expect(t, e.do("GET", "/api/v1/anomalies/999999999", viewer, nil), 404)

	recPath := fmt.Sprintf("/api/v1/recommendations/%d", recID)
	expect(t, e.do("GET", "/api/v1/recommendations?status=open", viewer, nil).with(t, func(b map[string]any) bool { return b["count"] == 1.0 }), 200)
	expect(t, e.do("PUT", recPath, viewer, map[string]any{"status": "dismissed"}), 403)
	expect(t, e.do("PUT", recPath, tf.admin, map[string]any{"status": "done"}), 400)
	expect(t, e.do("PUT", recPath, tf.admin, map[string]any{"status": "acknowledged"}).with(t, func(b map[string]any) bool { return b["status"] == "acknowledged" }), 200)
	expect(t, e.do("PUT", "/api/v1/recommendations/999999999", tf.admin, map[string]any{"status": "open"}), 404)

	other := e.newTenant()
	expect(t, e.do("GET", recPath, other.admin, nil), 404)
}

func TestAdminUsers(t *testing.T) {
	e := setup(t)
	tf := e.newTenant()
	viewer := e.viewer(tf)

	expect(t, e.do("GET", "/api/v1/admin/users", "", nil), 401)
	expect(t, e.do("GET", "/api/v1/admin/users", viewer, nil), 403)
	expect(t, e.do("GET", "/api/v1/admin/users", tf.admin, nil).with(t, func(b map[string]any) bool { return b["count"] == 2.0 }), 200)
	expect(t, e.do("POST", "/api/v1/admin/users", tf.admin, map[string]any{"email": "z@x.io", "password": "password123", "role": "root"}), 400)
	expect(t, e.do("POST", "/api/v1/admin/users", tf.admin, map[string]any{"email": "viewer@x.io", "password": "password123"}), 409)

	created := e.do("POST", "/api/v1/admin/users", tf.admin, map[string]any{"email": "new@x.io", "password": "password123", "role": "admin"})
	expect(t, created, 201)
	id := int(created.body["id"].(float64))
	expect(t, e.do("PUT", fmt.Sprintf("/api/v1/admin/users/%d/role", id), tf.admin, map[string]any{"role": "viewer"}).with(t, func(b map[string]any) bool { return b["role"] == "viewer" }), 200)

	me := e.do("GET", "/api/v1/auth/me", tf.admin, nil)
	expect(t, e.do("DELETE", fmt.Sprintf("/api/v1/admin/users/%d", int(me.body["id"].(float64))), tf.admin, nil), 400)
	expect(t, e.do("DELETE", fmt.Sprintf("/api/v1/admin/users/%d", id), tf.admin, nil), 200)

	other := e.newTenant()
	expect(t, e.do("DELETE", fmt.Sprintf("/api/v1/admin/users/%d", int(me.body["id"].(float64))), other.admin, nil), 404)
}

func TestAPIKeys(t *testing.T) {
	e := setup(t)
	tf := e.newTenant()
	ctx := context.Background()

	created := e.do("POST", "/api/v1/admin/api-keys", tf.admin, map[string]any{"label": "ci"})
	expect(t, created, 201)
	raw := created.body["key"].(string)
	if len(raw) != 64 || created.body["label"] != "ci" {
		t.Fatalf("created: %v", created.body)
	}
	hash := auth.HashAPIKey(raw)
	if got, _ := e.rdb.HGet(ctx, streams.APIKeys, hash).Result(); got != fmt.Sprint(tf.tenantID) {
		t.Fatalf("redis cache: %q", got)
	}
	list := e.do("GET", "/api/v1/admin/api-keys", tf.admin, nil)
	if _, leaked := list.body["apiKeys"].([]any)[0].(map[string]any)["key"]; leaked || list.body["count"] != 1.0 {
		t.Fatalf("list: %v", list.body)
	}

	// A wiped cache is rebuilt from Postgres.
	e.rdb.HDel(ctx, streams.APIKeys, hash)
	if _, _, err := SyncAPIKeys(ctx, e.db, e.rdb); err != nil {
		t.Fatal(err)
	}
	if exists, _ := e.rdb.HExists(ctx, streams.APIKeys, hash).Result(); !exists {
		t.Fatal("sync did not restore key")
	}

	path := fmt.Sprintf("/api/v1/admin/api-keys/%d", int(created.body["id"].(float64)))
	expect(t, e.do("DELETE", path, tf.admin, nil), 200)
	if exists, _ := e.rdb.HExists(ctx, streams.APIKeys, hash).Result(); exists {
		t.Fatal("revoked key still cached")
	}
	expect(t, e.do("DELETE", path, tf.admin, nil), 404)

	// Sync removes revoked keys that linger in the cache.
	e.rdb.HSet(ctx, streams.APIKeys, hash, tf.tenantID)
	if _, _, err := SyncAPIKeys(ctx, e.db, e.rdb); err != nil {
		t.Fatal(err)
	}
	if exists, _ := e.rdb.HExists(ctx, streams.APIKeys, hash).Result(); exists {
		t.Fatal("sync kept a revoked key")
	}
}

func TestHealthAndNotFound(t *testing.T) {
	e := setup(t)
	expect(t, e.do("GET", "/health", "", nil).with(t, func(b map[string]any) bool { return b["status"] == "ok" }), 200)
	expect(t, e.do("GET", "/api/v1/nope", "", nil), 404)
}
