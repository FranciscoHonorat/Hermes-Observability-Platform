package store

import (
	"context"
	"errors"
	"fmt"

	"github.com/jackc/pgx/v5"

	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/processor/alert"
)

func (p *Postgres) EnabledRules(ctx context.Context) ([]alert.Rule, error) {
	rows, err := p.pool.Query(ctx, `
		SELECT id, tenant_id, name, COALESCE(description, ''), metric_name, condition,
		       threshold, app_name, email_recipients
		FROM alert_rules
		WHERE enabled = true`)
	if err != nil {
		return nil, fmt.Errorf("query alert rules: %w", err)
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (alert.Rule, error) {
		var r alert.Rule
		err := row.Scan(&r.ID, &r.TenantID, &r.Name, &r.Description, &r.MetricName, &r.Condition,
			&r.Threshold, &r.AppName, &r.EmailRecipients)
		return r, err
	})
}

// LatestSample uses two separate statements rather than "$3 IS NULL OR
// app_name = $3": pgx caches prepared statements, and a generic plan for the
// OR form can't use the (tenant_id, app_name, time) index.
func (p *Postgres) LatestSample(ctx context.Context, r alert.Rule) (alert.Sample, bool, error) {
	var (
		s   alert.Sample
		row pgx.Row
	)
	if r.AppName != nil {
		row = p.pool.QueryRow(ctx, `
			SELECT value, app_name FROM metrics
			WHERE tenant_id = $1 AND metric_name = $2 AND app_name = $3
			ORDER BY time DESC LIMIT 1`,
			r.TenantID, r.MetricName, *r.AppName)
	} else {
		row = p.pool.QueryRow(ctx, `
			SELECT value, app_name FROM metrics
			WHERE tenant_id = $1 AND metric_name = $2
			ORDER BY time DESC LIMIT 1`,
			r.TenantID, r.MetricName)
	}
	err := row.Scan(&s.Value, &s.AppName)
	if errors.Is(err, pgx.ErrNoRows) {
		return s, false, nil
	}
	if err != nil {
		return s, false, fmt.Errorf("latest sample for rule %d: %w", r.ID, err)
	}
	return s, true, nil
}

func (p *Postgres) RecordAlert(ctx context.Context, r alert.Rule, s alert.Sample) error {
	_, err := p.pool.Exec(ctx, `
		INSERT INTO alert_history (tenant_id, alert_rule_id, app_name, triggered_at, metric_value)
		VALUES ($1, $2, $3, NOW(), $4)`,
		r.TenantID, r.ID, s.AppName, s.Value)
	return err
}
