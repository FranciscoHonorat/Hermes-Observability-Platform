// Package auth implements user sessions (JWT in an httpOnly cookie or a
// Bearer header), password hashing and collector API keys.
//
// Tokens and hashes are compatible with the former Node services
// (jsonwebtoken HS256 with {userId, tenantId, role}, bcryptjs, sha256 API
// key digests), so existing sessions, passwords and keys keep working.
package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
)

const (
	CookieName = "hermes_session"
	SessionTTL = 7 * 24 * time.Hour

	RoleAdmin  = "admin"
	RoleViewer = "viewer"

	// DevSecret is only accepted outside production (see env.Production).
	DevSecret = "dev-only-insecure-secret-do-not-use-in-production"

	bcryptCost = 10
)

func ValidRole(role string) bool { return role == RoleAdmin || role == RoleViewer }

// Session identifies the caller of an authenticated request.
type Session struct {
	UserID   int64  `json:"userId"`
	TenantID int32  `json:"tenantId"`
	Role     string `json:"role"`
}

type claims struct {
	Session
	jwt.RegisteredClaims
}

type Signer struct {
	secret []byte
	now    func() time.Time
}

func NewSigner(secret string) *Signer { return &Signer{secret: []byte(secret), now: time.Now} }

func (s *Signer) Sign(sess Session) (string, error) {
	now := s.now()
	c := claims{Session: sess, RegisteredClaims: jwt.RegisteredClaims{
		IssuedAt:  jwt.NewNumericDate(now),
		ExpiresAt: jwt.NewNumericDate(now.Add(SessionTTL)),
	}}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, c).SignedString(s.secret)
}

func (s *Signer) Verify(token string) (Session, error) {
	var c claims
	_, err := jwt.ParseWithClaims(token, &c, func(*jwt.Token) (any, error) { return s.secret, nil },
		jwt.WithValidMethods([]string{jwt.SigningMethodHS256.Alg()}),
		jwt.WithExpirationRequired(),
		jwt.WithTimeFunc(s.now))
	if err != nil {
		return Session{}, err
	}
	if c.UserID == 0 || c.TenantID == 0 || !ValidRole(c.Role) {
		return Session{}, errors.New("token is missing session claims")
	}
	return c.Session, nil
}

func HashPassword(plain string) (string, error) {
	h, err := bcrypt.GenerateFromPassword([]byte(plain), bcryptCost)
	return string(h), err
}

// dummyHash is compared against when a login names an unknown user, so the
// response takes as long as for a wrong password and doesn't reveal which
// accounts exist.
var dummyHash, _ = bcrypt.GenerateFromPassword([]byte("hermes-dummy-password"), bcryptCost)

func CheckPassword(hash, plain string) bool {
	if hash == "" {
		_ = bcrypt.CompareHashAndPassword(dummyHash, []byte(plain))
		return false
	}
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(plain)) == nil
}

// GenerateAPIKey returns a new random key. Only its HashAPIKey digest is
// stored; the raw key is shown to the user once.
func GenerateAPIKey() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", fmt.Errorf("generate api key: %w", err)
	}
	return hex.EncodeToString(b), nil
}

func HashAPIKey(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func SetSessionCookie(w http.ResponseWriter, token string, secure bool) {
	http.SetCookie(w, &http.Cookie{
		Name:     CookieName,
		Value:    token,
		Path:     "/",
		MaxAge:   int(SessionTTL.Seconds()),
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteLaxMode,
	})
}

func ClearSessionCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{Name: CookieName, Value: "", Path: "/", MaxAge: -1, Expires: time.Unix(0, 0)})
}

type ctxKey struct{}

func WithSession(ctx context.Context, s Session) context.Context {
	return context.WithValue(ctx, ctxKey{}, s)
}

// FromContext returns the session set by Authenticate. Handlers mounted
// behind Authenticate can rely on ok being true.
func FromContext(ctx context.Context) (Session, bool) {
	s, ok := ctx.Value(ctxKey{}).(Session)
	return s, ok
}

func tokenFrom(r *http.Request) string {
	if c, err := r.Cookie(CookieName); err == nil && c.Value != "" {
		return c.Value
	}
	if h := r.Header.Get("Authorization"); len(h) > 7 && h[:7] == "Bearer " {
		return h[7:]
	}
	return ""
}
