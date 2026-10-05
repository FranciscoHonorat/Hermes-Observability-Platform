package api

import (
	"encoding/json"
	"net/http"

	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/httpx"
)

// Anomalies and recommendations are written by packages/intelligence; the
// api only reads them (and lets admins triage recommendations).

type anomaly struct {
	ID            int64           `db:"id" json:"id"`
	Time          Time            `db:"time" json:"time"`
	AppName       string          `db:"app_name" json:"app_name"`
	MetricName    string          `db:"metric_name" json:"metric_name"`
	Value         float64         `db:"value" json:"value"`
	ExpectedValue *float64        `db:"expected_value" json:"expected_value"`
	AnomalyScore  float64         `db:"anomaly_score" json:"anomaly_score"`
	Severity      string          `db:"severity" json:"severity"`
	Algorithm     string          `db:"algorithm" json:"algorithm"`
	DetectedAt    Time            `db:"detected_at" json:"detected_at"`
	Metadata      json.RawMessage `db:"metadata" json:"metadata"`
}

const anomalyColumns = `id, time, app_name, metric_name, value, expected_value, anomaly_score,
	severity, algorithm, detected_at, metadata`

// GET /api/v1/anomalies?appName=&metricName=&severity=&from=&to=&limit=
func (s *Server) listAnomalies(w http.ResponseWriter, r *http.Request) error {
	limit, err := queryInt(r, "limit", 100, maxRows)
	if err != nil {
		return err
	}
	q := where{}
	q.add("tenant_id = ?", session(r).TenantID)
	if err := filterAppMetricRange(r, &q, "time"); err != nil {
		return err
	}
	if v := r.URL.Query().Get("severity"); v != "" {
		q.add("severity = ?", v)
	}
	anomalies, err := collect[anomaly](r.Context(), s.db,
		`SELECT `+anomalyColumns+` FROM anomalies `+q.sql()+` ORDER BY time DESC LIMIT `+q.next(limit), q.args...)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, list("anomalies", anomalies))
	return nil
}

// GET /api/v1/anomalies/{id}
func (s *Server) getAnomaly(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	a, ok, err := collectOne[anomaly](r.Context(), s.db,
		`SELECT `+anomalyColumns+` FROM anomalies WHERE id = $1 AND tenant_id = $2`, id, session(r).TenantID)
	if err != nil {
		return err
	}
	if !ok {
		return notFound("Anomaly not found")
	}
	httpx.WriteJSON(w, http.StatusOK, a)
	return nil
}

type recommendation struct {
	ID                   int64           `db:"id" json:"id"`
	AppName              string          `db:"app_name" json:"app_name"`
	Category             string          `db:"category" json:"category"`
	Severity             string          `db:"severity" json:"severity"`
	Title                string          `db:"title" json:"title"`
	Description          string          `db:"description" json:"description"`
	RelatedMetricName    *string         `db:"related_metric_name" json:"related_metric_name"`
	RelatedOperationName *string         `db:"related_operation_name" json:"related_operation_name"`
	Evidence             json.RawMessage `db:"evidence" json:"evidence"`
	Status               string          `db:"status" json:"status"`
	CreatedAt            Time            `db:"created_at" json:"created_at"`
	UpdatedAt            Time            `db:"updated_at" json:"updated_at"`
}

const recommendationColumns = `id, app_name, category, severity, title, description,
	related_metric_name, related_operation_name, evidence, status, created_at, updated_at`

// GET /api/v1/recommendations?appName=&status=&category=&limit=
func (s *Server) listRecommendations(w http.ResponseWriter, r *http.Request) error {
	limit, err := queryInt(r, "limit", 100, maxRows)
	if err != nil {
		return err
	}
	qs := r.URL.Query()
	q := where{}
	q.add("tenant_id = ?", session(r).TenantID)
	for _, f := range [...]struct{ param, col string }{{"appName", "app_name"}, {"status", "status"}, {"category", "category"}} {
		if v := qs.Get(f.param); v != "" {
			q.add(f.col+" = ?", v)
		}
	}
	recs, err := collect[recommendation](r.Context(), s.db,
		`SELECT `+recommendationColumns+` FROM recommendations `+q.sql()+
			` ORDER BY created_at DESC LIMIT `+q.next(limit), q.args...)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, list("recommendations", recs))
	return nil
}

// GET /api/v1/recommendations/{id}
func (s *Server) getRecommendation(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	rec, ok, err := collectOne[recommendation](r.Context(), s.db,
		`SELECT `+recommendationColumns+` FROM recommendations WHERE id = $1 AND tenant_id = $2`,
		id, session(r).TenantID)
	if err != nil {
		return err
	}
	if !ok {
		return notFound("Recommendation not found")
	}
	httpx.WriteJSON(w, http.StatusOK, rec)
	return nil
}

// PUT /api/v1/recommendations/{id} with {"status": "open"|"acknowledged"|"dismissed"}
func (s *Server) updateRecommendation(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	var in struct {
		Status string `json:"status"`
	}
	if err := decode(w, r, &in); err != nil {
		return err
	}
	switch in.Status {
	case "open", "acknowledged", "dismissed":
	default:
		return badRequest("Recommendation status must be one of: open, acknowledged, dismissed")
	}
	rec, ok, err := collectOne[recommendation](r.Context(), s.db, `
		UPDATE recommendations SET status = $1, updated_at = NOW()
		WHERE id = $2 AND tenant_id = $3
		RETURNING `+recommendationColumns, in.Status, id, session(r).TenantID)
	if err != nil {
		return err
	}
	if !ok {
		return notFound("Recommendation not found")
	}
	httpx.WriteJSON(w, http.StatusOK, rec)
	return nil
}
