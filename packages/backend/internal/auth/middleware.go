package auth

import (
	"net/http"

	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/httpx"
)

// Authenticate rejects requests without a valid session with 401.
func (s *Signer) Authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token := tokenFrom(r)
		if token == "" {
			httpx.Error(w, http.StatusUnauthorized, "Not authenticated")
			return
		}
		sess, err := s.Verify(token)
		if err != nil {
			httpx.Error(w, http.StatusUnauthorized, "Invalid or expired session")
			return
		}
		next.ServeHTTP(w, r.WithContext(WithSession(r.Context(), sess)))
	})
}

// RequireRole must run after Authenticate.
func RequireRole(role string) httpx.Middleware {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			sess, ok := FromContext(r.Context())
			if !ok {
				httpx.Error(w, http.StatusUnauthorized, "Not authenticated")
				return
			}
			if sess.Role != role {
				httpx.Error(w, http.StatusForbidden, "Requires "+role+" role")
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
