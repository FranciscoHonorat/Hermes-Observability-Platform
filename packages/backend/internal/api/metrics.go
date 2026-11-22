package api

import (
	"encoding/json"
	"net/http"

	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/httpx"
	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/pg"
)

const maxRows = 10000

type metricRow struct {
	Time       Time            `db:"time" json:"time"`
	AppName    string          `db:"app_name" json:"app_name"`
	MetricName string          `db:"metric_name" json:"metric_name"`
	MetricType string          `db:"metric_type" json:"metric_type"`
	Value      float64         `db:"value" json:"value"`
	Labels     json.RawMessage `db:"labels" json:"labels"`
}

// GET /api/v1/metrics?appName=&metricName=&from=&to=&limit=&offset=
func (s *Server) listMetrics(w http.ResponseWriter, r *http.Request) error {
	limit, err := queryInt(r, "limit", 1000, maxRows)
	if err != nil {
		return err
	}
	offset, err := queryInt(r, "offset", 0, 1<<31-1)
	if err != nil {
		return err
	}
	q := where{}
	q.add("tenant_id = ?", session(r).TenantID)
	if err := filterAppMetricRange(r, &q, "time"); err != nil {
		return err
	}
	rows, err := collect[metricRow](r.Context(), s.db, `
		SELECT time, app_name, metric_name, metric_type, value, labels
		FROM metrics `+q.sql()+`
		ORDER BY time DESC LIMIT `+q.next(limit)+` OFFSET `+q.next(offset), q.args...)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"metrics": rows, "count": len(rows), "offset": offset, "limit": limit})
	return nil
}

// filterAppMetricRange adds the appName/metricName/from/to filters shared by
// the metrics and anomalies listings.
func filterAppMetricRange(r *http.Request, q *where, timeCol string) error {
	if v := r.URL.Query().Get("appName"); v != "" {
		q.add("app_name = ?", v)
	}
	if v := r.URL.Query().Get("metricName"); v != "" {
		q.add("metric_name = ?", v)
	}
	from, err := queryMillis(r, "from")
	if err != nil {
		return err
	}
	to, err := queryMillis(r, "to")
	if err != nil {
		return err
	}
	if from != nil {
		q.add(timeCol+" >= ?", *from)
	}
	if to != nil {
		q.add(timeCol+" <= ?", *to)
	}
	return nil
}

type timeseriesPoint struct {
	Bucket     Time    `db:"bucket" json:"bucket"`
	AppName    string  `db:"app_name" json:"app_name"`
	MetricName string  `db:"metric_name" json:"metric_name"`
	AvgValue   float64 `db:"avg_value" json:"avg_value"`
	MaxValue   float64 `db:"max_value" json:"max_value"`
	MinValue   float64 `db:"min_value" json:"min_value"`
	Count      int64   `db:"count" json:"count"`
}

// GET /api/v1/metrics/timeseries?appName=&metricName=&interval=&from=&to=
func (s *Server) metricTimeseries(w http.ResponseWriter, r *http.Request) error {
	qs := r.URL.Query()
	appName, metricName := qs.Get("appName"), qs.Get("metricName")
	from, err := queryMillis(r, "from")
	if err != nil {
		return err
	}
	to, err := queryMillis(r, "to")
	if err != nil {
		return err
	}
	if appName == "" || metricName == "" || from == nil || to == nil {
		return badRequest("Missing required parameters: appName, metricName, from, to")
	}
	interval := qs.Get("interval")
	if interval == "" {
		interval = "1 minute"
	}

	points, err := collect[timeseriesPoint](r.Context(), s.db, `
		SELECT time_bucket($1::interval, time) AS bucket, app_name, metric_name,
		       AVG(value) AS avg_value, MAX(value) AS max_value, MIN(value) AS min_value,
		       COUNT(*) AS count
		FROM metrics
		WHERE tenant_id = $2 AND app_name = $3 AND metric_name = $4 AND time >= $5 AND time <= $6
		GROUP BY bucket, app_name, metric_name
		ORDER BY bucket ASC`,
		interval, session(r).TenantID, appName, metricName, *from, *to)
	if pg.IsPermanent(err) {
		return badRequest("Invalid interval: " + interval)
	}
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"timeseries": points, "interval": interval, "count": len(points)})
	return nil
}

