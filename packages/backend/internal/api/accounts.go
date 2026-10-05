package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/redis/go-redis/v9"

	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/auth"
	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/httpx"
	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/pg"
	"github.com/FranciscoHonorat/hermes-observability/packages/backend/internal/streams"
)

const minPasswordLen = 8

type user struct {
	ID        int64  `db:"id" json:"id"`
	TenantID  int32  `db:"tenant_id" json:"tenant_id"`
	Email     string `db:"email" json:"email"`
	Role      string `db:"role" json:"role"`
	CreatedAt Time   `db:"created_at" json:"created_at"`
}

type tenant struct {
	ID        int32  `db:"id" json:"id"`
	Name      string `db:"name" json:"name"`
	Slug      string `db:"slug" json:"slug"`
	CreatedAt Time   `db:"created_at" json:"created_at"`
}

const userColumns = "id, tenant_id, email, role, created_at"

func (s *Server) startSession(w http.ResponseWriter, sess auth.Session) error {
	token, err := s.signer.Sign(sess)
	if err != nil {
		return err
	}
	auth.SetSessionCookie(w, token, s.cfg.SecureCookies)
	return nil
}

var slugInvalid = regexp.MustCompile(`[^a-z0-9]+`)

func slugify(name string) string {
	slug := strings.Trim(slugInvalid.ReplaceAllString(strings.ToLower(strings.TrimSpace(name)), "-"), "-")
	if slug == "" {
		return "tenant"
	}
	return slug
}

func randomSuffix() string {
	b := make([]byte, 2)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// POST /api/v1/auth/signup creates a tenant and its first admin, then signs
// them in. Both rows are written in one transaction.
func (s *Server) signup(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		TenantName string `json:"tenantName"`
		Email      string `json:"email"`
		Password   string `json:"password"`
	}
	if err := decode(w, r, &in); err != nil {
		return err
	}
	switch {
	case in.TenantName == "":
		return badRequest("tenantName is required")
	case in.Email == "":
		return badRequest("email is required")
	case len(in.Password) < minPasswordLen:
		return badRequest("password is required and must be at least 8 characters")
	}
	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		return err
	}

	var (
		t tenant
		u user
	)
	err = pgx.BeginFunc(r.Context(), s.db, func(tx pgx.Tx) error {
		base := slugify(in.TenantName)
		found := false
		for attempt := 0; attempt < 5 && !found; attempt++ {
			slug := base
			if attempt > 0 {
				slug = base + "-" + randomSuffix()
			}
			// ON CONFLICT DO NOTHING keeps the transaction usable on a slug clash.
			var err error
			t, found, err = collectOne[tenant](r.Context(), tx, `
				INSERT INTO tenants (name, slug) VALUES ($1, $2)
				ON CONFLICT (slug) DO NOTHING
				RETURNING id, name, slug, created_at`, in.TenantName, slug)
			if err != nil {
				return err
			}
		}
		if !found {
			return &httpError{http.StatusConflict, "Could not allocate a unique tenant slug, try a different name"}
		}
		var err error
		u, _, err = collectOne[user](r.Context(), tx, `
			INSERT INTO users (tenant_id, email, password_hash, role) VALUES ($1, $2, $3, 'admin')
			RETURNING `+userColumns, t.ID, in.Email, hash)
		return err
	})
	if err != nil {
		return err
	}
	if err := s.startSession(w, auth.Session{UserID: u.ID, TenantID: t.ID, Role: auth.RoleAdmin}); err != nil {
		return err
	}
	s.log.Info("tenant signed up", "tenant", t.Slug, "user_id", u.ID)
	httpx.WriteJSON(w, http.StatusCreated, map[string]any{"user": u, "tenant": t})
	return nil
}

// POST /api/v1/auth/login
func (s *Server) login(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		TenantSlug string `json:"tenantSlug"`
		Email      string `json:"email"`
		Password   string `json:"password"`
	}
	if err := decode(w, r, &in); err != nil {
		return err
	}
	if in.TenantSlug == "" || in.Email == "" || in.Password == "" {
		return badRequest("tenantSlug, email and password are required")
	}
	var (
		id       int64
		tenantID int32
		email    string
		hash     string
		role     string
	)
	err := s.db.QueryRow(r.Context(), `
		SELECT u.id, u.tenant_id, u.email, u.password_hash, u.role
		FROM users u JOIN tenants t ON t.id = u.tenant_id
		WHERE t.slug = $1 AND u.email = $2`, in.TenantSlug, in.Email).Scan(&id, &tenantID, &email, &hash, &role)
	if err != nil && !errors.Is(err, pgx.ErrNoRows) {
		return err
	}
	// CheckPassword with an empty hash still spends a bcrypt comparison, so
	// unknown accounts and wrong passwords take the same time.
	if !auth.CheckPassword(hash, in.Password) {
		return &httpError{http.StatusUnauthorized, "Invalid credentials"}
	}
	if err := s.startSession(w, auth.Session{UserID: id, TenantID: tenantID, Role: role}); err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"id": id, "tenant_id": tenantID, "email": email, "role": role})
	return nil
}

