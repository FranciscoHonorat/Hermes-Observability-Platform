# ADR 0002: Multi-tenancy and RBAC

- **Status:** Implemented
- **Date:** 2026-09-08
- **Scope:** `packages/users` (new), `packages/admin` (new), `packages/shared`, `packages/api`, `packages/collector`, `packages/processor`, `packages/intelligence`, `packages/ui`, `docker/init-db.sql`, `docker-compose.yml`, `docker/nginx.conf`

## Context

Before this change, the system had **no identity concept at all**. Every mutating API route was gated by a single shared bearer token (`API_ADMIN_TOKEN`); nginx injected that same token server-side into every request the browser made, so every visitor to the UI was equally "admin." The Collector's ingestion routes were gated by `COLLECTOR_API_KEYS`, a flat list with no per-key identity — any configured key authenticated identically, and `app_name` on every ingested metric/span/log was 100% client-chosen, never verified server-side. Several read routes were already `SELECT * FROM x WHERE id = $1` with no ownership check at all — a real cross-application data leak independent of anything to do with tenancy.

This phase adds real accounts, tenant isolation, and two roles (`admin`, `viewer`). Deliberately not a full permissions-matrix RBAC system — matching this project's consistent preference for the simplest thing that's actually correct (see ADR 0001's rule-based-not-ML choice for recommendations). SSO, SLA tracking, and a plugin system (the rest of v4.0 "Enterprise") are explicitly deferred; they would sit on top of this foundation.

## Decision

### 1. Two new services, not new routes on `packages/api`

`packages/users` (self-service signup/login/logout/me) and `packages/admin` (tenant-admin-only user and API-key management) are separate deployable services — own process, port, and Dockerfile — rather than new route modules inside `packages/api`. This mirrors the existing `collector`/`processor`/`api` split-by-concern already established in this repo, and was an explicit choice: it keeps the read/write-heavy data API's deploy lifecycle independent of the auth surface, and keeps `packages/api` from needing to own password hashing or API-key minting.

### 2. JWT in an httpOnly cookie, not localStorage

`packages/users` signs a JWT (`jsonwebtoken`) on login/signup and sets it as an httpOnly, `SameSite=Lax` cookie. Because nginx already puts every service behind one browser origin (`/api/v1/auth` → `users`, `/api/v1/admin` → `admin`, `/api` → `api`), the cookie is sent automatically on requests to all three — no CORS credential plumbing needed, just `withCredentials: true` on the UI's axios clients for explicitness. An httpOnly cookie can't be read by JavaScript at all, which is what was asked for over the simpler (but XSS-exposed) localStorage-plus-Authorization-header approach.

`packages/shared/src/utilities/authMiddleware.ts`'s `authenticate()` also accepts a plain `Authorization: Bearer <token>` header, purely so tests/curl/any future non-browser client aren't forced through a cookie jar — the cookie is the primary path for the actual UI.

### 3. Two roles (`admin`, `viewer`), not a permissions matrix

`users.role` is a two-value column, not a separate roles/permissions/role_permissions system. `admin` can mutate (create/update/delete alerts, acknowledge/dismiss recommendations, manage users and API keys); `viewer` can only read. This is RBAC in the classical sense without the extra schema and query complexity a granular permissions system would add — revisit if a real need for finer-grained roles shows up in practice.

### 4. Passwords: bcrypt. API keys: SHA-256, not bcrypt

`hashPassword`/`comparePassword` use `bcryptjs` — deliberately the pure-JS implementation, not native `bcrypt`. This session hit real native-compilation pain earlier building `packages/intelligence` (`psycopg2`/`numpy` had no prebuilt wheel for a too-new Python and needed a full source build); there was no reason to risk the same class of problem in a Node/Alpine Docker build for a password-hashing library with no meaningful performance difference at this scale.

API keys (`api_keys.key_hash`) are hashed with SHA-256, not bcrypt — deliberately a different algorithm than passwords. Bcrypt's slowness exists to resist brute-forcing a *guessable* password; an API key is a 256-bit `crypto.randomBytes` value with no guessable structure, so a fast hash is both correct and necessary (bcrypt would be needlessly slow on the Collector's hot ingestion path, and gains nothing against a token that's already unguessable). Same tradeoff GitHub/Stripe make for their own API keys.

### 5. API keys cached in Redis, not looked up in Postgres from the Collector

`packages/admin` is the source of truth for `api_keys` in Postgres, but also writes `key_hash -> tenant_id` into a Redis hash (`hermes:apikeys`, `REDIS_API_KEYS_HASH` in `packages/shared`) on creation, and removes the entry on revocation. `packages/collector`'s `apiKeyAuth` middleware — the hottest path in the whole system — does a single `HGET` against that hash instead of a Postgres round trip per ingest request, and doesn't gain a new dependency on Postgres at all (it already depends on Redis for the streams themselves).

### 6. Dev-mode fallback: attribute unauthenticated requests to a fixed tenant, not reject them

`docker/init-db.sql` seeds a fixed tenant row, `id=1, slug='default'`, unconditionally (`ON CONFLICT (id) DO NOTHING`). When `COLLECTOR_API_KEYS`-style dev bootstrapping used to mean "no key configured -> skip auth entirely," that can't produce a `tenant_id` anymore since every row now requires one. Instead, an unauthenticated request in a non-production environment is attributed to tenant 1. This preserves the project's stated "fast to value — see metrics in under 5 minutes" goal (`docs/MVP.md`): `docker compose up` still works with zero configuration, the demo app and load-testing scripts still work unmodified, and a real multi-tenant setup only requires actually generating a key via the Admin UI.

### 7. Every existing route re-scoped by `tenant_id`, closing pre-existing IDOR gaps along the way

`packages/api/src/server.ts` mounts `authenticate()` globally now (previously only alert-mutating routes required a token at all) — every read across all 8 route files gained a `tenant_id = $N` filter, and every `:id`-based lookup that previously trusted a bare numeric ID (`anomalies.ts`, `recommendations.ts`, all of `alerts.ts`, `traces.ts`'s `:traceId` route) now also requires it to belong to the caller's tenant. This was a real, pre-existing bug independent of multi-tenancy — a numeric-ID guess could already return another application's data — that tenant scoping fixes as a side effect.

## Consequences

- Two more services to build, deploy, and keep dependency-current, on top of the two `packages/intelligence` already added (ADR 0001) — a meaningfully larger operational surface than this project started with.
- The dev-default `JWT_SECRET` in `docker-compose.yml` is a real secret that must be replaced in any non-local deployment (same caveat as the existing `POSTGRES_PASSWORD` dev value) — everything issuing or verifying a session (`users`, `admin`, `api`) must share the exact same value or sessions silently fail to verify across services.
- Multi-tenancy's schema footprint touches nearly every existing table; anything added to this system in the future needs to remember to carry `tenant_id` from day one, the same way `app_name` had to be remembered for the original single-tenant design.
- SSO and finer-grained RBAC are natural extensions of the `users`/`admin` split established here (an SSO provider would plug into `packages/users`' login flow; a permissions matrix would extend `users.role` without touching how tenancy itself works) — both explicitly deferred.
