// Package pipeline maps decoded stream items to store rows. Each Persist call
// is one batch insert plus one applications upsert, regardless of batch size.
package pipeline

import (
	"context"

	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/model"
	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/processor/store"
	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/processor/stream"
)

type Store interface {
	InsertMetrics(ctx context.Context, rows []store.MetricRow) error
	InsertSpans(ctx context.Context, rows []store.SpanRow) error
	InsertLogs(ctx context.Context, rows []store.LogRow) error
	TouchApplications(ctx context.Context, apps []store.App) error
}

func Metrics(s Store) stream.Pipeline[model.Metric] {
	return stream.Pipeline[model.Metric]{
		Decode: model.Decode[model.Metric],
		Persist: func(ctx context.Context, items []stream.Item[model.Metric]) error {
			rows := make([]store.MetricRow, len(items))
			apps := make([]store.App, len(items))
			for i, it := range items {
				m := it.Value
				rows[i] = store.MetricRow{
					Time:       model.MillisToTime(m.Timestamp),
					TenantID:   m.Tenant(),
					AppName:    m.Service(),
					MetricName: m.Name,
					MetricType: m.Type,
					Value:      *m.Value,
					Labels:     model.JSONObject(m.Labels),
					StreamID:   it.ID,
				}
				apps[i] = store.App{TenantID: m.Tenant(), Name: m.Service()}
			}
			if err := s.InsertMetrics(ctx, rows); err != nil {
				return err
			}
			return s.TouchApplications(ctx, apps)
		},
	}
}

func Spans(s Store) stream.Pipeline[model.Span] {
	return stream.Pipeline[model.Span]{
		Decode: model.Decode[model.Span],
		Persist: func(ctx context.Context, items []stream.Item[model.Span]) error {
			rows := make([]store.SpanRow, len(items))
			apps := make([]store.App, len(items))
			for i, it := range items {
				sp := it.Value
				rows[i] = store.SpanRow{
					TraceID:       sp.TraceID,
					SpanID:        sp.SpanID,
					TenantID:      sp.Tenant(),
					ParentSpanID:  sp.ParentSpanID,
					ServiceName:   sp.ServiceName,
					OperationName: sp.OperationName,
					StartTime:     model.MillisToTime(sp.StartTime),
					DurationMs:    *sp.Duration,
					Status:        sp.Status,
					Attributes:    model.JSONObject(sp.Attributes),
				}
				apps[i] = store.App{TenantID: sp.Tenant(), Name: sp.ServiceName}
			}
			if err := s.InsertSpans(ctx, rows); err != nil {
				return err
			}
			return s.TouchApplications(ctx, apps)
		},
	}
}

func Logs(s Store) stream.Pipeline[model.LogEntry] {
	return stream.Pipeline[model.LogEntry]{
		Decode: model.Decode[model.LogEntry],
		Persist: func(ctx context.Context, items []stream.Item[model.LogEntry]) error {
			rows := make([]store.LogRow, len(items))
			apps := make([]store.App, len(items))
			for i, it := range items {
				l := it.Value
				rows[i] = store.LogRow{
					Time:       model.MillisToTime(l.Timestamp),
					TenantID:   l.Tenant(),
					AppName:    l.ServiceName,
					Level:      l.Level,
					Message:    l.Message,
					TraceID:    l.TraceID,
					SpanID:     l.SpanID,
					Attributes: model.JSONObject(l.Attributes),
					StreamID:   it.ID,
				}
				apps[i] = store.App{TenantID: l.Tenant(), Name: l.ServiceName}
			}
			if err := s.InsertLogs(ctx, rows); err != nil {
				return err
			}
			return s.TouchApplications(ctx, apps)
		},
	}
}
