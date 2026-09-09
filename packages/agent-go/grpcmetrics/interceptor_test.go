package grpcmetrics

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	hermes "github.com/FranciscoHonorat/hermes-observability/packages/agent-go"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func newCapturingServer(t *testing.T) (*httptest.Server, func() []hermes.Metric) {
	t.Helper()
	var body []byte
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		buf, _ := io.ReadAll(r.Body)
		body = buf
		w.WriteHeader(http.StatusAccepted)
	}))
	t.Cleanup(srv.Close)
	return srv, func() []hermes.Metric {
		if body == nil {
			return nil
		}
		var mb hermes.MetricBatch
		if err := json.Unmarshal(body, &mb); err != nil {
			t.Fatalf("unmarshal metric batch: %v", err)
		}
		return mb.Metrics
	}
}

func TestUnaryServerInterceptor_RecordsSuccessMetrics(t *testing.T) {
	srv, metrics := newCapturingServer(t)
	client := hermes.NewClient(hermes.WithCollectorURL(srv.URL), hermes.WithServiceName("movies-service"))
	interceptor := UnaryServerInterceptor(client)

	info := &grpc.UnaryServerInfo{FullMethod: "/movies.MovieService/GetMovie"}
	handler := func(ctx context.Context, req any) (any, error) { return "ok", nil }

	if _, err := interceptor(context.Background(), nil, info, handler); err != nil {
		t.Fatalf("interceptor error = %v", err)
	}
	if err := client.Flush(); err != nil {
		t.Fatalf("Flush() error = %v", err)
	}

	byName := make(map[string]hermes.Metric)
	for _, m := range metrics() {
		byName[m.Name] = m
	}

	reqs, ok := byName["grpc_requests_total"]
	if !ok {
		t.Fatal("expected grpc_requests_total to be recorded")
	}
	if reqs.Labels["method"] != info.FullMethod || reqs.Labels["status"] != codes.OK.String() {
		t.Fatalf("unexpected labels: %+v", reqs.Labels)
	}
	if _, ok := byName["grpc_request_duration_ms"]; !ok {
		t.Fatal("expected grpc_request_duration_ms to be recorded")
	}
	if _, ok := byName["grpc_errors_total"]; ok {
		t.Fatal("did not expect grpc_errors_total on a successful call")
	}
}

func TestUnaryServerInterceptor_RecordsErrorMetrics(t *testing.T) {
	srv, metrics := newCapturingServer(t)
	client := hermes.NewClient(hermes.WithCollectorURL(srv.URL), hermes.WithServiceName("movies-service"))
	interceptor := UnaryServerInterceptor(client)

	info := &grpc.UnaryServerInfo{FullMethod: "/movies.MovieService/GetMovie"}
	wantErr := status.Error(codes.NotFound, "movie not found")
	handler := func(ctx context.Context, req any) (any, error) { return nil, wantErr }

	_, err := interceptor(context.Background(), nil, info, handler)
	if !errors.Is(err, wantErr) {
		t.Fatalf("interceptor error = %v, want %v", err, wantErr)
	}
	if err := client.Flush(); err != nil {
		t.Fatalf("Flush() error = %v", err)
	}

	byName := make(map[string]hermes.Metric)
	for _, m := range metrics() {
		byName[m.Name] = m
	}

	errMetric, ok := byName["grpc_errors_total"]
	if !ok {
		t.Fatal("expected grpc_errors_total to be recorded on a NotFound error")
	}
	if errMetric.Labels["status"] != codes.NotFound.String() {
		t.Fatalf("grpc_errors_total status label = %v, want %v", errMetric.Labels["status"], codes.NotFound.String())
	}
}
