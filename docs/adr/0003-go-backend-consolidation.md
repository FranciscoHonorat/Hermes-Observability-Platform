# ADR 0003: Go backend in one module; api, users and admin merged

- **Status:** Implemented
- **Date:** 2026-10-04
- **Scope:** `packages/backend` (new; replaces `packages/collector`, `packages/processor`, `packages/api`, `packages/users`, `packages/admin`), `packages/shared`, `docker/Dockerfile.backend`, `docker-compose.yml`, `docker/nginx.conf`, `render.yaml`
- **Supersedes:** ADR 0002 §1 (users and admin as separate services). The rest of ADR 0002 still holds.

## Context

The backend was five Node/TypeScript services: collector, processor, api, users, admin. Each one repeated the same bootstrap: env parsing, a Postgres pool, a Redis client, helmet, CORS, rate limiting, error handling and graceful shutdown. users, admin and api also shared the session middleware and the same database.

Load testing (`results/RESULTS.md`) found the processor drained about 282 metrics/s, because it handled one message at a time. The processor was rewritten in Go with batched writes first, and drained the same 60,000-metric backlog about 20x faster. This ADR records moving the rest of the backend to Go and changing its layout.

## Decision

### 1. One Go module, three binaries

`packages/backend` is a single Go module with `cmd/collector`, `cmd/processor` and `cmd/api`. Shared code lives in `internal/`:

| Package | Responsibility |
|---|---|
| `model` | Ingestion wire types and validation. The collector validates requests with it and the processor validates stream entries with it, so the two can't disagree. |
| `auth` | JWT sessions, bcrypt, API key generation and hashing, session middleware |
| `httpx` | JSON helpers, security headers, CORS, rate limiting, access log, panic recovery, graceful shutdown |
| `env`, `pg`, `streams`, `logx`, `jsonx` | Config, Postgres helpers, Redis key names, logging, JSON error messages |

One Dockerfile (`docker/Dockerfile.backend`) builds all three binaries into one image. Each service picks its binary with `command` in compose or `dockerCommand` on Render.

`packages/agent-go` stays a separate module: it's a client library, and the code that imports it shouldn't pull in pgx and the server dependencies.

### 2. api, users and admin become one `api` service

The users and admin services each had about 150 lines of handlers behind the same session middleware as api, and used the same database. Deploying them separately added two processes, two ports, two Dockerfiles and two more JWT_SECRET copies to keep in sync. In return, they got a deploy lifecycle separate from the data API, which this project has never used.

The routes are unchanged (`/api/v1/auth/*`, `/api/v1/admin/*`, `/api/v1/*`), so the UI didn't change. nginx now sends all of `/api` to one upstream. Signup and login get their own per-IP rate limit (`AUTH_RATE_LIMIT_MAX`), so merging doesn't weaken the brute-force protection the users service had.

### 3. Compatibility with the Node services

- **Sessions:** HS256 JWTs with `{userId, tenantId, role}`, as before. Cookies issued by the Node services stay valid. A test fixture signed by `jsonwebtoken` enforces this.
- **Passwords:** bcryptjs hashes (`$2a$10$`) verify with `x/crypto/bcrypt`. There's a fixture test for this too.
- **API keys:** the sha256 digests are unchanged, so existing keys keep working.
- **Redis:** stream names, consumer groups and the `hermes:apikeys` hash are unchanged, so a backlog left by the Node processor is drained by the Go one.
- **JSON responses:** fields, envelopes and the `Date.toJSON()` timestamp format are unchanged. One difference: counts that node-pg returned as strings (bigint) are now JSON numbers.

### 4. Fixes made along the way

- **The api resyncs the collector's API key cache from Postgres at startup.** Before, a flushed Redis locked out every agent until each key was recreated.
- **Deleting an alert rule that had fired returned 500.** `alert_history` has an FK with no `ON DELETE`. The rule and its history are now deleted in one transaction.
- **Signup creates the tenant and its admin in one transaction.** Before, a failed user insert left an orphan tenant.
- **Login takes the same time for unknown accounts and wrong passwords.** An unknown account now still runs a bcrypt comparison, so response time doesn't reveal which accounts exist.
- **`CORS_ORIGIN=*` never sends `Access-Control-Allow-Credentials`.** Echoing arbitrary origins with credentials would let any site read the API with the visitor's session.
- **Ingestion timestamps must fit in a JavaScript Date (≤ 8.64e15 ms).** Before, a nanosecond timestamp sent by mistake was stored as a date in the year 59879.
- **The collector writes a batch to Redis in one pipeline.** Before, it awaited one `XADD` per item.
- **Trace listing looks up root spans only for the page being returned.** Before, it ran `DISTINCT ON` over every root span the tenant had.
- **Bad `limit`, `id` and `from`/`to` values return 400 instead of a Postgres 500, and `limit` is capped.**

### 5. What stays in other languages

- `packages/agent`: the SDK that Node apps embed, so it stays TypeScript.
- `packages/ui`: React.
- `packages/intelligence`: Python, for scikit-learn (ADR 0001).

`packages/shared` now only provides the agent's types and logger. Its Express and JWT auth helpers were removed along with their last users.

## Consequences

- Tests run the api against real Postgres and Redis (`TEST_DATABASE_URL`, `TEST_REDIS_ADDR`) instead of a mocked `pool.query`. That's how the alert-deletion FK bug above was found.
- Rate limiting is still in memory, per process. Running N api replicas allows N times the limit. Moving the counters to Redis is the fix if that matters.
- Sessions still can't be revoked before they expire. Deleting a user or changing their role takes effect when their 7-day JWT expires. This was already true before.
