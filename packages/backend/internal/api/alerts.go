package api

import (
	"net/http"
	"regexp"

	"github.com/jackc/pgx/v5"

	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/httpx"
)

type alertRule struct {
	ID              int64    `db:"id" json:"id"`
	Name            string   `db:"name" json:"name"`
	Description     *string  `db:"description" json:"description"`
	MetricName      string   `db:"metric_name" json:"metric_name"`
	Condition       string   `db:"condition" json:"condition"`
	Threshold       float64  `db:"threshold" json:"threshold"`
	AppName         *string  `db:"app_name" json:"app_name"`
	EmailRecipients []string `db:"email_recipients" json:"email_recipients"`
	Enabled         bool     `db:"enabled" json:"enabled"`
	CreatedAt       Time     `db:"created_at" json:"created_at"`
	UpdatedAt       Time     `db:"updated_at" json:"updated_at"`
}

const alertRuleColumns = `id, name, description, metric_name, condition, threshold, app_name,
	email_recipients, enabled, created_at, updated_at`

// alertRuleInput is the create/update body. Pointers distinguish "absent"
// from zero values for partial updates.
type alertRuleInput struct {
	Name            *string   `json:"name"`
	Description     *string   `json:"description"`
	MetricName      *string   `json:"metric_name"`
	Condition       *string   `json:"condition"`
	Threshold       *float64  `json:"threshold"`
	AppName         *string   `json:"app_name"`
	EmailRecipients *[]string `json:"email_recipients"`
	Enabled         *bool     `json:"enabled"`
}

var emailRe = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

// validate applies the rules from validateAlertRule (create) and
// validateAlertRuleUpdate (partial) in packages/shared.
func (in alertRuleInput) validate(create bool) error {
	if create {
		switch {
		case in.Name == nil || *in.Name == "":
			return badRequest("Alert rule name is required")
		case in.MetricName == nil || *in.MetricName == "":
			return badRequest("Alert rule metric_name is required")
		case in.Condition == nil:
			return badRequest("Alert rule condition must be one of: gt, lt, eq")
		case in.Threshold == nil:
			return badRequest("Alert rule threshold must be a number")
		case in.EmailRecipients == nil:
			return badRequest("email_recipients must be a non-empty array")
		}
	}
	if in.Name != nil && *in.Name == "" {
		return badRequest("Alert rule name must be a non-empty string")
	}
	if in.MetricName != nil && *in.MetricName == "" {
		return badRequest("Alert rule metric_name must be a non-empty string")
	}
	if in.Condition != nil {
		switch *in.Condition {
		case "gt", "lt", "eq":
		default:
			return badRequest("Alert rule condition must be one of: gt, lt, eq")
		}
	}
	if in.EmailRecipients != nil {
		if len(*in.EmailRecipients) == 0 {
			return badRequest("email_recipients must be a non-empty array")
		}
		for _, e := range *in.EmailRecipients {
			if !emailRe.MatchString(e) {
				return badRequest("email_recipients contains an invalid address: " + e)
			}
		}
	}
	return nil
}

// GET /api/v1/alerts?enabled=
func (s *Server) listAlertRules(w http.ResponseWriter, r *http.Request) error {
	q := where{}
	q.add("tenant_id = ?", session(r).TenantID)
	if v := r.URL.Query().Get("enabled"); v != "" {
		q.add("enabled = ?", v == "true")
	}
	rules, err := collect[alertRule](r.Context(), s.db,
		`SELECT `+alertRuleColumns+` FROM alert_rules `+q.sql()+` ORDER BY created_at DESC`, q.args...)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, list("alerts", rules))
	return nil
}

// GET /api/v1/alerts/{id}
func (s *Server) getAlertRule(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	rule, ok, err := collectOne[alertRule](r.Context(), s.db,
		`SELECT `+alertRuleColumns+` FROM alert_rules WHERE id = $1 AND tenant_id = $2`, id, session(r).TenantID)
	if err != nil {
		return err
	}
	if !ok {
		return notFound("Alert not found")
	}
	httpx.WriteJSON(w, http.StatusOK, rule)
	return nil
}

