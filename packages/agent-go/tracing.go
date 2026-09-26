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

func (s *SpanHandle) SetAttribute(key string, value any) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.attributes == nil {
		s.attributes = make(map[string]any)
	}
	s.attributes[key] = value
}

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
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

func generateSpanID() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

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
