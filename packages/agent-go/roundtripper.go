package hermes

import "net/http"

// instrumentedTransport wraps an http.RoundTripper to inject the active
// trace's traceparent header on every outgoing request and wrap the call in
// a child span. RoundTripper is Go's idiomatic interception point for
// outgoing HTTP (arguably a cleaner fit than axios interceptors) — mirrors
// packages/agent/src/tracing/instrumentAxios.ts. Without this, a call to
// another Hermes-instrumented service starts a disconnected trace instead
// of continuing the caller's.
type instrumentedTransport struct {
	next   http.RoundTripper
	client *Client
}

// InstrumentTransport wraps rt (pass http.DefaultTransport for the common
// case) so requests made through it participate in the trace active on the
// request's context:
//
//	httpClient := &http.Client{Transport: agent.InstrumentTransport(http.DefaultTransport)}
//	req, _ := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
//	httpClient.Do(req) // propagates the trace from ctx automatically
func (c *Client) InstrumentTransport(rt http.RoundTripper) http.RoundTripper {
	if rt == nil {
		rt = http.DefaultTransport
	}
	return &instrumentedTransport{next: rt, client: c}
}

func (t *instrumentedTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	ctx, handle := t.client.StartSpan(req.Context(), "http.client "+req.Method, map[string]any{
		"http.method": req.Method,
		"http.url":    req.URL.String(),
	})

	req = req.Clone(ctx)
	req.Header.Set("traceparent", formatTraceparent(handle.TraceID(), handle.SpanID()))

	resp, err := t.next.RoundTrip(req)
	if err != nil {
		handle.SetAttribute("error", err.Error())
		handle.End(SpanError)
		return resp, err
	}

	handle.SetAttribute("http.status_code", resp.StatusCode)
	status := SpanOK
	if resp.StatusCode >= 400 {
		status = SpanError
	}
	handle.End(status)
	return resp, nil
}