// POST /api/v1/alerts
func (s *Server) createAlertRule(w http.ResponseWriter, r *http.Request) error {
	var in alertRuleInput
	if err := decode(w, r, &in); err != nil {
		return err
	}
	if err := in.validate(true); err != nil {
		return err
	}
	enabled := in.Enabled == nil || *in.Enabled
	rule, _, err := collectOne[alertRule](r.Context(), s.db, `
		INSERT INTO alert_rules (tenant_id, name, description, metric_name, condition, threshold,
		                         app_name, email_recipients, enabled)
		VALUES ($1, $2, NULLIF($3, ''), $4, $5, $6, NULLIF($7, ''), $8, $9)
		RETURNING `+alertRuleColumns,
		session(r).TenantID, *in.Name, in.Description, *in.MetricName, *in.Condition, *in.Threshold,
		in.AppName, *in.EmailRecipients, enabled)
	if err != nil {
		return err
	}
	s.log.Info("alert rule created", "id", rule.ID, "tenant", session(r).TenantID)
	httpx.WriteJSON(w, http.StatusCreated, rule)
	return nil
}

// PUT /api/v1/alerts/{id} applies a partial update; absent fields keep
// their current value.
func (s *Server) updateAlertRule(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	var in alertRuleInput
	if err := decode(w, r, &in); err != nil {
		return err
	}
	if err := in.validate(false); err != nil {
		return err
	}
	rule, ok, err := collectOne[alertRule](r.Context(), s.db, `
		UPDATE alert_rules SET
			name = COALESCE($1, name),
			description = COALESCE($2, description),
			metric_name = COALESCE($3, metric_name),
			condition = COALESCE($4, condition),
			threshold = COALESCE($5, threshold),
			app_name = COALESCE($6, app_name),
			email_recipients = COALESCE($7, email_recipients),
			enabled = COALESCE($8, enabled),
			updated_at = NOW()
		WHERE id = $9 AND tenant_id = $10
		RETURNING `+alertRuleColumns,
		in.Name, in.Description, in.MetricName, in.Condition, in.Threshold, in.AppName, in.EmailRecipients,
		in.Enabled, id, session(r).TenantID)
	if err != nil {
		return err
	}
	if !ok {
		return notFound("Alert not found")
	}
	httpx.WriteJSON(w, http.StatusOK, rule)
	return nil
}

// DELETE /api/v1/alerts/{id} also deletes the rule's history:
// alert_history.alert_rule_id has no ON DELETE action, so a rule that had
// ever fired could not be deleted at all.
func (s *Server) deleteAlertRule(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	tenantID := session(r).TenantID
	var deleted int64
	err = pgx.BeginFunc(r.Context(), s.db, func(tx pgx.Tx) error {
		if _, err := tx.Exec(r.Context(), `DELETE FROM alert_history WHERE alert_rule_id = $1 AND tenant_id = $2`, id, tenantID); err != nil {
			return err
		}
		tag, err := tx.Exec(r.Context(), `DELETE FROM alert_rules WHERE id = $1 AND tenant_id = $2`, id, tenantID)
		deleted = tag.RowsAffected()
		return err
	})
	if err != nil {
		return err
	}
	if deleted == 0 {
		return notFound("Alert not found")
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"message": "Alert deleted successfully", "id": id})
	return nil
}

type alertHistoryRow struct {
	ID               int64   `db:"id" json:"id"`
	AlertRuleID      int64   `db:"alert_rule_id" json:"alert_rule_id"`
	AppName          string  `db:"app_name" json:"app_name"`
	TriggeredAt      Time    `db:"triggered_at" json:"triggered_at"`
	MetricValue      float64 `db:"metric_value" json:"metric_value"`
	ResolvedAt       *Time   `db:"resolved_at" json:"resolved_at"`
	NotificationSent *bool   `db:"notification_sent" json:"notification_sent"`
}

// GET /api/v1/alerts/{id}/history?limit=
func (s *Server) alertHistory(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	limit, err := queryInt(r, "limit", 100, maxRows)
	if err != nil {
		return err
	}
	history, err := collect[alertHistoryRow](r.Context(), s.db, `
		SELECT id, alert_rule_id, app_name, triggered_at, metric_value, resolved_at, notification_sent
		FROM alert_history
		WHERE alert_rule_id = $1 AND tenant_id = $2
		ORDER BY triggered_at DESC LIMIT $3`, id, session(r).TenantID, limit)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"alert_id": id, "history": history, "count": len(history)})
	return nil
}
