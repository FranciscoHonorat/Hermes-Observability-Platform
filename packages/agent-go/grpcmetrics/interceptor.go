package grpcmetrics

import (
	"context"
	"time"

	hermes "github.com/FranciscoHonorat/hermes-observability/packages/agent-go"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

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
