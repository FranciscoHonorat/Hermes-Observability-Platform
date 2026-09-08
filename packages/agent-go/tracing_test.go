package hermes

import (
	"context"
	"regexp"
	"testing"
)

var hexTraceID = regexp.MustCompile(`^[0-9a-f]{32}$`)
var hexSpanID = regexp.MustCompile(`^[0-9a-f]{16}$`)

func TestGenerateTraceID(t *testing.T) {
	id := generateTraceID()
	if !hexTraceID.MatchString(id) {
		t.Fatalf("generateTraceID() = %q, want 32 lowercase hex chars (matches validateSpan's TRACE_ID_RE)", id)
	}
}

func TestGenerateSpanID(t *testing.T) {
	id := generateSpanID()
	if !hexSpanID.MatchString(id) {
		t.Fatalf("generateSpanID() = %q, want 16 lowercase hex chars (matches validateSpan's SPAN_ID_RE)", id)
	}
}

func TestGenerateIDsAreUnique(t *testing.T) {
	seen := make(map[string]bool)
	for i := 0; i < 1000; i++ {
		id := generateSpanID()
		if seen[id] {
			t.Fatalf("generateSpanID() produced a duplicate after %d calls: %s", i, id)
		}
		seen[id] = true
	}
}

func TestTraceparentRoundTrip(t *testing.T) {
	traceID := generateTraceID()
	spanID := generateSpanID()

	header := formatTraceparent(traceID, spanID)
	gotTrace, gotSpan, ok := parseTraceparent(header)
	if !ok {
		t.Fatalf("parseTraceparent(%q) failed to parse a header we just formatted", header)
	}
	if gotTrace != traceID || gotSpan != spanID {
		t.Fatalf("round-trip mismatch: got (%s, %s), want (%s, %s)", gotTrace, gotSpan, traceID, spanID)
	}
}

func TestParseTraceparentInvalid(t *testing.T) {
	cases := []string{
		"",
		"not-a-traceparent",
		"00-tooshort-" + generateSpanID() + "-01",
		generateTraceID(), // missing version/span/flags entirely
	}
	for _, c := range cases {
		if _, _, ok := parseTraceparent(c); ok {
			t.Errorf("parseTraceparent(%q) = ok, want failure", c)
		}
	}
}

func TestStartSpan_RootHasNoParent(t *testing.T) {
	client := NewClient(WithServiceName("test"))
	_, handle := client.StartSpan(context.Background(), "op", nil)

	if handle.parentID != "" {
		t.Errorf("root span parentID = %q, want empty", handle.parentID)
	}
	if !hexTraceID.MatchString(handle.TraceID()) {
		t.Errorf("root span traceID = %q, not valid hex", handle.TraceID())
	}
}

func TestStartSpan_ChildInheritsTraceAndParents(t *testing.T) {
	client := NewClient(WithServiceName("test"))
	ctx, root := client.StartSpan(context.Background(), "root-op", nil)
	_, child := client.StartSpan(ctx, "child-op", nil)

	if child.traceID != root.traceID {
		t.Errorf("child traceID = %s, want same as root %s", child.traceID, root.traceID)
	}
	if child.parentID != root.spanID {
		t.Errorf("child parentID = %s, want root's spanID %s", child.parentID, root.spanID)
	}
	if child.spanID == root.spanID {
		t.Error("child spanID must differ from root spanID")
	}
}

func TestSpanHandle_EndIsIdempotent(t *testing.T) {
	client := NewClient(WithServiceName("test"))
	_, handle := client.StartSpan(context.Background(), "op", nil)

	handle.End(SpanOK)
	handle.End(SpanError) // must be a no-op, not a second buffered span

	client.mu.Lock()
	n := len(client.spans)
	client.mu.Unlock()

	if n != 1 {
		t.Fatalf("buffered spans after double End() = %d, want 1", n)
	}
}
