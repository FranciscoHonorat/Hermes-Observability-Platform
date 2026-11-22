# backend

The Go services behind Hermes: one module, three binaries, one Docker image
(`docker/Dockerfile.backend`). See [ADR 0003](../../docs/adr/0003-go-backend-consolidation.md)
for why it's laid out this way.

| Binary | Port | Role |
|---|---|---|
| `cmd/collector` | 4000 (`COLLECTOR_PORT`) | Receives telemetry batches from agents, validates each item, stamps the tenant and queues it on Redis Streams |
| `cmd/processor` | 4010 (`PROCESSOR_HTTP_ADDR`) | Drains the streams into TimescaleDB in batches and runs the alert engine |
| `cmd/api` | 3000 (`API_PORT`) | Dashboard REST API, signup/login sessions, tenant admin (users, collector API keys) |

```
cmd/{collector,processor,api}   wiring, config, graceful shutdown
internal/
  model/        ingestion wire types + validation (collector and processor share it)
  auth/         JWT sessions, bcrypt, API keys, session middleware
  httpx/        JSON helpers, CORS, security headers, rate limiting, access log, recovery
  env/ pg/ streams/ logx/ jsonx/   config, Postgres helpers, Redis key names, logging, JSON errors
  collector/    ingest handlers + Redis store
  api/          REST handlers, one file per domain
  processor/
    stream/     generic consumer-group loop: decode, persist, ack, retry, claim
    pipeline/   maps decoded items to rows
    store/      batched inserts + alert queries
    alert/      alert engine + SMTP notifier
    config/
```

## Collector

- `POST /api/v1/{metrics,traces,logs}` accepts `{"metrics": [...]}`, `{"spans": [...]}` or `{"logs": [...]}`.
- Each item is validated on its own. Rejected items are listed as `errors` (up to 10, then `moreErrors`) and don't fail the rest of the batch.
- Accepted items are written to Redis in one pipeline, with `tenantId` set from the API key. A `tenantId` sent by the client is overwritten.
- Auth: `x-api-key` is looked up in the Redis hash `hermes:apikeys`. Without a key, production returns `401` and development uses tenant 1.

## Processor

Each batch of up to `PROCESSOR_BATCH_SIZE` messages is decoded once, then written with one `INSERT ... SELECT FROM unnest(...)` and one `applications` upsert. The batch is acknowledged with one `XACK`.

| Backlog of 60,000 metrics | Drain time |
|---|---|
| Former Node processor (`results/RESULTS.md`, full stack) | ~228 s |
| Go processor (Postgres + Redis only, same laptop) | ~9.8 s |

The two runs used different setups, so read this as an order of magnitude.

- **At least once, idempotent.** Rows are keyed on the stream message ID, or on the span identity for spans, so redelivery is harmless.
- **Failed batches are retried.** Abandoned entries are taken over with `XAUTOCLAIM` after `PROCESSOR_CLAIM_MIN_IDLE`.
- **Poison messages don't block the stream.** Invalid payloads are dead-lettered (logged and acked). A batch Postgres rejects for data reasons (SQLSTATE 22/23) is bisected until the bad message is isolated.
- **Backlog is visible.** `GET /healthz` reports `lag` and `pending` for each stream.
- **Alert engine.** Every `ALERT_CHECK_INTERVAL`, each enabled rule's latest value is compared against its threshold. When a rule starts firing, recipients are emailed and a row goes into `alert_history`. Firing state lives in memory, so run one processor replica, or move that state to Postgres before scaling.

## API

Routes, payloads and response shapes are documented in [API.md](../../API.md). Every
`/api/v1/*` route except signup, login and logout needs a session. `admin`-only routes are
registered with `RequireRole` in `internal/api/server.go`, so the permission model fits on one screen.

At startup the api rebuilds the collector's API key cache from Postgres: active keys are added and revoked keys removed.

## Configuration

Shared by all three: `POSTGRES_HOST/PORT/DB/USER/PASSWORD`, `POSTGRES_SSLMODE`, `POSTGRES_POOL_SIZE`, `REDIS_HOST/PORT/PASSWORD`, `LOG_LEVEL`, and `HERMES_ENV` (`production` enables the fail-closed checks; `NODE_ENV` is still read as a fallback).

| Variable | Service | Default |
|---|---|---|
| `JWT_SECRET` | api | dev secret; **required** in production |
| `CORS_ORIGIN` | api | `*` in dev; **required** in production. With `*`, credentials are never allowed |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW_MS` | api, collector | 300 (api), 120 (collector) per 60000 ms |
| `AUTH_RATE_LIMIT_MAX` | api | 60 signup/login attempts per window |
| `TRUSTED_PROXY_HOPS` | api, collector | `1`. Use `0` when exposed directly |
| `MAX_BATCH_SIZE` | collector | `1000` |
| `PROCESSOR_CONSUMER_NAME` | processor | hostname. Unique per replica and stable across restarts |
| `PROCESSOR_BATCH_SIZE` / `_BLOCK_TIMEOUT` / `_CLAIM_MIN_IDLE` / `_RETRY_BACKOFF` | processor | `500` / `2s` / `1m` / `5s` |
| `ALERT_CHECK_INTERVAL` | processor | `30s` |
| `SMTP_HOST` / `_PORT` / `_USER` / `_PASSWORD` / `_FROM` | processor | Gmail on 587. Without user and password, emails are logged instead of sent |

## Running and testing

```bash
go run ./cmd/api          # needs Go 1.26+, Postgres with docker/init-db.sql, Redis
go test ./...             # unit tests
```

Integration tests run the api against a real database, and the stream consumer against a
real Redis. They are skipped unless both are configured:

```bash
docker run -d --rm -p 55432:5432 -e POSTGRES_USER=hermes -e POSTGRES_PASSWORD=test \
  -e POSTGRES_DB=hermes_observability \
  -v "$PWD/../../docker/init-db.sql:/docker-entrypoint-initdb.d/init.sql:ro" \
  timescale/timescaledb:latest-pg15
docker run -d --rm -p 56379:6379 redis:7-alpine

TEST_DATABASE_URL='postgres://hermes:test@localhost:55432/hermes_observability?sslmode=disable' \
TEST_REDIS_ADDR=localhost:56379 go test -race ./...
```
