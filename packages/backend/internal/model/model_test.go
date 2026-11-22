package model

import (
	"testing"
	"time"
)

func TestModel(t *testing.T) {
	t.Run("DecodeMetric", func(t *testing.T) {
		tests := []struct {
			name    string
			json    string
			wantErr bool
		}{
			{"valid", `{"name":"cpu","type":"gauge","value":0,"unit":"percent","timestamp":1700000000000}`, false},
			{"missing name", `{"type":"gauge","value":1,"timestamp":1}`, true},
			{"bad type", `{"name":"cpu","type":"meter","value":1,"timestamp":1}`, true},
			{"missing value", `{"name":"cpu","type":"gauge","timestamp":1}`, true},
			{"string value", `{"name":"cpu","type":"gauge","value":"1","timestamp":1}`, true},
			{"zero timestamp", `{"name":"cpu","type":"gauge","value":1,"timestamp":0}`, true},
			{"negative timestamp", `{"name":"cpu","type":"gauge","value":1,"timestamp":-5}`, true},
			{"nanosecond timestamp", `{"name":"cpu","type":"gauge","value":1,"timestamp":1791161615347123456}`, true},
			{"not an object", `"cpu"`, true},
			{"malformed", `{`, true},
		}
		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				_, err := Decode[Metric]([]byte(tt.json))
				if (err != nil) != tt.wantErr {
					t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
				}
				if _, ok := err.(*ValidationError); err != nil && !ok {
					t.Fatalf("expected ValidationError, got %T", err)
				}
			})
		}
	})

	t.Run("Test MetricDefaults", func(t *testing.T) {
		m, err := Decode[Metric]([]byte(`{"name":"cpu","type":"gauge","value":1,"timestamp":1}`))
		if err != nil {
			t.Fatal(err)
		}
		if m.Tenant() != DefaultTenantID || m.Service() != UnknownService || JSONObject(m.Labels) != "{}" {
			t.Fatalf("defaults not applied: tenant=%d service=%q labels=%s", m.Tenant(), m.Service(), JSONObject(m.Labels))
		}
	})

	t.Run("Test Span", func(t *testing.T) {
		const base = `"traceId":"0123456789abcdef0123456789abcdef","spanId":"0123456789abcdef","serviceName":"api","operationName":"GET /","startTime":1,"status":"ok"`
		tests := []struct {
			name    string
			json    string
			wantErr bool
		}{
			{"valid", `{` + base + `,"duration":0}`, false},
			{"missing duration", `{` + base + `}`, true},
			{"negative duration", `{` + base + `,"duration":-1}`, true},
			{"bad parent", `{` + base + `,"duration":1,"parentSpanId":"xyz"}`, true},
			{"uppercase trace", `{"traceId":"0123456789ABCDEF0123456789ABCDEF","spanId":"0123456789abcdef","serviceName":"api","operationName":"x","startTime":1,"duration":1,"status":"ok"}`, true},
			{"bad status", `{"traceId":"0123456789abcdef0123456789abcdef","spanId":"0123456789abcdef","serviceName":"api","operationName":"x","startTime":1,"duration":1,"status":"unset"}`, true},
		}
		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				if _, err := Decode[Span]([]byte(tt.json)); (err != nil) != tt.wantErr {
					t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
				}
			})
		}
	})

	t.Run("Test DecodeLogEntry", func(t *testing.T) {
		tests := []struct {
			name    string
			json    string
			wantErr bool
		}{
			{"valid", `{"serviceName":"api","level":"info","message":"hi","timestamp":1}`, false},
			{"bad level", `{"serviceName":"api","level":"fatal","message":"hi","timestamp":1}`, true},
			{"empty message", `{"serviceName":"api","level":"info","message":"","timestamp":1}`, true},
			{"bad span id", `{"serviceName":"api","level":"info","message":"hi","timestamp":1,"spanId":"abc"}`, true},
		}
		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				if _, err := Decode[LogEntry]([]byte(tt.json)); (err != nil) != tt.wantErr {
					t.Fatalf("err = %v, wantErr %v", err, tt.wantErr)
				}
			})
		}
	})

	t.Run("Test Millis To Time Truncates Like JS", func(t *testing.T) {
		got := MillisToTime(1700000000123.9)
		want := time.UnixMilli(1700000000123).UTC()
		if !got.Equal(want) {
			t.Fatalf("got %v, want %v", got, want)
		}
	})
}

func TestDecodeErrorMessages(t *testing.T) {
	tests := []struct{ json, want string }{
		{`"cpu"`, "Payload must be a JSON object"},
		{`{"name":"cpu","type":"gauge","value":"1","timestamp":1}`, `Field "value" must be a number`},
		{`{"name":"cpu","type":"meter","value":1,"timestamp":1}`, "Metric type must be one of: counter, gauge, histogram, summary"},
	}
	for _, tt := range tests {
		_, err := Decode[Metric]([]byte(tt.json))
		if err == nil || err.Error() != tt.want {
			t.Errorf("Decode(%s) error = %v, want %q", tt.json, err, tt.want)
		}
	}
}