// POST /api/v1/auth/logout
func (s *Server) logout(w http.ResponseWriter, _ *http.Request) error {
	auth.ClearSessionCookie(w)
	httpx.WriteJSON(w, http.StatusOK, map[string]string{"message": "Logged out"})
	return nil
}

type currentUser struct {
	user
	TenantName string `db:"tenant_name" json:"tenant_name"`
	TenantSlug string `db:"tenant_slug" json:"tenant_slug"`
}

// GET /api/v1/auth/me
func (s *Server) me(w http.ResponseWriter, r *http.Request) error {
	me, ok, err := collectOne[currentUser](r.Context(), s.db, `
		SELECT u.id, u.tenant_id, u.email, u.role, u.created_at, t.name AS tenant_name, t.slug AS tenant_slug
		FROM users u JOIN tenants t ON t.id = u.tenant_id
		WHERE u.id = $1`, session(r).UserID)
	if err != nil {
		return err
	}
	if !ok {
		return &httpError{http.StatusUnauthorized, "User no longer exists"}
	}
	httpx.WriteJSON(w, http.StatusOK, me)
	return nil
}

// GET /api/v1/admin/users
func (s *Server) listUsers(w http.ResponseWriter, r *http.Request) error {
	users, err := collect[user](r.Context(), s.db,
		`SELECT `+userColumns+` FROM users WHERE tenant_id = $1 ORDER BY created_at ASC`, session(r).TenantID)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, list("users", users))
	return nil
}

var errInvalidRole = badRequest("role must be one of: admin, viewer")

// POST /api/v1/admin/users
func (s *Server) createUser(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Email    string `json:"email"`
		Password string `json:"password"`
		Role     string `json:"role"`
	}
	if err := decode(w, r, &in); err != nil {
		return err
	}
	if in.Role == "" {
		in.Role = auth.RoleViewer
	}
	switch {
	case in.Email == "":
		return badRequest("email is required")
	case len(in.Password) < minPasswordLen:
		return badRequest("password is required and must be at least 8 characters")
	case !auth.ValidRole(in.Role):
		return errInvalidRole
	}
	hash, err := auth.HashPassword(in.Password)
	if err != nil {
		return err
	}
	u, _, err := collectOne[user](r.Context(), s.db, `
		INSERT INTO users (tenant_id, email, password_hash, role) VALUES ($1, $2, $3, $4)
		RETURNING `+userColumns, session(r).TenantID, in.Email, hash, in.Role)
	if pg.IsUniqueViolation(err) {
		return &httpError{http.StatusConflict, "That email is already registered for this tenant"}
	}
	if err != nil {
		return err
	}
	s.log.Info("user created", "tenant", u.TenantID, "user_id", u.ID, "role", u.Role)
	httpx.WriteJSON(w, http.StatusCreated, u)
	return nil
}

// PUT /api/v1/admin/users/{id}/role
func (s *Server) updateUserRole(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	var in struct {
		Role string `json:"role"`
	}
	if err := decode(w, r, &in); err != nil {
		return err
	}
	if !auth.ValidRole(in.Role) {
		return errInvalidRole
	}
	u, ok, err := collectOne[user](r.Context(), s.db,
		`UPDATE users SET role = $1 WHERE id = $2 AND tenant_id = $3 RETURNING `+userColumns,
		in.Role, id, session(r).TenantID)
	if err != nil {
		return err
	}
	if !ok {
		return notFound("User not found")
	}
	httpx.WriteJSON(w, http.StatusOK, u)
	return nil
}

// DELETE /api/v1/admin/users/{id}
func (s *Server) deleteUser(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	if id == session(r).UserID {
		return badRequest("Cannot delete your own account")
	}
	tag, err := s.db.Exec(r.Context(), `DELETE FROM users WHERE id = $1 AND tenant_id = $2`, id, session(r).TenantID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return notFound("User not found")
	}
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"message": "User deleted", "id": id})
	return nil
}

