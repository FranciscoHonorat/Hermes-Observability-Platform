// Package store writes batches to TimescaleDB. Each Insert* call is one
// round trip regardless of batch size: rows are passed as parallel arrays and
// expanded server-side with unnest, which (unlike COPY) still allows the
// ON CONFLICT clauses that keep at-least-once redelivery idempotent.
package store

import (
	"context"
	"fmt"
	"sort"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type Postgres struct {
	pool *pgxpool.Pool
}

func New(pool *pgxpool.Pool) *Postgres { return &Postgres{pool: pool} }

type MetricRow struct {
	Time       time.Time
	TenantID   int32
	AppName    string
	MetricName string
	MetricType string
	Value      float64
	Labels     string // JSON object
	StreamID   string
}

func (p *Postgres) InsertMetrics(ctx context.Context, rows []MetricRow) error {
	n := len(rows)
	if n == 0 {
		return nil
	}
	var (
		times   = make([]time.Time, n)
		tenants = make([]int32, n)
		apps    = make([]string, n)
		names   = make([]string, n)
		types   = make([]string, n)
		values  = make([]float64, n)
		labels  = make([]string, n)
		ids     = make([]string, n)
	)
	for i, r := range rows {
		times[i], tenants[i], apps[i], names[i] = r.Time, r.TenantID, r.AppName, r.MetricName
		types[i], values[i], labels[i], ids[i] = r.MetricType, r.Value, r.Labels, r.StreamID
	}
	_, err := p.pool.Exec(ctx, `
		INSERT INTO metrics (time, tenant_id, app_name, metric_name, metric_type, value, labels, stream_id)
		SELECT t, tn, a, n, ty, v, l::jsonb, s
		FROM unnest($1::timestamptz[], $2::int[], $3::text[], $4::text[], $5::text[],
		            $6::float8[], $7::text[], $8::text[]) AS u(t, tn, a, n, ty, v, l, s)
		ON CONFLICT (time, tenant_id, app_name, metric_name, stream_id) DO UPDATE
		SET value = EXCLUDED.value, labels = EXCLUDED.labels`,
		times, tenants, apps, names, types, values, labels, ids)
	if err != nil {
		return fmt.Errorf("insert %d metrics: %w", n, err)
	}
	return nil
}

type SpanRow struct {
	TraceID       string
	SpanID        string
	TenantID      int32
	ParentSpanID  *string
	ServiceName   string
	OperationName string
	StartTime     time.Time
	DurationMs    float64
	Status        string
	Attributes    string // JSON object
}

func (p *Postgres) InsertSpans(ctx context.Context, rows []SpanRow) error {
	n := len(rows)
	if n == 0 {
		return nil
	}
	var (
		traceIDs  = make([]string, n)
		spanIDs   = make([]string, n)
		tenants   = make([]int32, n)
		parents   = make([]*string, n)
		services  = make([]string, n)
		ops       = make([]string, n)
		starts    = make([]time.Time, n)
		durations = make([]float64, n)
		statuses  = make([]string, n)
		attrs     = make([]string, n)
	)
	for i, r := range rows {
		traceIDs[i], spanIDs[i], tenants[i], parents[i] = r.TraceID, r.SpanID, r.TenantID, r.ParentSpanID
		services[i], ops[i], starts[i], durations[i] = r.ServiceName, r.OperationName, r.StartTime, r.DurationMs
		statuses[i], attrs[i] = r.Status, r.Attributes
	}
	_, err := p.pool.Exec(ctx, `
		INSERT INTO spans (trace_id, span_id, tenant_id, parent_span_id, service_name,
		                   operation_name, start_time, duration_ms, status, attributes)
		SELECT tr, sp, tn, pa, sv, op, st, du, ss, at::jsonb
		FROM unnest($1::text[], $2::text[], $3::int[], $4::text[], $5::text[], $6::text[],
		            $7::timestamptz[], $8::float8[], $9::text[], $10::text[])
		     AS u(tr, sp, tn, pa, sv, op, st, du, ss, at)
		ON CONFLICT (start_time, tenant_id, trace_id, span_id) DO NOTHING`,
		traceIDs, spanIDs, tenants, parents, services, ops, starts, durations, statuses, attrs)
	if err != nil {
		return fmt.Errorf("insert %d spans: %w", n, err)
	}
	return nil
}

type LogRow struct {
	Time       time.Time
	TenantID   int32
	AppName    string
	Level      string
	Message    string
	TraceID    *string
	SpanID     *string
	Attributes string // JSON object
	StreamID   string
}

func (p *Postgres) InsertLogs(ctx context.Context, rows []LogRow) error {
	n := len(rows)
	if n == 0 {
		return nil
	}
	var (
		times    = make([]time.Time, n)
		tenants  = make([]int32, n)
		apps     = make([]string, n)
		levels   = make([]string, n)
		messages = make([]string, n)
		traceIDs = make([]*string, n)
		spanIDs  = make([]*string, n)
		attrs    = make([]string, n)
		ids      = make([]string, n)
	)
	for i, r := range rows {
		times[i], tenants[i], apps[i], levels[i], messages[i] = r.Time, r.TenantID, r.AppName, r.Level, r.Message
		traceIDs[i], spanIDs[i], attrs[i], ids[i] = r.TraceID, r.SpanID, r.Attributes, r.StreamID
	}
	_, err := p.pool.Exec(ctx, `
		INSERT INTO logs (time, tenant_id, app_name, level, message, trace_id, span_id, attributes, stream_id)
		SELECT t, tn, a, lv, m, tr, sp, at::jsonb, s
		FROM unnest($1::timestamptz[], $2::int[], $3::text[], $4::text[], $5::text[],
		            $6::text[], $7::text[], $8::text[], $9::text[]) AS u(t, tn, a, lv, m, tr, sp, at, s)
		ON CONFLICT (time, tenant_id, app_name, stream_id) DO NOTHING`,
		times, tenants, apps, levels, messages, traceIDs, spanIDs, attrs, ids)
	if err != nil {
		return fmt.Errorf("insert %d logs: %w", n, err)
	}
	return nil
}

type App struct {
	TenantID int32
	Name     string
}

// TouchApplications upserts last_seen for each distinct app in one statement.
// Rows are deduplicated (ON CONFLICT DO UPDATE rejects touching a row twice)
// and sorted so the three concurrent pipelines lock rows in the same order
// and cannot deadlock each other.
func (p *Postgres) TouchApplications(ctx context.Context, apps []App) error {
	seen := make(map[App]struct{}, len(apps))
	uniq := make([]App, 0, len(apps))
	for _, a := range apps {
		if _, ok := seen[a]; !ok {
			seen[a] = struct{}{}
			uniq = append(uniq, a)
		}
	}
	if len(uniq) == 0 {
		return nil
	}
	sort.Slice(uniq, func(i, j int) bool {
		if uniq[i].TenantID != uniq[j].TenantID {
			return uniq[i].TenantID < uniq[j].TenantID
		}
		return uniq[i].Name < uniq[j].Name
	})
	tenants := make([]int32, len(uniq))
	names := make([]string, len(uniq))
	for i, a := range uniq {
		tenants[i], names[i] = a.TenantID, a.Name
	}
	_, err := p.pool.Exec(ctx, `
		INSERT INTO applications (tenant_id, name, last_seen)
		SELECT tn, n, NOW() FROM unnest($1::int[], $2::text[]) AS u(tn, n)
		ON CONFLICT (tenant_id, name) DO UPDATE SET last_seen = NOW()`,
		tenants, names)
	if err != nil {
		return fmt.Errorf("touch %d applications: %w", len(uniq), err)
	}
	return nil
}
