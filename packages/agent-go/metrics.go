package hermes

// Increment records a counter event. Buffered, not sent immediately — see
// the batching note in client.go's doc comment.
func (c *Client) Increment(name string, value float64, labels map[string]any) {
	c.enqueueMetric(Metric{
		Name:      name,
		Type:      MetricCounter,
		Value:     value,
		Unit:      UnitCount,
		Timestamp: nowMS(),
		Labels:    labels,
	})
}

// Gauge records an instantaneous value (e.g. active connections, queue depth).
func (c *Client) Gauge(name string, value float64, unit MetricUnit, labels map[string]any) {
	if unit == "" {
		unit = UnitCount
	}
	c.enqueueMetric(Metric{
		Name:      name,
		Type:      MetricGauge,
		Value:     value,
		Unit:      unit,
		Timestamp: nowMS(),
		Labels:    labels,
	})
}

// Histogram records one observation of a distribution (e.g. request duration).
func (c *Client) Histogram(name string, value float64, unit MetricUnit, labels map[string]any) {
	if unit == "" {
		unit = UnitMilliseconds
	}
	c.enqueueMetric(Metric{
		Name:      name,
		Type:      MetricHistogram,
		Value:     value,
		Unit:      unit,
		Timestamp: nowMS(),
		Labels:    labels,
	})
}
