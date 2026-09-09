package hermes

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"
)

// capturingServer records every request body posted to it, keyed by path.
type capturingServer struct {
	mu    sync.Mutex
	posts map[string][][]byte
	srv   *httptest.Server
}

func newCapturingServer() *capturingServer {
	cs := &capturingServer{posts: make(map[string][][]byte)}
	cs.srv = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		buf, _ := io.ReadAll(r.Body)
		cs.mu.Lock()
		cs.posts[r.URL.Path] = append(cs.posts[r.URL.Path], buf)
		cs.mu.Unlock()
		w.WriteHeader(http.StatusAccepted)
	}))
	return cs
}

func (cs *capturingServer) postsTo(path string) [][]byte {
	cs.mu.Lock()
	defer cs.mu.Unlock()
	return append([][]byte(nil), cs.posts[path]...)
}

func TestFlush_SendsBufferedMetricsSpansLogs(t *testing.T) {
	cs := newCapturingServer()
	defer cs.srv.Close()

	client := NewClient(WithCollectorURL(cs.srv.URL), WithServiceName("test-svc"))

	client.Increment("orders_created_total", 1, nil)
	ctx, span := client.StartSpan(context.Background(), "handle order", nil)
	span.End(SpanOK)
	client.Info(ctx, "order handled", nil)

	if err := client.Flush(); err != nil {
		t.Fatalf("Flush() error = %v", err)
	}

	metricPosts := cs.postsTo("/api/v1/metrics")
	if len(metricPosts) != 1 {
		t.Fatalf("metric POSTs = %d, want 1", len(metricPosts))
	}
	var mb MetricBatch
	if err := json.Unmarshal(metricPosts[0], &mb); err != nil {
		t.Fatalf("unmarshal metric batch: %v", err)
	}
	if len(mb.Metrics) != 1 || mb.Metrics[0].Name != "orders_created_total" {
		t.Fatalf("unexpected metric batch: %+v", mb)
	}
	if mb.Metrics[0].Metadata == nil || mb.Metrics[0].Metadata.Service != "test-svc" {
		t.Fatalf("metric metadata.service not set to configured service name: %+v", mb.Metrics[0].Metadata)
	}

	spanPosts := cs.postsTo("/api/v1/traces")
	if len(spanPosts) != 1 {
		t.Fatalf("span POSTs = %d, want 1", len(spanPosts))
	}
	var sb SpanBatch
	if err := json.Unmarshal(spanPosts[0], &sb); err != nil {
		t.Fatalf("unmarshal span batch: %v", err)
	}
	if len(sb.Spans) != 1 || sb.Spans[0].ServiceName != "test-svc" {
		t.Fatalf("unexpected span batch: %+v", sb)
	}

	logPosts := cs.postsTo("/api/v1/logs")
	if len(logPosts) != 1 {
		t.Fatalf("log POSTs = %d, want 1", len(logPosts))
	}
	var lb LogBatch
	if err := json.Unmarshal(logPosts[0], &lb); err != nil {
		t.Fatalf("unmarshal log batch: %v", err)
	}
	if len(lb.Logs) != 1 || lb.Logs[0].TraceID != span.TraceID() {
		t.Fatalf("log entry not correlated with active span: %+v (want traceId %s)", lb.Logs[0], span.TraceID())
	}
}

func TestFlush_EmptyBufferSendsNothing(t *testing.T) {
	cs := newCapturingServer()
	defer cs.srv.Close()

	client := NewClient(WithCollectorURL(cs.srv.URL), WithServiceName("test-svc"))
	if err := client.Flush(); err != nil {
		t.Fatalf("Flush() on empty buffer error = %v", err)
	}
	if n := len(cs.postsTo("/api/v1/metrics")); n != 0 {
		t.Fatalf("expected no metric POSTs on empty flush, got %d", n)
	}
}

func TestAPIKeyHeaderSentWhenConfigured(t *testing.T) {
	var gotKey string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotKey = r.Header.Get("x-api-key")
		w.WriteHeader(http.StatusAccepted)
	}))
	defer srv.Close()

	client := NewClient(WithCollectorURL(srv.URL), WithServiceName("test-svc"), WithAPIKey("secret-key"))
	client.Increment("x", 1, nil)
	_ = client.Flush()

	if gotKey != "secret-key" {
		t.Fatalf("x-api-key header = %q, want %q", gotKey, "secret-key")
	}
}

func TestStartStop_FlushesOnStop(t *testing.T) {
	cs := newCapturingServer()
	defer cs.srv.Close()

	// Long interval so the tick itself never fires — only Stop()'s flush should.
	client := NewClient(WithCollectorURL(cs.srv.URL), WithServiceName("test-svc"), WithFlushInterval(time.Hour))
	client.Start()
	client.Increment("x", 1, nil)
	client.Stop()

	if n := len(cs.postsTo("/api/v1/metrics")); n != 1 {
		t.Fatalf("metric POSTs after Stop() = %d, want 1", n)
	}
}

func TestAutoMetrics_ProduceSaneValues(t *testing.T) {
	cs := newCapturingServer()
	defer cs.srv.Close()

	client := NewClient(WithCollectorURL(cs.srv.URL), WithServiceName("test-svc"))
	client.collectAutoMetrics()
	if err := client.Flush(); err != nil {
		t.Fatalf("Flush() error = %v", err)
	}

	posts := cs.postsTo("/api/v1/metrics")
	if len(posts) != 1 {
		t.Fatalf("metric POSTs = %d, want 1", len(posts))
	}
	var mb MetricBatch
	if err := json.Unmarshal(posts[0], &mb); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	byName := make(map[string]Metric)
	for _, m := range mb.Metrics {
		byName[m.Name] = m
	}
	for _, name := range []string{"process.uptime", "go.goroutines", "process.memory.alloc", "process.memory.sys", "go.gc.pauseNs"} {
		m, ok := byName[name]
		if !ok {
			t.Errorf("expected auto-metric %q to be sent, wasn't found in batch", name)
			continue
		}
		if m.Value < 0 {
			t.Errorf("auto-metric %q = %v, want >= 0", name, m.Value)
		}
	}
	if byName["go.goroutines"].Value < 1 {
		t.Errorf("go.goroutines = %v, want >= 1 (this test's own goroutine)", byName["go.goroutines"].Value)
	}
}
