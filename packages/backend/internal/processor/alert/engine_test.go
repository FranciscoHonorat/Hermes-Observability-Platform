package alert

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"strings"
	"testing"
	"time"
)

func TestEvaluate(t *testing.T) {
	tests := []struct {
		value     float64
		condition string
		threshold float64
		want      bool
	}{
		{150, "gt", 100, true},
		{100, "gt", 100, false},
		{50, "gt", 100, false},
		{50, "lt", 100, true},
		{100, "lt", 100, false},
		{150, "lt", 100, false},
		{100, "eq", 100, true},
		{100.01, "eq", 100, false},
		{1000, "between", 100, false},
	}
	for _, tt := range tests {
		if got := Evaluate(tt.value, tt.condition, tt.threshold); got != tt.want {
			t.Errorf("Evaluate(%v, %q, %v) = %v, want %v", tt.value, tt.condition, tt.threshold, got, tt.want)
		}
	}
}

type fakeStore struct {
	rules    []Rule
	samples  map[int64]Sample
	recorded []Sample
}

func (f *fakeStore) EnabledRules(context.Context) ([]Rule, error) { return f.rules, nil }
func (f *fakeStore) LatestSample(_ context.Context, r Rule) (Sample, bool, error) {
	s, ok := f.samples[r.ID]
	return s, ok, nil
}
func (f *fakeStore) RecordAlert(_ context.Context, _ Rule, s Sample) error {
	f.recorded = append(f.recorded, s)
	return nil
}

type sent struct{ to, subject, body string }

type fakeNotifier struct {
	sent   []sent
	failTo string
}

func (f *fakeNotifier) Send(_ context.Context, to, subject, body string) error {
	if to == f.failTo {
		return errors.New("mailbox unavailable")
	}
	f.sent = append(f.sent, sent{to, subject, body})
	return nil
}

func newTestEngine(s Store, n Notifier) *Engine {
	e := NewEngine(s, n, time.Second, slog.New(slog.NewTextHandler(io.Discard, nil)))
	e.now = func() time.Time { return time.Date(2026, 1, 2, 3, 4, 5, 0, time.UTC) }
	return e
}

func TestEngineNotifiesOnceUntilResolved(t *testing.T) {
	ctx := context.Background()
	st := &fakeStore{
		rules:   []Rule{{ID: 1, Name: "High CPU", MetricName: "cpu", Condition: "gt", Threshold: 90, EmailRecipients: []string{"a@x.io", "b@x.io"}}},
		samples: map[int64]Sample{1: {Value: 95, AppName: "api"}},
	}
	n := &fakeNotifier{}
	e := newTestEngine(st, n)

	step := func(value float64, wantSent, wantRecorded int) {
		t.Helper()
		st.samples[1] = Sample{Value: value, AppName: "api"}
		if err := e.Check(ctx); err != nil {
			t.Fatal(err)
		}
		if len(n.sent) != wantSent || len(st.recorded) != wantRecorded {
			t.Fatalf("value %v: sent=%d recorded=%d, want %d/%d", value, len(n.sent), len(st.recorded), wantSent, wantRecorded)
		}
	}
	step(95, 2, 1) // fires: both recipients emailed, history recorded
	step(97, 2, 1) // still firing: no repeat
	step(50, 2, 1) // resolved
	step(99, 4, 2) // fires again
}

func TestEngineSkipsRulesWithoutData(t *testing.T) {
	st := &fakeStore{rules: []Rule{{ID: 1, Condition: "gt", Threshold: 0, EmailRecipients: []string{"a@x.io"}}}}
	n := &fakeNotifier{}
	if err := newTestEngine(st, n).Check(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(n.sent) != 0 {
		t.Fatal("notified without any metric data")
	}
}

func TestEngineKeepsNotifyingAfterRecipientFailure(t *testing.T) {
	st := &fakeStore{
		rules:   []Rule{{ID: 1, Condition: "gt", Threshold: 0, EmailRecipients: []string{"bad@x.io", "good@x.io"}}},
		samples: map[int64]Sample{1: {Value: 1}},
	}
	n := &fakeNotifier{failTo: "bad@x.io"}
	if err := newTestEngine(st, n).Check(context.Background()); err != nil {
		t.Fatal(err)
	}
	if len(n.sent) != 1 || n.sent[0].to != "good@x.io" || len(st.recorded) != 1 {
		t.Fatalf("sent=%v recorded=%d", n.sent, len(st.recorded))
	}
}

func TestBodyEscapesHTML(t *testing.T) {
	desc := `<script>alert("x")</script>`
	st := &fakeStore{
		rules:   []Rule{{ID: 1, Name: "R & D", Description: desc, MetricName: "m", Condition: "gt", Threshold: 1.5, EmailRecipients: []string{"a@x.io"}}},
		samples: map[int64]Sample{1: {Value: 2, AppName: "<api>"}},
	}
	n := &fakeNotifier{}
	if err := newTestEngine(st, n).Check(context.Background()); err != nil {
		t.Fatal(err)
	}
	body := n.sent[0].body
	for _, want := range []string{"R &amp; D", "&lt;script&gt;", "&lt;api&gt;", "gt 1.5", "Current Value:</strong> 2<", "2026-01-02T03:04:05Z"} {
		if !strings.Contains(body, want) {
			t.Errorf("body missing %q:\n%s", want, body)
		}
	}
	if strings.Contains(body, "<script>") {
		t.Error("unescaped HTML in body")
	}
	if n.sent[0].subject != "Alert: R & D" {
		t.Errorf("subject = %q", n.sent[0].subject)
	}
}
