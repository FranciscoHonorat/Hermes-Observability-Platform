// Package grpcmetrics is a separate Go module from the core hermes client
// specifically so that pulling in google.golang.org/grpc is opt-in — the
// core agent-go module has no external dependencies, and only services that
// actually serve gRPC (movies-service in re-api-books, e.g.) should pay for
// this one. Mirrors how OpenTelemetry itself splits framework-specific
// instrumentation (otelgrpc, otelgin) into separate modules from its core
// SDK.
package grpcmetrics

import (
	"context"
	"time"

	hermes "github.com/FranciscoHonorat/hermes-observability/packages/agent-go"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// UnaryServerInterceptor records grpc_requests_total /
// grpc_request_duration_ms / grpc_errors_total for every unary RPC, labeled
// by method (info.FullMethod, e.g. "/movies.MovieService/GetMovie" — already
// bounded cardinality, no path-param collapsing needed like the HTTP case)
// and status (the gRPC status code name, e.g. "OK", "NotFound").
//
// Coexists with a grpc.StatsHandler (e.g. otelgrpc.NewServerHandler()) on
// the same server — grpc.NewServer accepts both a stats handler and
// interceptors at once, so this is purely additive alongside existing
// OTel/Jaeger tracing.
func UnaryServerInterceptor(client *hermes.Client) grpc.UnaryServerInterceptor {
	return func(ctx context.Context, req any, info *grpc.UnaryServerInfo, handler grpc.UnaryHandler) (any, error) {
		start := time.Now()
		resp, err := handler(ctx, req)
		duration := float64(time.Since(start)) / float64(time.Millisecond)

		code := status.Code(err)
		labels := map[string]any{"method": info.FullMethod, "status": code.String()}

		client.Increment("grpc_requests_total", 1, labels)
		client.Histogram("grpc_request_duration_ms", duration, hermes.UnitMilliseconds, labels)
		if code != codes.OK {
			client.Increment("grpc_errors_total", 1, labels)
		}

		return resp, err
	}
}
