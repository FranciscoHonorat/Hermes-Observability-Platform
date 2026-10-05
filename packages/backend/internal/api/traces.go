package api

import (
	"encoding/json"
	"net/http"

	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/httpx"
)

type traceSummary struct {
	TraceID       string  `db:"trace_id" json:"traceId"`
	RootService   *string `db:"root_service" json:"rootService"`
	RootOperation *string `db:"root_operation" json:"rootOperation"`
	StartTime     Time    `db:"start_time" json:"-"`
	StartMillis   int64   `db:"-" json:"startTime"`
	DurationMs    float64 `db:"duration_ms" json:"durationMs"`
	SpanCount     int64   `db:"span_count" json:"spanCount"`
	HasError      bool    `db:"has_error" json:"hasError"`
}

// GET /api/v1/traces?serviceName=&from=&to=&limit=&offset=
func (s *Server) listTraces(w http.ResponseWriter, r *http.Request) error {
	limit, err := queryInt(r, "limit", 50, 1000)
	if err != nil {
		return err
	}
	offset, err := queryInt(r, "offset", 0, 1<<31-1)
	if err != nil {
		return err
	}
	q := where{}
	q.add("tenant_id = ?", session(r).TenantID)
	if v := r.URL.Query().Get("serviceName"); v != "" {
		q.add("service_name = ?", v)
	}
	if err := filterRange(r, &q, "start_time"); err != nil {
		return err
	}
	// Roots are looked up only for the page of traces being returned.
	traces, err := collect[traceSummary](r.Context(), s.db, `
		WITH page AS (
			SELECT trace_id,
			       MIN(start_time) AS trace_start,
			       MAX(start_time + duration_ms * INTERVAL '1 millisecond') AS trace_end,
			       COUNT(*) AS span_count,
			       bool_or(status = 'error') AS has_error
			FROM spans `+q.sql()+`
			GROUP BY trace_id
			ORDER BY trace_start DESC
			LIMIT `+q.next(limit)+` OFFSET `+q.next(offset)+`
		)
		SELECT p.trace_id, p.trace_start AS start_time,
		       (EXTRACT(EPOCH FROM (p.trace_end - p.trace_start)) * 1000)::float8 AS duration_ms,
		       p.span_count, p.has_error,
		       root.service_name AS root_service, root.operation_name AS root_operation
		FROM page p
		LEFT JOIN LATERAL (
			SELECT service_name, operation_name FROM spans
			WHERE trace_id = p.trace_id AND tenant_id = $1 AND parent_span_id IS NULL
			ORDER BY start_time ASC LIMIT 1
		) root ON true
		ORDER BY p.trace_start DESC`, q.args...)
	if err != nil {
		return err
	}
	for i := range traces {
		traces[i].StartMillis = traces[i].StartTime.UnixMilli()
	}
	httpx.WriteJSON(w, http.StatusOK, list("traces", traces))
	return nil
}

// filterRange adds from/to (epoch ms) bounds on col.
func filterRange(r *http.Request, q *where, col string) error {
	from, err := queryMillis(r, "from")
	if err != nil {
		return err
	}
	to, err := queryMillis(r, "to")
	if err != nil {
		return err
	}
	if from != nil {
		q.add(col+" >= ?", *from)
	}
	if to != nil {
		q.add(col+" <= ?", *to)
	}
	return nil
}

type spanRow struct {
	TraceID       string          `db:"trace_id" json:"traceId"`
	SpanID        string          `db:"span_id" json:"spanId"`
	ParentSpanID  *string         `db:"parent_span_id" json:"parentSpanId,omitempty"`
	ServiceName   string          `db:"service_name" json:"serviceName"`
	OperationName string          `db:"operation_name" json:"operationName"`
	StartTime     Time            `db:"start_time" json:"-"`
	StartMillis   int64           `db:"-" json:"startTime"`
	DurationMs    float64         `db:"duration_ms" json:"durationMs"`
	Status        string          `db:"status" json:"status"`
	Attributes    json.RawMessage `db:"attributes" json:"attributes"`
}

// GET /api/v1/traces/{traceId}
func (s *Server) getTrace(w http.ResponseWriter, r *http.Request) error {
	traceID := r.PathValue("traceId")
	spans, err := collect[spanRow](r.Context(), s.db, `
		SELECT trace_id, span_id, parent_span_id, service_name, operation_name, start_time,
		       duration_ms, status, attributes
		FROM spans WHERE trace_id = $1 AND tenant_id = $2
		ORDER BY start_time ASC`, traceID, session(r).TenantID)
	if err != nil {
		return err
	}
	if len(spans) == 0 {
		return notFound("Trace not found")
	}
	for i := range spans {
		spans[i].StartMillis = spans[i].StartTime.UnixMilli()
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"traceId": traceID, "spans": spans})
	return nil
}

