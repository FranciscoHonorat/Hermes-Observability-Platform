package collector

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/auth"
	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/streams"
)

type fakeStore struct {
	keys       map[string]int32
	published  map[string][][]byte
	publishErr error
}

func (f *fakeStore) Ping(context.Context) error { return nil }
func (f *fakeStore) TenantForKey(_ context.Context, h string) (int32, bool, error) {
	t, ok := f.keys[h]
	return t, ok, nil
}
func (f *fakeStore) Publish(_ context.Context, stream string, p [][]byte) error {
	if f.publishErr != nil {
		return f.publishErr
	}
	f.published[stream] = append(f.published[stream], p...)
	return nil
}

func newTestServer(requireKey bool) (*fakeStore, http.Handler) {
	st := &fakeStore{
		keys:      map[string]int32{auth.HashAPIKey("good-key"): 7},
		published: map[string][][]byte{},
	}
	srv := New(st, Config{MaxBatchSize: 3, RequireAPIKey: requireKey, RateLimit: 1000, RateWindow: time.Minute},
		slog.New(slog.NewTextHandler(io.Discard, nil)))
	return st, srv.Handler()
}

func post(h http.Handler, path, body, key string) (*httptest.ResponseRecorder, map[string]any) {
	r := httptest.NewRequest("POST", path, strings.NewReader(body))
	r.Header.Set("Content-Type", "application/json")
	if key != "" {
		r.Header.Set("x-api-key", key)
	}
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	var out map[string]any
	_ = json.Unmarshal(w.Body.Bytes(), &out)
	return w, out
}

const goodMetric = `{"name":"cpu","type":"gauge","value":1,"unit":"percent","timestamp":1700000000000,"metadata":{"service":"api"}}`

func TestIngestAcceptsAndStampsTenant(t *testing.T) {
	st, h := newTestServer(false)
	w, out := post(h, "/api/v1/metrics", `{"metrics":[`+goodMetric+`,{"name":"x","type":"bad","value":1,"timestamp":1}]}`, "good-key")
	if w.Code != http.StatusAccepted {
		t.Fatalf("status %d: %s", w.Code, w.Body)
	}
	if out["accepted"] != 1.0 || out["rejected"] != 1.0 || out["total"] != 2.0 || out["message"] != "Metrics queued for processing" {
		t.Fatalf("response %v", out)
	}
	if errs := out["errors"].([]any); errs[0] != "Metric 1: Metric type must be one of: counter, gauge, histogram, summary" {
		t.Fatalf("errors %v", errs)
	}
	got := st.published[streams.Metrics]
	if len(got) != 1 {
		t.Fatalf("published %d", len(got))
	}
	var m map[string]any
	_ = json.Unmarshal(got[0], &m)
	// The tenant comes from the API key, and unknown fields survive.
	if m["tenantId"] != 7.0 || m["unit"] != "percent" || m["metadata"].(map[string]any)["service"] != "api" {
		t.Fatalf("payload %s", got[0])
	}
}

func TestIngestOverridesClientTenant(t *testing.T) {
	st, h := newTestServer(false)
	post(h, "/api/v1/logs", `{"logs":[{"serviceName":"a","level":"info","message":"m","timestamp":1,"tenantId":999}]}`, "")
	var m map[string]any
	_ = json.Unmarshal(st.published[streams.Logs][0], &m)
	if m["tenantId"] != 1.0 {
		t.Fatalf("client-supplied tenant not overridden: %v", m["tenantId"])
	}
}

func TestIngestAuth(t *testing.T) {
	_, dev := newTestServer(false)
	_, prod := newTestServer(true)
	tests := []struct {
		name   string
		h      http.Handler
		key    string
		status int
	}{
		{"dev without key", dev, "", http.StatusAccepted},
		{"prod without key", prod, "", http.StatusUnauthorized},
		{"wrong key", dev, "nope", http.StatusUnauthorized},
		{"good key in prod", prod, "good-key", http.StatusAccepted},
	}
	for _, tt := range tests {
		if w, _ := post(tt.h, "/api/v1/metrics", `{"metrics":[`+goodMetric+`]}`, tt.key); w.Code != tt.status {
			t.Errorf("%s: status %d, want %d", tt.name, w.Code, tt.status)
		}
	}
}

func TestIngestRejectsBadBatches(t *testing.T) {
	_, h := newTestServer(false)
	tests := []struct {
		path, body, wantErr string
	}{
		{"/api/v1/traces", `{"metrics":[]}`, "Invalid batch format"},
		{"/api/v1/metrics", `{"metrics":{}}`, "Invalid batch format"},
		{"/api/v1/metrics", `{"metrics":[1,2,3,4]}`, "Batch too large"},
		{"/api/v1/metrics", `not json`, "Invalid JSON body"},
	}
	for _, tt := range tests {
		w, out := post(h, tt.path, tt.body, "")
		if w.Code != http.StatusBadRequest || out["error"] != tt.wantErr {
			t.Errorf("%s %s: %d %v", tt.path, tt.body, w.Code, out)
		}
	}
}

func TestIngestCapsErrorList(t *testing.T) {
	st := &fakeStore{published: map[string][][]byte{}}
	srv := New(st, Config{MaxBatchSize: 100, RateLimit: 1000, RateWindow: time.Minute}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	items := strings.TrimSuffix(strings.Repeat(`{},`, 12), ",")
	_, out := post(srv.Handler(), "/api/v1/metrics", `{"metrics":[`+items+`]}`, "")
	if len(out["errors"].([]any)) != 10 || out["moreErrors"] != 2.0 || out["accepted"] != 0.0 {
		t.Fatalf("response %v", out)
	}
}

func TestIngestPublishFailure(t *testing.T) {
	st, h := newTestServer(false)
	st.publishErr = errors.New("redis down")
	if w, _ := post(h, "/api/v1/metrics", `{"metrics":[`+goodMetric+`]}`, ""); w.Code != http.StatusInternalServerError {
		t.Fatalf("status %d", w.Code)
	}
}

func TestUnknownRoute(t *testing.T) {
	_, h := newTestServer(false)
	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/nope", nil))
	if w.Code != http.StatusNotFound || !strings.Contains(w.Body.String(), `"Not found"`) {
		t.Fatalf("%d %s", w.Code, w.Body)
	}
}