type apiKey struct {
	ID        int64   `db:"id" json:"id"`
	TenantID  int32   `db:"tenant_id" json:"tenant_id"`
	Label     *string `db:"label" json:"label"`
	CreatedAt Time    `db:"created_at" json:"created_at"`
	RevokedAt *Time   `db:"revoked_at" json:"revoked_at"`
}

const apiKeyColumns = "id, tenant_id, label, created_at, revoked_at"

// GET /api/v1/admin/api-keys
func (s *Server) listAPIKeys(w http.ResponseWriter, r *http.Request) error {
	keys, err := collect[apiKey](r.Context(), s.db,
		`SELECT `+apiKeyColumns+` FROM api_keys WHERE tenant_id = $1 ORDER BY created_at DESC`, session(r).TenantID)
	if err != nil {
		return err
	}
	httpx.WriteJSON(w, http.StatusOK, list("apiKeys", keys))
	return nil
}

// POST /api/v1/admin/api-keys returns the raw key exactly once; only its
// sha256 digest is stored (Postgres) and cached for the collector (Redis).
func (s *Server) createAPIKey(w http.ResponseWriter, r *http.Request) error {
	var in struct {
		Label string `json:"label"`
	}
	if err := decode(w, r, &in); err != nil {
		return err
	}
	raw, err := auth.GenerateAPIKey()
	if err != nil {
		return err
	}
	hash := auth.HashAPIKey(raw)
	tenantID := session(r).TenantID
	key, _, err := collectOne[apiKey](r.Context(), s.db, `
		INSERT INTO api_keys (tenant_id, key_hash, label) VALUES ($1, $2, NULLIF($3, ''))
		RETURNING `+apiKeyColumns, tenantID, hash, in.Label)
	if err != nil {
		return err
	}
	// If this fails the key exists but isn't usable until the next startup
	// sync (SyncAPIKeys); report it so the admin can retry.
	if err := s.rdb.HSet(r.Context(), streams.APIKeys, hash, tenantID).Err(); err != nil {
		return fmt.Errorf("cache api key %d: %w", key.ID, err)
	}
	s.log.Info("api key created", "tenant", tenantID, "key_id", key.ID)
	httpx.WriteJSON(w, http.StatusCreated, struct {
		apiKey
		Key string `json:"key"`
	}{key, raw})
	return nil
}

// DELETE /api/v1/admin/api-keys/{id}
func (s *Server) revokeAPIKey(w http.ResponseWriter, r *http.Request) error {
	id, err := pathID(r, "id")
	if err != nil {
		return err
	}
	var hash string
	err = s.db.QueryRow(r.Context(), `
		UPDATE api_keys SET revoked_at = NOW()
		WHERE id = $1 AND tenant_id = $2 AND revoked_at IS NULL
		RETURNING key_hash`, id, session(r).TenantID).Scan(&hash)
	if errors.Is(err, pgx.ErrNoRows) {
		return notFound("API key not found or already revoked")
	}
	if err != nil {
		return err
	}
	if err := s.rdb.HDel(r.Context(), streams.APIKeys, hash).Err(); err != nil {
		return fmt.Errorf("uncache api key %d: %w", id, err)
	}
	s.log.Info("api key revoked", "key_id", id)
	httpx.WriteJSON(w, http.StatusOK, map[string]any{"message": "API key revoked", "id": id})
	return nil
}

// SyncAPIKeys makes the collector's Redis cache match Postgres, the source
// of truth: active keys are (re)added and revoked ones removed. Running it
// at startup means a flushed or rebuilt Redis no longer locks out agents.
func SyncAPIKeys(ctx context.Context, db querier, rdb *redis.Client) (active, revoked int, err error) {
	rows, err := db.Query(ctx, `SELECT key_hash, tenant_id, revoked_at IS NOT NULL FROM api_keys`)
	if err != nil {
		return 0, 0, err
	}
	pipe := rdb.Pipeline()
	var (
		hash      string
		tenantID  int32
		isRevoked bool
	)
	_, err = pgx.ForEachRow(rows, []any{&hash, &tenantID, &isRevoked}, func() error {
		if isRevoked {
			revoked++
			pipe.HDel(ctx, streams.APIKeys, hash)
		} else {
			active++
			pipe.HSet(ctx, streams.APIKeys, hash, tenantID)
		}
		return nil
	})
	if err != nil {
		return 0, 0, err
	}
	if pipe.Len() > 0 {
		if _, err := pipe.Exec(ctx); err != nil {
			return 0, 0, err
		}
	}
	return active, revoked, nil
}
