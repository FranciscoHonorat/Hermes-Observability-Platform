package hermes

// Wire types — json tags match packages/shared/src/types/{metricTypes,traceTypes,logTypes}.ts
// field-for-field. This is the actual integration contract: the Collector
// validates against those TS shapes (validateMetric/validateSpan/validateLogEntry
// in packages/shared/src/utilities/validationUtilities.ts), not this file.

// MetricType mirrors packages/shared/src/types/metricTypes.ts's MetricType enum.
type MetricType string

const (
	MetricCounter   MetricType = "counter"
	MetricGauge     MetricType = "gauge"
	MetricHistogram MetricType = "histogram"
	MetricSummary   MetricType = "summary"
)

// MetricUnit mirrors packages/shared/src/types/metricTypes.ts's MetricUnit enum.
type MetricUnit string

const (
	UnitBytes             MetricUnit = "bytes"
	UnitMilliseconds      MetricUnit = "milliseconds"
	UnitSeconds           MetricUnit = "seconds"
	UnitPercent           MetricUnit = "percent"
	UnitCount             MetricUnit = "count"
	UnitRequestsPerSecond MetricUnit = "rps"
)

// SpanStatus mirrors packages/shared/src/types/traceTypes.ts's SpanStatus.
type SpanStatus string

const (
	SpanOK    SpanStatus = "ok"
	SpanError SpanStatus = "error"
)

// LogLevel mirrors packages/shared/src/types/logTypes.ts's LogEntryLevel.
type LogLevel string

const (
	LogDebug LogLevel = "debug"
	LogInfo  LogLevel = "info"
	LogWarn  LogLevel = "warn"
	LogError LogLevel = "error"
)

// MetricMetadata mirrors Metric.metadata in metricTypes.ts.
type MetricMetadata struct {
	Source      string `json:"source,omitempty"`
	Service     string `json:"service,omitempty"`
	Environment string `json:"environment,omitempty"`
	Host        string `json:"host,omitempty"`
	Version     string `json:"version,omitempty"`
}

// Metric mirrors packages/shared/src/types/metricTypes.ts's Metric interface.
type Metric struct {
	Name      string          `json:"name"`
	Type      MetricType      `json:"type"`
	Value     float64         `json:"value"`
	Unit      MetricUnit      `json:"unit"`
	Timestamp int64           `json:"timestamp"` // epoch ms
	Labels    map[string]any  `json:"labels,omitempty"`
	Metadata  *MetricMetadata `json:"metadata,omitempty"`
}

// MetricBatch mirrors packages/shared/src/types/metricTypes.ts's MetricBatch.
type MetricBatch struct {
	Metrics   []Metric `json:"metrics"`
	Timestamp int64    `json:"timestamp"`
}

// Span mirrors packages/shared/src/types/traceTypes.ts's Span interface.
type Span struct {
	TraceID       string         `json:"traceId"`
	SpanID        string         `json:"spanId"`
	ParentSpanID  string         `json:"parentSpanId,omitempty"`
	ServiceName   string         `json:"serviceName"`
	OperationName string         `json:"operationName"`
	StartTime     int64          `json:"startTime"` // epoch ms
	Duration      float64        `json:"duration"`  // ms
	Status        SpanStatus     `json:"status"`
	Attributes    map[string]any `json:"attributes,omitempty"`
}

// SpanBatch mirrors packages/shared/src/types/traceTypes.ts's SpanBatch.
type SpanBatch struct {
	Spans     []Span `json:"spans"`
	Timestamp int64  `json:"timestamp"`
}

// LogEntry mirrors packages/shared/src/types/logTypes.ts's LogEntry interface.
type LogEntry struct {
	ServiceName string         `json:"serviceName"`
	Level       LogLevel       `json:"level"`
	Message     string         `json:"message"`
	Timestamp   int64          `json:"timestamp"` // epoch ms
	TraceID     string         `json:"traceId,omitempty"`
	SpanID      string         `json:"spanId,omitempty"`
	Attributes  map[string]any `json:"attributes,omitempty"`
}

// LogBatch mirrors packages/shared/src/types/logTypes.ts's LogBatch.
type LogBatch struct {
	Logs      []LogEntry `json:"logs"`
	Timestamp int64      `json:"timestamp"`
}