type metricName struct {
	MetricName string `db:"metric_name" json:"metric_name"`
	MetricType string `db:"metric_type" json:"metric_type"`
}

// GET /api/v1/metrics/names?appName=
func (s *Server) metricNames(w http.ResponseWriter, r *http.Request) error {
	q := where{}
	q.add("tenant_id = ?", session(r).TenantID)
	if v := r.URL.Query().Get("appName"); v != "" {
		q.add("app_name = ?", v)
	}
	names, err := collect[metricName](r.Context(), s.db,
		`SELECT DISTINCT metric_name, metric_type FROM metrics `+q.sql()+` ORDER BY metric_name`, q.args...)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, list("metrics", names))
	return nil
}

// GET /api/v1/metrics/latest?appName=
func (s *Server) latestMetrics(w http.ResponseWriter, r *http.Request) error {
	q := where{}
	q.add("tenant_id = ?", session(r).TenantID)
	if v := r.URL.Query().Get("appName"); v != "" {
		q.add("app_name = ?", v)
	}
	rows, err := collect[metricRow](r.Context(), s.db, `
		SELECT DISTINCT ON (app_name, metric_name) time, app_name, metric_name, metric_type, value, labels
		FROM metrics `+q.sql()+`
		ORDER BY app_name, metric_name, time DESC`, q.args...)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, list("metrics", rows))
	return nil
}

type application struct {
	Name        string  `db:"name" json:"name"`
	Description *string `db:"description" json:"description"`
	CreatedAt   Time    `db:"created_at" json:"created_at"`
	LastSeen    Time    `db:"last_seen" json:"last_seen"`
	IsActive    bool    `db:"is_active" json:"is_active"`
}

const applicationColumns = `name, description, created_at, last_seen,
	(NOW() - last_seen) < INTERVAL '5 minutes' AS is_active`

// GET /api/v1/applications
func (s *Server) listApplications(w http.ResponseWriter, r *http.Request) error {
	apps, err := collect[application](r.Context(), s.db,
		`SELECT `+applicationColumns+` FROM applications WHERE tenant_id = $1 ORDER BY last_seen DESC`,
		session(r).TenantID)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, list("applications", apps))
	return nil
}

// GET /api/v1/applications/{name}
func (s *Server) getApplication(w http.ResponseWriter, r *http.Request) error {
	app, ok, err := collectOne[application](r.Context(), s.db,
		`SELECT `+applicationColumns+` FROM applications WHERE name = $1 AND tenant_id = $2`,
		r.PathValue("name"), session(r).TenantID)
	if err != nil {
		return err
	}
	if !ok {
		return notFound("Application not found")
	}
	httpx.WriteJSON(w, http.StatusOK, app)
	return nil
}

type appMetricRow struct {
	Time       Time            `db:"time" json:"time"`
	MetricName string          `db:"metric_name" json:"metric_name"`
	MetricType string          `db:"metric_type" json:"metric_type"`
	Value      float64         `db:"value" json:"value"`
	Labels     json.RawMessage `db:"labels" json:"labels"`
}

// GET /api/v1/applications/{name}/metrics?limit=
func (s *Server) applicationMetrics(w http.ResponseWriter, r *http.Request) error {
	limit, err := queryInt(r, "limit", 100, maxRows)
	if err != nil {
		return err
	}
	name := r.PathValue("name")
	rows, err := collect[appMetricRow](r.Context(), s.db, `
		SELECT time, metric_name, metric_type, value, labels FROM metrics
		WHERE app_name = $1 AND tenant_id = $2
		ORDER BY time DESC LIMIT $3`, name, session(r).TenantID, limit)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"application": name, "metrics": rows, "count": len(rows)})
	return nil
}
