package hermes

import (
	"runtime"
	"time"
)

var processStart = time.Now()

func (c *Client) collectAutoMetrics() {
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	c.enqueueMetric(Metric{
		Name: "process.uptime", Type: MetricGauge, Unit: UnitSeconds,
		Value: time.Since(processStart).Seconds(), Timestamp: nowMS(),
	})
	c.enqueueMetric(Metric{
		Name: "go.goroutines", Type: MetricGauge, Unit: UnitCount,
		Value: float64(runtime.NumGoroutine()), Timestamp: nowMS(),
	})
	c.enqueueMetric(Metric{
		Name: "process.memory.alloc", Type: MetricGauge, Unit: UnitBytes,
		Value: float64(m.Alloc), Timestamp: nowMS(),
	})
	c.enqueueMetric(Metric{
		Name: "process.memory.sys", Type: MetricGauge, Unit: UnitBytes,
		Value: float64(m.Sys), Timestamp: nowMS(),
	})
	c.enqueueMetric(Metric{
		Name: "go.gc.pauseNs", Type: MetricGauge, Unit: UnitMilliseconds,
		Value: float64(m.PauseNs[(m.NumGC+255)%256]) / 1e6, Timestamp: nowMS(),
	})
}
