// Package model defines the ingestion wire types (what agents send to the
// collector and the collector writes to Redis Streams) and their validation.
// Messages are returned to clients verbatim. The Node agent's types live in
// packages/shared; keep field names in sync with them.
package model

import (
	"bytes"
	"encoding/json"
	"fmt"
	"regexp"
	"time"

	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/jsonx"
)

const (
	DefaultTenantID = 1
	UnknownService  = "unknown"
)

var (
	traceIDRe = regexp.MustCompile(`^[0-9a-f]{32}$`)
	spanIDRe  = regexp.MustCompile(`^[0-9a-f]{16}$`)
)

// ValidationError marks a message that can never be persisted and should be
// dead-lettered instead of retried.
type ValidationError struct{ msg string }

func (e *ValidationError) Error() string { return e.msg }

func invalid(format string, args ...any) error {
	return &ValidationError{msg: fmt.Sprintf(format, args...)}
}

// Decode unmarshals a payload and validates it. Malformed JSON is reported
// as a ValidationError too, since retrying it can never succeed.
func Decode[T interface{ Validate() error }](data []byte) (T, error) {
	var v T
	trimmed := bytes.TrimSpace(data)
	if len(trimmed) == 0 || trimmed[0] != '{' {
		return v, invalid("Payload must be a JSON object")
	}
	if err := json.Unmarshal(trimmed, &v); err != nil {
		if msg, ok := jsonx.TypeError(err); ok {
			return v, invalid("%s", msg)
		}
		return v, invalid("Malformed JSON: %v", err)
	}
	return v, v.Validate()
}

// maxMillis is the largest timestamp a JavaScript Date can hold (year
// 275760). Larger values (e.g. nanoseconds sent by mistake) would overflow
// time.UnixMilli and be stored as garbage dates.
const maxMillis = 8.64e15

func validMillis(ms float64) bool { return ms > 0 && ms <= maxMillis }

// MillisToTime matches JavaScript's new Date(ms), which truncates fractions.
func MillisToTime(ms float64) time.Time {
	return time.UnixMilli(int64(ms)).UTC()
}

// JSONObject returns raw as-is, or "{}" when absent, matching
// JSON.stringify(x || {}) in the Node processor.
func JSONObject(raw json.RawMessage) string {
	if len(raw) == 0 || string(raw) == "null" {
		return "{}"
	}
	return string(raw)
}

func tenantOrDefault(id *int32) int32 {
	if id == nil {
		return DefaultTenantID
	}
	return *id
}

func orUnknown(s string) string {
	if s == "" {
		return UnknownService
	}
	return s
}

type Metric struct {
	Name      string          `json:"name"`
	Type      string          `json:"type"`
	Value     *float64        `json:"value"`
	Unit      string          `json:"unit"`
	Timestamp float64         `json:"timestamp"`
	TenantID  *int32          `json:"tenantId"`
	Labels    json.RawMessage `json:"labels"`
	Metadata  struct {
		Service string `json:"service"`
	} `json:"metadata"`
}

var metricTypes = map[string]bool{"counter": true, "gauge": true, "histogram": true, "summary": true}

func (m Metric) Validate() error {
	switch {
	case m.Name == "":
		return invalid("Metric name must be a string")
	case !metricTypes[m.Type]:
		return invalid("Metric type must be one of: counter, gauge, histogram, summary")
	case m.Value == nil:
		return invalid("Metric value must be a valid number")
	case !validMillis(m.Timestamp):
		return invalid("Metric timestamp must be a valid number")
	}
	return nil
}

func (m Metric) Tenant() int32   { return tenantOrDefault(m.TenantID) }
func (m Metric) Service() string { return orUnknown(m.Metadata.Service) }

type Span struct {
	TraceID       string          `json:"traceId"`
	SpanID        string          `json:"spanId"`
	ParentSpanID  *string         `json:"parentSpanId"`
	ServiceName   string          `json:"serviceName"`
	OperationName string          `json:"operationName"`
	StartTime     float64         `json:"startTime"`
	Duration      *float64        `json:"duration"`
	Status        string          `json:"status"`
	TenantID      *int32          `json:"tenantId"`
	Attributes    json.RawMessage `json:"attributes"`
}

func (s Span) Validate() error {
	switch {
	case !traceIDRe.MatchString(s.TraceID):
		return invalid("Span traceId must be a 32-char hex string")
	case !spanIDRe.MatchString(s.SpanID):
		return invalid("Span spanId must be a 16-char hex string")
	case s.ParentSpanID != nil && !spanIDRe.MatchString(*s.ParentSpanID):
		return invalid("Span parentSpanId must be a 16-char hex string")
	case s.ServiceName == "":
		return invalid("Span serviceName must be a string")
	case s.OperationName == "":
		return invalid("Span operationName must be a string")
	case !validMillis(s.StartTime):
		return invalid("Span startTime must be a valid number")
	case s.Duration == nil || *s.Duration < 0:
		return invalid("Span duration must be a non-negative number")
	case s.Status != "ok" && s.Status != "error":
		return invalid("Span status must be one of: ok, error")
	}
	return nil
}

func (s Span) Tenant() int32 { return tenantOrDefault(s.TenantID) }

type LogEntry struct {
	ServiceName string          `json:"serviceName"`
	Level       string          `json:"level"`
	Message     string          `json:"message"`
	Timestamp   float64         `json:"timestamp"`
	TenantID    *int32          `json:"tenantId"`
	TraceID     *string         `json:"traceId"`
	SpanID      *string         `json:"spanId"`
	Attributes  json.RawMessage `json:"attributes"`
}

var logLevels = map[string]bool{"debug": true, "info": true, "warn": true, "error": true}

func (l LogEntry) Validate() error {
	switch {
	case l.ServiceName == "":
		return invalid("Log entry serviceName must be a string")
	case !logLevels[l.Level]:
		return invalid("Log entry level must be one of: debug, info, warn, error")
	case l.Message == "":
		return invalid("Log entry message must be a string")
	case !validMillis(l.Timestamp):
		return invalid("Log entry timestamp must be a valid number")
	case l.TraceID != nil && !traceIDRe.MatchString(*l.TraceID):
		return invalid("Log entry traceId must be a 32-char hex string")
	case l.SpanID != nil && !spanIDRe.MatchString(*l.SpanID):
		return invalid("Log entry spanId must be a 16-char hex string")
	}
	return nil
}

func (l LogEntry) Tenant() int32 { return tenantOrDefault(l.TenantID) }
