package pipeline

import (
	"context"
	"errors"
	"testing"

	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/model"
	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/processor/store"
	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/processor/stream"
)

type fakeStore struct {
	metrics []store.MetricRow
	spans   []store.SpanRow
	logs    []store.LogRow
	apps    []store.App
	err     error
}

func (f *fakeStore) InsertMetrics(_ context.Context, r []store.MetricRow) error {
	f.metrics = append(f.metrics, r...)
	return f.err
}
func (f *fakeStore) InsertSpans(_ context.Context, r []store.SpanRow) error {
	f.spans = append(f.spans, r...)
	return f.err
}
func (f *fakeStore) InsertLogs(_ context.Context, r []store.LogRow) error {
	f.logs = append(f.logs, r...)
	return f.err
}
func (f *fakeStore) TouchApplications(_ context.Context, a []store.App) error {
	f.apps = append(f.apps, a...)
	return nil
}

func decodeItem[T interface{ Validate() error }](t *testing.T, id, data string) stream.Item[T] {
	t.Helper()
	v, err := model.Decode[T]([]byte(data))
	if err != nil {
		t.Fatal(err)
	}
	return stream.Item[T]{ID: id, Value: v}
}

func TestMetricsMapsRowsAndDefaults(t *testing.T) {
	s := &fakeStore{}
	err := Metrics(s).Persist(context.Background(), []stream.Item[model.Metric]{
		decodeItem[model.Metric](t, "1-0", `{"name":"cpu","type":"gauge","value":1,"timestamp":1,"tenantId":7,"labels":{"a":"b"},"metadata":{"service":"api"}}`),
		decodeItem[model.Metric](t, "2-0", `{"name":"mem","type":"gauge","value":2,"timestamp":2}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	if r := s.metrics[0]; r.StreamID != "1-0" || r.TenantID != 7 || r.AppName != "api" || r.Labels != `{"a":"b"}` {
		t.Fatalf("unexpected row: %+v", r)
	}
	if r := s.metrics[1]; r.TenantID != 1 || r.AppName != "unknown" || r.Labels != "{}" {
		t.Fatalf("defaults not applied: %+v", r)
	}
	if len(s.apps) != 2 {
		t.Fatalf("want 2 app touches, got %d", len(s.apps))
	}
}

func TestLogsKeepsOptionalIDs(t *testing.T) {
	s := &fakeStore{}
	err := Logs(s).Persist(context.Background(), []stream.Item[model.LogEntry]{
		decodeItem[model.LogEntry](t, "1-0", `{"serviceName":"api","level":"info","message":"hi","timestamp":1,"traceId":"0123456789abcdef0123456789abcdef"}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	if r := s.logs[0]; r.TraceID == nil || r.SpanID != nil || r.StreamID != "1-0" {
		t.Fatalf("unexpected row: %+v", r)
	}
}

func TestInsertErrorSkipsApplications(t *testing.T) {
	boom := errors.New("connection refused")
	s := &fakeStore{err: boom}
	err := Spans(s).Persist(context.Background(), []stream.Item[model.Span]{
		decodeItem[model.Span](t, "1-0", `{"traceId":"0123456789abcdef0123456789abcdef","spanId":"0123456789abcdef","serviceName":"api","operationName":"x","startTime":1,"duration":1,"status":"ok"}`),
	})
	if !errors.Is(err, boom) {
		t.Fatalf("want %v, got %v", boom, err)
	}
	if len(s.apps) != 0 {
		t.Fatal("applications touched despite failed insert")
	}
}
