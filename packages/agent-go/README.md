# hermes (Go client)

A Go client for the [Hermes Observability Platform](../../README.md)'s Collector. There is no Go SDK to port from — `@hermes/agent` is Node-only — this talks the same HTTP+JSON wire protocol directly (`POST /api/v1/{metrics,traces,logs}` on the Collector), built fresh for idiomatic Go.

## Install

Not published to a registry. Reference it from your `go.mod` with a local `replace`, the same way [`examples/demo-app`](../../examples/demo-app) uses `file:../../packages/agent` for the Node SDK:

```
require github.com/FranciscoHonorat/hermes-observability/packages/agent-go v0.0.0

replace github.com/FranciscoHonorat/hermes-observability/packages/agent-go => /path/to/hermes-observability/packages/agent-go
```

## Quickstart

```go
package main

import (
	"context"
	"net/http"

	hermes "github.com/FranciscoHonorat/hermes-observability/packages/agent-go"
)

func main() {
	agent := hermes.NewClient() // reads HERMES_* env vars, see below
	agent.Start()               // periodic flush + auto runtime metrics
	defer agent.Stop()          // flushes whatever's left before exiting

	mux := http.NewServeMux()
	mux.HandleFunc("/orders", func(w http.ResponseWriter, r *http.Request) {
		agent.Increment("orders_created_total", 1, map[string]any{"product": "widget"})
		w.WriteHeader(http.StatusCreated)
	})

	// Wraps every request in a span, records http_requests_total /
	// http_request_duration_ms / http_errors_total automatically.
	handler := agent.HTTPMiddleware()(mux)
	http.ListenAndServe(":8080", handler)

	_ = context.Background() // see Tracing below for real ctx usage
}
```

## Environment variables

Same names as `@hermes/agent` (`packages/agent/src/config.ts`), so a Go and Node service in the same deployment configure identically:

| Var | Default | Notes |
|---|---|---|
| `HERMES_COLLECTOR_URL` | `http://localhost:4000` | |
| `HERMES_SERVICE_NAME` | `unknown-service` | becomes `app_name` everywhere in the UI/API |
| `HERMES_ENVIRONMENT` | `development` | |
| `HERMES_API_KEY` | *(empty)* | required if the Collector's `COLLECTOR_API_KEYS` is set |
| `HERMES_COLLECT_INTERVAL` | `10000` | flush interval, **milliseconds** |
| `HERMES_LABELS` | *(empty)* | comma-separated `key=value` pairs, attached to every metric |

Override any of these per-client with `hermes.NewClient(hermes.WithServiceName("..."), ...)`.

## Two departures from the Node SDK

Both because a literal port would be worse Go, not because the Node SDK is wrong for Node:

1. **Everything batches.** `@hermes/agent`'s `increment()`/`gauge()`/`histogram()` send one HTTP request per call immediately; only auto-instrumentation, spans, and logs wait for the periodic flush. This client batches metrics, spans, and logs together through one buffer, flushed on the same timer (`Start()`/`Stop()`/manual `Flush()`) — no per-call HTTP round-trip under load.
2. **Explicit `context.Context`, not ambient state.** Node's tracing uses `AsyncLocalStorage` so a started span is ambiently visible to nested code. Go has no equivalent — `context.Context`, threaded explicitly, is the idiomatic (and only correct) way to do this. `StartSpan`/`Log`/`Debug`/`Info`/`Warn`/`Error`/`CaptureException` all take `ctx` as their first argument; pass the `context.Context` `StartSpan` returns to anything that should nest under that span.

## Tracing

```go
ctx, span := agent.StartSpan(r.Context(), "db.query orders.insert", map[string]any{"db.table": "orders"})
defer span.End(hermes.SpanOK) // or hermes.SpanError

// A log written with this ctx auto-correlates with the span above:
agent.Info(ctx, "order inserted", nil)

// An outgoing call through an instrumented transport continues the trace
// into whatever service receives it (reads/writes the W3C `traceparent`
// header, same format packages/agent/src/tracing/httpTracingMiddleware.ts uses):
client := &http.Client{Transport: agent.InstrumentTransport(http.DefaultTransport)}
req, _ := http.NewRequestWithContext(ctx, http.MethodPost, "http://payment-service/charge", body)
client.Do(req)
```

`HTTPMiddleware()` does the incoming half of this automatically — reads an inbound `traceparent`, starts/continues the span, records the three `http_*` metrics, and sets the outbound `traceparent` response header. It's stdlib `net/http`-compatible, so it composes into `chi`, `gorilla/mux`, or a bare `http.ServeMux`. Framework-specific adapters (Gin, Echo) aren't included — wrap `HTTPMiddleware()`'s handler or call `StartSpan`/`Increment` directly in that framework's middleware hook.

## Auto-instrumentation

Collected once per flush interval, stdlib-only (no `gopsutil` or other third-party dependency): `process.uptime`, `go.goroutines`, `process.memory.alloc`, `process.memory.sys`, `go.gc.pauseNs`. Go has no direct equivalent to Node's system-wide `os.cpus()` CPU% or "event loop lag" — goroutine count and GC pause are the idiomatic Go-native signals used instead.

## What's not here yet

- System-wide (not just process) CPU/memory — would need a dependency like `gopsutil`.
- Gin/Echo-specific middleware adapters — `HTTPMiddleware()` covers stdlib `net/http` and anything built on it.
