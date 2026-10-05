package httpx

import (
	"math"
	"net/http"
	"strconv"
	"sync"
	"time"
)

// RateLimiter is an in-memory fixed-window limiter keyed by client, with the
// same semantics and RateLimit-* headers as express-rate-limit. Counts are
// per process: N replicas allow up to N times the limit.
type RateLimiter struct {
	limit  int
	window time.Duration
	now    func() time.Time

	mu        sync.Mutex
	buckets   map[string]*bucket
	nextSweep time.Time
}

type bucket struct {
	count int
	reset time.Time
}

func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	return &RateLimiter{limit: limit, window: window, now: time.Now, buckets: map[string]*bucket{}}
}

// Allow records a hit for key and reports whether it is within the limit,
// how many hits remain and when the window resets.
func (l *RateLimiter) Allow(key string) (ok bool, remaining int, reset time.Time) {
	l.mu.Lock()
	defer l.mu.Unlock()

	now := l.now()
	if now.After(l.nextSweep) {
		for k, b := range l.buckets {
			if !now.Before(b.reset) {
				delete(l.buckets, k)
			}
		}
		l.nextSweep = now.Add(l.window)
	}

	b, found := l.buckets[key]
	if !found || !now.Before(b.reset) {
		b = &bucket{reset: now.Add(l.window)}
		l.buckets[key] = b
	}
	b.count++
	return b.count <= l.limit, max(l.limit-b.count, 0), b.reset
}

// Middleware rejects clients over the limit with 429.
func (l *RateLimiter) Middleware(key ClientIPFunc) Middleware {
	policy := strconv.Itoa(l.limit) + ";w=" + strconv.Itoa(int(l.window.Seconds()))
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ok, remaining, reset := l.Allow(key(r))
			secs := strconv.Itoa(int(math.Ceil(time.Until(reset).Seconds())))
			h := w.Header()
			h.Set("RateLimit-Policy", policy)
			h.Set("RateLimit-Limit", strconv.Itoa(l.limit))
			h.Set("RateLimit-Remaining", strconv.Itoa(remaining))
			h.Set("RateLimit-Reset", secs)
			if !ok {
				h.Set("Retry-After", secs)
				Error(w, http.StatusTooManyRequests, "Too many requests")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
