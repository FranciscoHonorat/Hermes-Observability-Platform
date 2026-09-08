package hermes

import (
	"runtime"
	"time"
)

var processStart = time.Now()

// collectAutoMetrics gathers stdlib-only runtime metrics — no gopsutil or
// other third-party dependency, matching the rest of this project's
// minimal-dependency stance. Go has no direct equivalents to Node's
// system-wide os.cpus()-based CPU% or "event loop lag"; goroutine count and
// GC pause time are the idiomatic Go-native health signals used instead.
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
