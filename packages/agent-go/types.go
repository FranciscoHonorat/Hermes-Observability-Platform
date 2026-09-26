package hermes

type MetricType string

const (
	MetricCounter   MetricType = "counter"
	MetricGauge     MetricType = "gauge"
	MetricHistogram MetricType = "histogram"
	MetricSummary   MetricType = "summary"
)

type MetricUnit string

const (
	UnitBytes             MetricUnit = "bytes"
	UnitMilliseconds      MetricUnit = "milliseconds"
	UnitSeconds           MetricUnit = "seconds"
	UnitPercent           MetricUnit = "percent"
	UnitCount             MetricUnit = "count"
	UnitRequestsPerSecond MetricUnit = "rps"
)

type SpanStatus string

const (
	SpanOK    SpanStatus = "ok"
	SpanError SpanStatus = "error"
)

type LogLevel string

const (
	LogDebug LogLevel = "debug"
	LogInfo  LogLevel = "info"
	LogWarn  LogLevel = "warn"
	LogError LogLevel = "error"
)

type MetricMetadata struct {
	Source      string `json:"source,omitempty"`
	Service     string `json:"service,omitempty"`
	Environment string `json:"environment,omitempty"`
	Host        string `json:"host,omitempty"`
	Version     string `json:"version,omitempty"`
}

type Metric struct {
	Name      string          `json:"name"`
	Type      MetricType      `json:"type"`
	Value     float64         `json:"value"`
	Unit      MetricUnit      `json:"unit"`
	Timestamp int64           `json:"timestamp"`
	Labels    map[string]any  `json:"labels,omitempty"`
	Metadata  *MetricMetadata `json:"metadata,omitempty"`
}

type MetricBatch struct {
	Metrics   []Metric `json:"metrics"`
	Timestamp int64    `json:"timestamp"`
}

type Span struct {
	TraceID       string         `json:"traceId"`
	SpanID        string         `json:"spanId"`
	ParentSpanID  string         `json:"parentSpanId,omitempty"`
	ServiceName   string         `json:"serviceName"`
	OperationName string         `json:"operationName"`
	StartTime     int64          `json:"startTime"`
	Duration      float64        `json:"duration"`
	Status        SpanStatus     `json:"status"`
	Attributes    map[string]any `json:"attributes,omitempty"`
}

type SpanBatch struct {
	Spans     []Span `json:"spans"`
	Timestamp int64  `json:"timestamp"`
}

type LogEntry struct {
	ServiceName string         `json:"serviceName"`
	Level       LogLevel       `json:"level"`
	Message     string         `json:"message"`
	Timestamp   int64          `json:"timestamp"`
	TraceID     string         `json:"traceId,omitempty"`
	SpanID      string         `json:"spanId,omitempty"`
	Attributes  map[string]any `json:"attributes,omitempty"`
}

type LogBatch struct {
	Logs      []LogEntry `json:"logs"`
	Timestamp int64      `json:"timestamp"`
}
