package auth

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// Fixtures produced by the former Node services' libraries:
//
//	jwt.sign({userId:42,tenantId:7,role:"admin"}, "compat-secret", {expiresIn:"100y"})
//	bcrypt.hashSync("correct horse battery", 10)            // bcryptjs
//	createHash("sha256").update("raw-key-123").digest("hex")
const (
	nodeToken   = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjQyLCJ0ZW5hbnRJZCI6Nywicm9sZSI6ImFkbWluIiwiaWF0IjoxNzkxMTYwOTM0LCJleHAiOjQ5NDY5MjA5MzR9.NBZxqsRuioX3E9jelZa3oMnfL-8wlPCDorj_ZhYRD3U"
	nodeBcrypt  = "$2a$10$xh2sdodlFH/mgA9jE.6bp.Riagd1Uf5AR8k40.aKExUfJ3knpnxDe"
	nodeKeyHash = "f1bcd7a71755c0802491a5a803f2c1bd87aa0730efedf5300a2990a95b39f6d3"
)

func TestAcceptsTokensIssuedByNodeServices(t *testing.T) {
	sess, err := NewSigner("compat-secret").Verify(nodeToken)
	if err != nil {
		t.Fatal(err)
	}
	if sess != (Session{UserID: 42, TenantID: 7, Role: RoleAdmin}) {
		t.Fatalf("got %+v", sess)
	}
}

func TestPasswordAndKeyHashCompat(t *testing.T) {
	if !CheckPassword(nodeBcrypt, "correct horse battery") || CheckPassword(nodeBcrypt, "wrong") {
		t.Fatal("bcryptjs hash not interoperable")
	}
	if HashAPIKey("raw-key-123") != nodeKeyHash {
		t.Fatal("api key digest differs from Node's")
	}
	if CheckPassword("", "anything") {
		t.Fatal("empty hash must never match")
	}
}

func TestSignVerifyRoundTrip(t *testing.T) {
	s := NewSigner("secret")
	want := Session{UserID: 1, TenantID: 2, Role: RoleViewer}
	tok, err := s.Sign(want)
	if err != nil {
		t.Fatal(err)
	}
	got, err := s.Verify(tok)
	if err != nil || got != want {
		t.Fatalf("got %+v, %v", got, err)
	}
}

func TestVerifyRejects(t *testing.T) {
	s := NewSigner("secret")
	good, _ := s.Sign(Session{UserID: 1, TenantID: 1, Role: RoleAdmin})

	expired := NewSigner("secret")
	expired.now = func() time.Time { return time.Now().Add(-8 * 24 * time.Hour) }
	old, _ := expired.Sign(Session{UserID: 1, TenantID: 1, Role: RoleAdmin})

	none := jwt.NewWithClaims(jwt.SigningMethodNone, jwt.MapClaims{"userId": 1, "tenantId": 1, "role": "admin", "exp": time.Now().Add(time.Hour).Unix()})
	noneTok, _ := none.SignedString(jwt.UnsafeAllowNoneSignatureType)

	noExp := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"userId": 1, "tenantId": 1, "role": "admin"})
	noExpTok, _ := noExp.SignedString([]byte("secret"))

	badRole := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{"userId": 1, "tenantId": 1, "role": "root", "exp": time.Now().Add(time.Hour).Unix()})
	badRoleTok, _ := badRole.SignedString([]byte("secret"))

	for name, tok := range map[string]string{
		"wrong secret": func() string {
			t, _ := NewSigner("other").Sign(Session{UserID: 1, TenantID: 1, Role: RoleAdmin})
			return t
		}(),
		"expired":      old,
		"alg none":     noneTok,
		"no exp":       noExpTok,
		"unknown role": badRoleTok,
		"tampered":     good[:len(good)-2] + "xx",
	} {
		if _, err := s.Verify(tok); err == nil {
			t.Errorf("%s: token accepted", name)
		}
	}
}

func TestMiddleware(t *testing.T) {
	s := NewSigner("secret")
	admin, _ := s.Sign(Session{UserID: 1, TenantID: 1, Role: RoleAdmin})
	viewer, _ := s.Sign(Session{UserID: 2, TenantID: 1, Role: RoleViewer})
	h := s.Authenticate(RequireRole(RoleAdmin)(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		sess, _ := FromContext(r.Context())
		w.Header().Set("X-User", sess.Role)
	})))

	tests := []struct {
		name   string
		setup  func(*http.Request)
		status int
	}{
		{"no credentials", func(*http.Request) {}, http.StatusUnauthorized},
		{"garbage token", func(r *http.Request) { r.Header.Set("Authorization", "Bearer nope") }, http.StatusUnauthorized},
		{"viewer bearer", func(r *http.Request) { r.Header.Set("Authorization", "Bearer "+viewer) }, http.StatusForbidden},
		{"admin cookie", func(r *http.Request) { r.AddCookie(&http.Cookie{Name: CookieName, Value: admin}) }, http.StatusOK},
	}
	for _, tt := range tests {
		r := httptest.NewRequest("GET", "/", nil)
		tt.setup(r)
		w := httptest.NewRecorder()
		h.ServeHTTP(w, r)
		if w.Code != tt.status {
			t.Errorf("%s: status %d, want %d", tt.name, w.Code, tt.status)
		}
	}
}