type logRow struct {
	ServiceName string          `db:"app_name" json:"serviceName"`
	Level       string          `db:"level" json:"level"`
	Message     string          `db:"message" json:"message"`
	Time        Time            `db:"time" json:"-"`
	Timestamp   int64           `db:"-" json:"timestamp"`
	TraceID     *string         `db:"trace_id" json:"traceId,omitempty"`
	SpanID      *string         `db:"span_id" json:"spanId,omitempty"`
	Attributes  json.RawMessage `db:"attributes" json:"attributes"`
}

// GET /api/v1/logs?appName=&level=&search=&traceId=&from=&to=&limit=&offset=
func (s *Server) listLogs(w http.ResponseWriter, r *http.Request) error {
	limit, err := queryInt(r, "limit", 100, maxRows)
	if err != nil {
		return err
	}
	offset, err := queryInt(r, "offset", 0, 1<<31-1)
	if err != nil {
		return err
	}
	qs := r.URL.Query()
	q := where{}
	q.add("tenant_id = ?", session(r).TenantID)
	if v := qs.Get("appName"); v != "" {
		q.add("app_name = ?", v)
	}
	if v := qs.Get("level"); v != "" {
		q.add("level = ?", v)
	}
	if v := qs.Get("search"); v != "" {
		q.add("message ILIKE '%' || ? || '%'", v)
	}
	if v := qs.Get("traceId"); v != "" {
		q.add("trace_id = ?", v)
	}
	if err := filterRange(r, &q, "time"); err != nil {
		return err
	}
	logs, err := collect[logRow](r.Context(), s.db, `
		SELECT time, app_name, level, message, trace_id, span_id, attributes
		FROM logs `+q.sql()+`
		ORDER BY time DESC LIMIT `+q.next(limit)+` OFFSET `+q.next(offset), q.args...)
	if err != nil {
		return err
	}
	for i := range logs {
		logs[i].Timestamp = logs[i].Time.UnixMilli()
	}
	httpx.WriteJSON(w, http.StatusOK, list("logs", logs))
	return nil
}

type serviceEdge struct {
	Source        string  `db:"caller" json:"source"`
	Target        string  `db:"callee" json:"target"`
	CallCount     int64   `db:"call_count" json:"callCount"`
	ErrorCount    int64   `db:"error_count" json:"errorCount"`
	AvgDurationMs float64 `db:"avg_duration_ms" json:"avgDurationMs"`
}

type serviceNode struct {
	ServiceName string  `json:"serviceName"`
	CallCount   int64   `json:"callCount"`
	ErrorCount  int64   `json:"errorCount"`
	ErrorRate   float64 `json:"errorRate"`
}

// GET /api/v1/service-map?from=&to=
func (s *Server) serviceMap(w http.ResponseWriter, r *http.Request) error {
	q := where{}
	q.add("child.tenant_id = ?", session(r).TenantID)
	q.conds = append(q.conds, "parent.service_name <> child.service_name")
	if err := filterRange(r, &q, "child.start_time"); err != nil {
		return err
	}
	edges, err := collect[serviceEdge](r.Context(), s.db, `
		SELECT parent.service_name AS caller, child.service_name AS callee,
		       COUNT(*) AS call_count,
		       AVG(child.duration_ms) AS avg_duration_ms,
		       COUNT(*) FILTER (WHERE child.status = 'error') AS error_count
		FROM spans child
		JOIN spans parent
		  ON parent.span_id = child.parent_span_id
		 AND parent.trace_id = child.trace_id
		 AND parent.tenant_id = child.tenant_id
		`+q.sql()+`
		GROUP BY parent.service_name, child.service_name
		ORDER BY call_count DESC`, q.args...)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"nodes": buildNodes(edges), "edges": edges})
	return nil
}

// buildNodes derives per-service stats from the edges: a service's call and
// error counts are the sum over its incoming edges. Order follows first
// appearance, matching the former implementation.
func buildNodes(edges []serviceEdge) []serviceNode {
	nodes := []serviceNode{}
	index := map[string]int{}
	touch := func(name string) *serviceNode {
		i, ok := index[name]
		if !ok {
			i = len(nodes)
			index[name] = i
			nodes = append(nodes, serviceNode{ServiceName: name})
		}
		return &nodes[i]
	}
	for _, e := range edges {
		touch(e.Source)
		callee := touch(e.Target)
		callee.CallCount += e.CallCount
		callee.ErrorCount += e.ErrorCount
	}
	for i := range nodes {
		if nodes[i].CallCount > 0 {
			nodes[i].ErrorRate = float64(nodes[i].ErrorCount) / float64(nodes[i].CallCount)
		}
	}
	return nodes
}
