package hermes

import "net/http"

type instrumentedTransport struct {
	next   http.RoundTripper
	client *Client
}

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
