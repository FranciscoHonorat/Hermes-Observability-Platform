// Example service demonstrating the Hermes Go client end to end: manual
// metrics, HTTP middleware (auto metrics + tracing), an outgoing
// instrumented call (cross-span, exercises traceparent propagation), and
// logs correlated with the active trace. Mirrors examples/demo-app's spirit
// for the Node SDK, not a line-for-line copy.
package main

import (
	"encoding/json"
	"log"
	"math/rand"
	"net/http"
	"time"

	hermes "github.com/FranciscoHonorat/hermes-observability/packages/agent-go"
)

func main() {
	agent := hermes.NewClient() // reads HERMES_* env vars
	agent.Start()
	defer agent.Stop()

	instrumentedClient := &http.Client{
		Transport: agent.InstrumentTransport(http.DefaultTransport),
		Timeout:   5 * time.Second,
	}

	mux := http.NewServeMux()

	mux.HandleFunc("/health", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
	})

	mux.HandleFunc("/orders", func(w http.ResponseWriter, r *http.Request) {
		ctx, span := agent.StartSpan(r.Context(), "db.query orders.insert", map[string]any{"db.table": "orders"})
		time.Sleep(time.Duration(10+rand.Intn(40)) * time.Millisecond) // simulate a query
		span.End(hermes.SpanOK)

		value := 20 + rand.Float64()*180
		agent.Increment("orders_created_total", 1, map[string]any{"product": "widget"})
		agent.Gauge("order_value_usd", value, hermes.UnitCount, nil)
		agent.Info(ctx, "order created", map[string]any{"value_usd": value})

		w.WriteHeader(http.StatusCreated)
		json.NewEncoder(w).Encode(map[string]any{"value_usd": value})
	})

	// Exercises InstrumentTransport: this handler's span becomes the parent
	// of the /health call's span, via the traceparent header the instrumented
	// transport injects — proves cross-request trace propagation actually
	// round-trips through the real Collector/Processor/API, not just
	// internal bookkeeping.
	mux.HandleFunc("/call-downstream", func(w http.ResponseWriter, r *http.Request) {
		req, _ := http.NewRequestWithContext(r.Context(), http.MethodGet, "http://localhost:3334/health", nil)
		resp, err := instrumentedClient.Do(req)
		if err != nil {
			agent.CaptureException(r.Context(), err, nil)
			w.WriteHeader(http.StatusBadGateway)
			return
		}
		defer resp.Body.Close()
		w.WriteHeader(http.StatusOK)
		json.NewEncoder(w).Encode(map[string]string{"downstream_status": resp.Status})
	})

	mux.HandleFunc("/error", func(w http.ResponseWriter, r *http.Request) {
		agent.Increment("forced_errors_total", 1, map[string]any{"type": "500"})
		agent.Error(r.Context(), "simulated failure", nil)
		http.Error(w, "simulated server error", http.StatusInternalServerError)
	})

	handler := agent.HTTPMiddleware()(mux)

	addr := ":3334"
	log.Printf("hermes go example listening on %s (service=%s, collector=%s)", addr, "see HERMES_SERVICE_NAME", "see HERMES_COLLECTOR_URL")
	log.Fatal(http.ListenAndServe(addr, handler))
}
