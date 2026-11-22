// Package streams names the Redis keys shared by collector, processor and
// api. Changing a name orphans data already in Redis;
// scripts/load-test-redis-ingest.js hardcodes the metrics stream too.
package streams

const (
	Metrics = "hermes:metrics:stream"
	Traces  = "hermes:traces:stream"
	Logs    = "hermes:logs:stream"

	// APIKeys is a hash of sha256(api key) -> tenant id. The api service
	// writes it; the collector reads it on every ingest request.
	APIKeys = "hermes:apikeys"
)

// Groups maps each stream to the processor's consumer group. The names
// predate the Go rewrite and are kept so existing backlogs carry over.
var Groups = map[string]string{
	Metrics: "processor-group",
	Traces:  "traces-processor-group",
	Logs:    "logs-processor-group",
}
