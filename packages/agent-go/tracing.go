package hermes

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"regexp"
	"strings"
	"sync"
	"time"
)

// SpanHandle is a live, in-progress span returned by StartSpan. Call End()
// exactly once when the operation completes. Distinct from Span (types.go),
// which is the finished, serialized wire representation sent to the
// Collector — SpanHandle is what your code holds and mutates while the
// operation is still running.
type SpanHandle struct {
	traceID   string
	spanID    string
	parentID  string
	operation string
	startTime time.Time
	client    *Client

	mu         sync.Mutex
	attributes map[string]any
	ended      bool
}

func (s *SpanHandle) TraceID() string { return s.traceID }
func (s *SpanHandle) SpanID() string  { return s.spanID }

// SetAttribute attaches a key/value to the span. Safe to call concurrently
// and any time before End().
func (s *SpanHandle) SetAttribute(key string, value any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.attributes == nil {
		s.attributes = make(map[string]any)
	}
	s.attributes[key] = value
}

// End finishes the span and buffers it for the next flush. A second call is
// a no-op (guards against a deferred End() alongside an explicit early one).
func (s *SpanHandle) End(status SpanStatus) {
	s.mu.Lock()
	if s.ended {
		s.mu.Unlock()
		return
	}
	s.ended = true
	attrs := s.attributes
	s.mu.Unlock()

	s.client.enqueueSpan(Span{
		TraceID:       s.traceID,
		SpanID:        s.spanID,
		ParentSpanID:  s.parentID,
		OperationName: s.operation,
		StartTime:     s.startTime.UnixMilli(),
		Duration:      float64(time.Since(s.startTime)) / float64(time.Millisecond),
		Status:        status,
		Attributes:    attrs,
	})
}

// spanContext is what's threaded through context.Context — deliberately not
// exported. Node's AsyncLocalStorage makes the active span ambiently
// available to nested code with no explicit passing; Go has no ambient-context
// equivalent, so context.Context propagation (explicit, via the ctx
// parameter) is the idiomatic and only correct way to do this here.
type spanContext struct {
	traceID string
	spanID  string
}

type spanCtxKeyType struct{}

var spanCtxKey = spanCtxKeyType{}

func spanFromContext(ctx context.Context) (spanContext, bool) {
	sc, ok := ctx.Value(spanCtxKey).(spanContext)
	return sc, ok
}

// StartSpan starts a new span, parented to whatever span is active in ctx
// (if any), or the start of a new trace if not. Returns a new context
// carrying this span as active — pass it to anything downstream that
// should nest under it (including Log calls, for trace correlation).
func (c *Client) StartSpan(ctx context.Context, operationName string, attributes map[string]any) (context.Context, *SpanHandle) {
	traceID := generateTraceID()
	parentID := ""
	if parent, ok := spanFromContext(ctx); ok {
		traceID = parent.traceID
		parentID = parent.spanID
	}
	spanID := generateSpanID()

	handle := &SpanHandle{
		traceID: traceID, spanID: spanID, parentID: parentID,
		operation: operationName, startTime: time.Now(),
		attributes: attributes, client: c,
	}

	newCtx := context.WithValue(ctx, spanCtxKey, spanContext{traceID: traceID, spanID: spanID})
	return newCtx, handle
}

func generateTraceID() string {
	b := make([]byte, 16) // 32 hex chars — matches validateSpan's TRACE_ID_RE
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func generateSpanID() string {
	b := make([]byte, 8) // 16 hex chars — matches validateSpan's SPAN_ID_RE
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// traceparentRe matches the W3C Trace Context header format:
// version-traceid-parentid-flags, e.g. "00-<32 hex>-<16 hex>-01". Same
// format packages/agent/src/tracing/httpTracingMiddleware.ts parses.
var traceparentRe = regexp.MustCompile(`^[0-9a-f]{2}-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$`)

func parseTraceparent(header string) (traceID, parentSpanID string, ok bool) {
	m := traceparentRe.FindStringSubmatch(strings.TrimSpace(header))
	if m == nil {
		return "", "", false
	}
	return m[1], m[2], true
}

func formatTraceparent(traceID, spanID string) string {
	return fmt.Sprintf("00-%s-%s-01", traceID, spanID)
}
