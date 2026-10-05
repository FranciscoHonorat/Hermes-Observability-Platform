// Package alert periodically evaluates alert_rules against the latest metric
// value and notifies recipients when a rule transitions into the triggered
// state.
package alert

import (
	"context"
	"fmt"
	"html"
	"log/slog"
	"strconv"
	"strings"
	"time"
)

type Rule struct {
	ID              int64
	TenantID        int32
	Name            string
	Description     string
	MetricName      string
	Condition       string
	Threshold       float64
	AppName         *string
	EmailRecipients []string
}

type Sample struct {
	Value   float64
	AppName string
}

type Store interface {
	EnabledRules(ctx context.Context) ([]Rule, error)
	// LatestSample returns the most recent value of the rule's metric, or
	// ok=false when none has been recorded yet.
	LatestSample(ctx context.Context, r Rule) (s Sample, ok bool, err error)
	RecordAlert(ctx context.Context, r Rule, s Sample) error
}

type Notifier interface {
	Send(ctx context.Context, to, subject, htmlBody string) error
}

// Engine keeps triggered state in memory, like the Node version: a restart
// re-notifies rules that are still firing, and running more than one
// processor replica sends duplicate notifications.
type Engine struct {
	store    Store
	notifier Notifier
	interval time.Duration
	log      *slog.Logger
	now      func() time.Time

	triggered map[int64]bool
}

func NewEngine(s Store, n Notifier, interval time.Duration, log *slog.Logger) *Engine {
	return &Engine{
		store:     s,
		notifier:  n,
		interval:  interval,
		log:       log.With("component", "alert-engine"),
		now:       time.Now,
		triggered: map[int64]bool{},
	}
}

func (e *Engine) Run(ctx context.Context) error {
	e.log.Info("alert engine started", "interval", e.interval.String())
	ticker := time.NewTicker(e.interval)
	defer ticker.Stop()
	for {
		if err := e.Check(ctx); err != nil && ctx.Err() == nil {
			e.log.Error("checking alerts", "err", err)
		}
		select {
		case <-ctx.Done():
			e.log.Info("alert engine stopped")
			return nil
		case <-ticker.C:
		}
	}
}

// Check evaluates every enabled rule once. A failing rule is logged and
// skipped so it cannot block the others.
func (e *Engine) Check(ctx context.Context) error {
	rules, err := e.store.EnabledRules(ctx)
	if err != nil {
		return err
	}
	e.log.Debug("checking alert rules", "count", len(rules))
	for _, r := range rules {
		if err := e.evaluate(ctx, r); err != nil {
			e.log.Error("evaluating rule", "rule", r.Name, "rule_id", r.ID, "err", err)
		}
	}
	return nil
}

func (e *Engine) evaluate(ctx context.Context, r Rule) error {
	s, ok, err := e.store.LatestSample(ctx, r)
	if err != nil || !ok {
		return err
	}
	firing := Evaluate(s.Value, r.Condition, r.Threshold)

	switch {
	case firing && !e.triggered[r.ID]:
		e.log.Warn("alert triggered", "rule", r.Name, "metric", r.MetricName,
			"value", s.Value, "condition", r.Condition, "threshold", r.Threshold)
		e.notify(ctx, r, s)
		if err := e.store.RecordAlert(ctx, r, s); err != nil {
			e.log.Error("recording alert history", "rule_id", r.ID, "err", err)
		}
		e.triggered[r.ID] = true
	case !firing && e.triggered[r.ID]:
		e.log.Info("alert resolved", "rule", r.Name)
		delete(e.triggered, r.ID)
	}
	return nil
}

// notify emails every recipient; one bad address doesn't stop the others.
func (e *Engine) notify(ctx context.Context, r Rule, s Sample) {
	subject := "Alert: " + r.Name
	body := e.renderBody(r, s)
	for _, to := range r.EmailRecipients {
		if err := e.notifier.Send(ctx, to, subject, body); err != nil {
			e.log.Error("sending alert email", "rule_id", r.ID, "to", to, "err", err)
		}
	}
}

func (e *Engine) renderBody(r Rule, s Sample) string {
	var b strings.Builder
	row := func(label, value string) {
		fmt.Fprintf(&b, "<p><strong>%s:</strong> %s</p>\n", label, html.EscapeString(value))
	}
	b.WriteString("<h2>Alert Triggered</h2>\n")
	row("Rule", r.Name)
	row("Description", r.Description)
	row("Application", s.AppName)
	row("Metric", r.MetricName)
	row("Current Value", formatFloat(s.Value))
	row("Condition", r.Condition+" "+formatFloat(r.Threshold))
	row("Date/Time", e.now().UTC().Format(time.RFC3339Nano))
	return b.String()
}

// Evaluate reports whether value satisfies condition against threshold.
// Unknown conditions never fire.
func Evaluate(value float64, condition string, threshold float64) bool {
	switch condition {
	case "gt":
		return value > threshold
	case "lt":
		return value < threshold
	case "eq":
		return value == threshold
	default:
		return false
	}
}

func formatFloat(f float64) string { return strconv.FormatFloat(f, 'f', -1, 64) }
