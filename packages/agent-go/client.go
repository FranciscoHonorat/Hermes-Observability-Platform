// Package hermes is a Go client for the Hermes Observability Platform's
// Collector. It talks the same HTTP+JSON wire protocol as @hermes/agent
// (the Node SDK) — there is no Go SDK to "port"; this is a from-scratch
// client built against that protocol, adapted to idiomatic Go where a
// literal port of the Node API wouldn't make sense (see README.md).
package hermes

import (
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Client buffers metrics, spans, and logs and flushes them to the Collector
// on a timer. Unlike the Node SDK — which sends custom metrics immediately
// but only batches auto-instrumentation/spans/logs — everything here goes
// through the same buffer, flushed together. One design, easy to reason
// about, and avoids one HTTP round-trip per metric call under real load.
type Client struct {
	collectorURL  string
	serviceName   string
	environment   string
	host          string
	apiKey        string
	flushInterval time.Duration
	labels        map[string]any
	httpClient    *http.Client

	mu      sync.Mutex
	metrics []Metric
	spans   []Span
	logs    []LogEntry

	stopCh  chan struct{}
	doneCh  chan struct{}
	started bool
	startMu sync.Mutex
}

// Option configures a Client. See With* functions below.
type Option func(*Client)

func WithCollectorURL(url string) Option { return func(c *Client) { c.collectorURL = url } }
func WithServiceName(name string) Option { return func(c *Client) { c.serviceName = name } }
func WithEnvironment(env string) Option  { return func(c *Client) { c.environment = env } }
func WithAPIKey(key string) Option       { return func(c *Client) { c.apiKey = key } }
func WithHost(host string) Option        { return func(c *Client) { c.host = host } }
func WithFlushInterval(d time.Duration) Option {
	return func(c *Client) { c.flushInterval = d }
}
func WithLabels(labels map[string]any) Option { return func(c *Client) { c.labels = labels } }
func WithHTTPClient(hc *http.Client) Option   { return func(c *Client) { c.httpClient = hc } }

// NewClient builds a Client. Defaults come from HERMES_* environment
// variables, mirroring @hermes/agent's packages/agent/src/config.ts:
//
//	HERMES_COLLECTOR_URL    (default "http://localhost:4000")
//	HERMES_SERVICE_NAME     (default "unknown-service")
//	HERMES_ENVIRONMENT      (default "development")
//	HERMES_API_KEY          (default "")
//	HERMES_COLLECT_INTERVAL (default 10000, milliseconds)
//	HERMES_LABELS           (comma-separated key=value pairs)
func NewClient(opts ...Option) *Client {
	host, _ := os.Hostname()
	if h := os.Getenv("HOSTNAME"); h != "" {
		host = h
	}

	c := &Client{
		collectorURL:  envOr("HERMES_COLLECTOR_URL", "http://localhost:4000"),
		serviceName:   envOr("HERMES_SERVICE_NAME", "unknown-service"),
		environment:   envOr("HERMES_ENVIRONMENT", "development"),
		apiKey:        os.Getenv("HERMES_API_KEY"),
		host:          host,
		flushInterval: time.Duration(envIntOr("HERMES_COLLECT_INTERVAL", 10000)) * time.Millisecond,
		labels:        parseLabels(os.Getenv("HERMES_LABELS")),
		httpClient:    &http.Client{Timeout: 5 * time.Second},
	}

	for _, opt := range opts {
		opt(c)
	}
	return c
}

// Start begins the periodic flush loop in a background goroutine. Safe to
// call once; a second call is a no-op.
func (c *Client) Start() {
	c.startMu.Lock()
	defer c.startMu.Unlock()
	if c.started {
		return
	}
	c.started = true
	c.stopCh = make(chan struct{})
	c.doneCh = make(chan struct{})
	go c.flushLoop()
}

// Stop halts the flush loop and flushes whatever remains buffered before
// returning. Safe to call on a Client that was never Start()ed.
func (c *Client) Stop() {
	c.startMu.Lock()
	defer c.startMu.Unlock()
	if !c.started {
		return
	}
	close(c.stopCh)
	<-c.doneCh
	c.started = false
}

func (c *Client) flushLoop() {
	defer close(c.doneCh)
	ticker := time.NewTicker(c.flushInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			c.collectAutoMetrics()
			_ = c.Flush()
		case <-c.stopCh:
			_ = c.Flush()
			return
		}
	}
}

// Flush sends whatever is currently buffered immediately. Also called
// automatically on each tick and on Stop(). Errors from one signal type
// (metrics/spans/logs) don't block the others from being sent; the first
// error encountered is returned.
func (c *Client) Flush() error {
	c.mu.Lock()
	metrics := c.metrics
	spans := c.spans
	logs := c.logs
	c.metrics = nil
	c.spans = nil
	c.logs = nil
	c.mu.Unlock()

	var firstErr error
	if len(metrics) > 0 {
		if err := c.sendMetrics(metrics); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	if len(spans) > 0 {
		if err := c.sendSpans(spans); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	if len(logs) > 0 {
		if err := c.sendLogs(logs); err != nil && firstErr == nil {
			firstErr = err
		}
	}
	return firstErr
}

func (c *Client) enqueueMetric(m Metric) {
	m.Metadata = &MetricMetadata{Service: c.serviceName, Environment: c.environment, Host: c.host}
	if m.Labels == nil && len(c.labels) > 0 {
		m.Labels = c.labels
	}
	c.mu.Lock()
	c.metrics = append(c.metrics, m)
	c.mu.Unlock()
}

func (c *Client) enqueueSpan(s Span) {
	s.ServiceName = c.serviceName
	c.mu.Lock()
	c.spans = append(c.spans, s)
	c.mu.Unlock()
}

func (c *Client) enqueueLog(l LogEntry) {
	l.ServiceName = c.serviceName
	c.mu.Lock()
	c.logs = append(c.logs, l)
	c.mu.Unlock()
}

func envOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func envIntOr(key string, fallback int) int {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.Atoi(v); err == nil {
			return n
		}
	}
	return fallback
}

func parseLabels(raw string) map[string]any {
	if raw == "" {
		return nil
	}
	labels := make(map[string]any)
	for _, pair := range strings.Split(raw, ",") {
		kv := strings.SplitN(pair, "=", 2)
		if len(kv) == 2 {
			labels[strings.TrimSpace(kv[0])] = strings.TrimSpace(kv[1])
		}
	}
	return labels
}
