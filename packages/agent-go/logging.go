package hermes

import "context"

// Log records a log entry, auto-correlating it with the trace/span active
// in ctx (if any) — mirrors packages/agent/src/logging/log.ts's behavior,
// via explicit ctx instead of Node's ambient AsyncLocalStorage.
func (c *Client) Log(ctx context.Context, level LogLevel, message string, attributes map[string]any) {
	entry := LogEntry{
		Level:      level,
		Message:    message,
		Timestamp:  nowMS(),
		Attributes: attributes,
	}
	if sc, ok := spanFromContext(ctx); ok {
		entry.TraceID = sc.traceID
		entry.SpanID = sc.spanID
	}
	c.enqueueLog(entry)
}

func (c *Client) Debug(ctx context.Context, message string, attributes map[string]any) {
	c.Log(ctx, LogDebug, message, attributes)
}

func (c *Client) Info(ctx context.Context, message string, attributes map[string]any) {
	c.Log(ctx, LogInfo, message, attributes)
}

func (c *Client) Warn(ctx context.Context, message string, attributes map[string]any) {
	c.Log(ctx, LogWarn, message, attributes)
}

func (c *Client) Error(ctx context.Context, message string, attributes map[string]any) {
	c.Log(ctx, LogError, message, attributes)
}

// CaptureException logs an error-level entry with the error's message
// folded into attributes, mirroring @hermes/agent's captureException.
func (c *Client) CaptureException(ctx context.Context, err error, attributes map[string]any) {
	if attributes == nil {
		attributes = make(map[string]any)
	}
	attributes["error.message"] = err.Error()
	c.Log(ctx, LogError, err.Error(), attributes)
}
