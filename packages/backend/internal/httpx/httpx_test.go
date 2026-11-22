package httpx

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestRateLimiterWindow(t *testing.T) {
	l := NewRateLimiter(2, time.Minute)
	now := time.Unix(1000, 0)
	l.now = func() time.Time { return now }

	for i, want := range []bool{true, true, false} {
		if ok, _, _ := l.Allow("a"); ok != want {
			t.Fatalf("hit %d: ok=%v", i, ok)
		}
	}
	if ok, _, _ := l.Allow("b"); !ok {
		t.Fatal("keys must be independent")
	}
	now = now.Add(time.Minute)
	if ok, remaining, _ := l.Allow("a"); !ok || remaining != 1 {
		t.Fatalf("new window: ok=%v remaining=%d", ok, remaining)
	}
}

func TestRateLimiterMiddleware(t *testing.T) {
	h := NewRateLimiter(1, time.Minute).Middleware(func(*http.Request) string { return "k" })(
		http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))

	w := httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
	if w.Code != 200 || w.Header().Get("RateLimit-Remaining") != "0" || w.Header().Get("RateLimit-Limit") != "1" {
		t.Fatalf("first: %d %v", w.Code, w.Header())
	}
	w = httptest.NewRecorder()
	h.ServeHTTP(w, httptest.NewRequest("GET", "/", nil))
	if w.Code != http.StatusTooManyRequests || w.Header().Get("Retry-After") == "" {
		t.Fatalf("second: %d %v", w.Code, w.Header())
	}
}

func TestClientIP(t *testing.T) {
	r := httptest.NewRequest("GET", "/", nil)
	r.RemoteAddr = "10.0.0.9:1234"
	r.Header.Set("X-Forwarded-For", "6.6.6.6, 1.2.3.4")

	if got := ClientIP(0)(r); got != "10.0.0.9" {
		t.Errorf("0 hops: %s", got)
	}
	// One trusted proxy appended the real client (1.2.3.4); the spoofed
	// left-most entry must be ignored.
	if got := ClientIP(1)(r); got != "1.2.3.4" {
		t.Errorf("1 hop: %s", got)
	}
	r.Header.Del("X-Forwarded-For")
	if got := ClientIP(1)(r); got != "10.0.0.9" {
		t.Errorf("no header: %s", got)
	}
}

func TestCORS(t *testing.T) {
	h := CORS([]string{"http://app"}, true)(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))

	r := httptest.NewRequest("GET", "/", nil)
	r.Header.Set("Origin", "http://app")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Header().Get("Access-Control-Allow-Origin") != "http://app" || w.Header().Get("Access-Control-Allow-Credentials") != "true" {
		t.Fatalf("allowed origin: %v", w.Header())
	}

	r.Header.Set("Origin", "http://evil")
	w = httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Header().Get("Access-Control-Allow-Origin") != "" {
		t.Fatal("foreign origin allowed")
	}

	pre := httptest.NewRequest("OPTIONS", "/", nil)
	pre.Header.Set("Origin", "http://app")
	pre.Header.Set("Access-Control-Request-Method", "POST")
	w = httptest.NewRecorder()
	h.ServeHTTP(w, pre)
	if w.Code != http.StatusNoContent {
		t.Fatalf("preflight status %d", w.Code)
	}
}

func TestCORSWildcardNeverAllowsCredentials(t *testing.T) {
	h := CORS([]string{"*"}, true)(http.HandlerFunc(func(http.ResponseWriter, *http.Request) {}))
	r := httptest.NewRequest("GET", "/", nil)
	r.Header.Set("Origin", "http://evil")
	w := httptest.NewRecorder()
	h.ServeHTTP(w, r)
	if w.Header().Get("Access-Control-Allow-Origin") != "*" || w.Header().Get("Access-Control-Allow-Credentials") != "" {
		t.Fatalf("wildcard leaked credentials: %v", w.Header())
	}
}
