package hermes

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

func (c *Client) post(path string, body any) error {
	data, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("hermes: marshal %s payload: %w", path, err)
	}

	req, err := http.NewRequest(http.MethodPost, c.collectorURL+path, bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("hermes: build request to %s: %w", path, err)
	}
	req.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		req.Header.Set("x-api-key", c.apiKey)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("hermes: send to %s: %w", path, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("hermes: %s returned %s", path, resp.Status)
	}
	return nil
}

func (c *Client) sendMetrics(metrics []Metric) error {
	return c.post("/api/v1/metrics", MetricBatch{Metrics: metrics, Timestamp: nowMS()})
}

func (c *Client) sendSpans(spans []Span) error {
	return c.post("/api/v1/traces", SpanBatch{Spans: spans, Timestamp: nowMS()})
}

func (c *Client) sendLogs(logs []LogEntry) error {
	return c.post("/api/v1/logs", LogBatch{Logs: logs, Timestamp: nowMS()})
}

func nowMS() int64 {
	return time.Now().UnixMilli()
}
