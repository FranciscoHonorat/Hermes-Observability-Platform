# Build Status

Last verified: 2026-10-04, branch `render-test.o1`.

## Schema fix: metric timestamp collisions (2026-09-07)

Load testing (`docs/LOAD_TESTING.md`, results in `results/RESULTS.md`) found that `metrics`'s primary key — `(time, app_name, metric_name)`, with `time` at millisecond resolution — let two distinct events for the same app+metric silently overwrite each other via `ON CONFLICT DO UPDATE` whenever they landed in the same millisecond. Reproduced a 72% silent data loss rate under realistic concurrency. Fixed by keying uniqueness on the Redis Stream message ID (`stream_id`, added to the primary key) instead of client timestamp — verified 0% loss on the same reproduction after the fix. See `docker/init-db.sql` and `packages/backend/internal/processor/store/postgres.go`. Existing deployments need the same migration this repo's local instance got: drop and recreate `metrics`/`metrics_1min` (or write a proper `ALTER TABLE` migration if the data must be preserved — this repo doesn't have a migration tool set up yet).

## Build

```
npm run build   →  tsc --build (packages/shared, agent)
go -C packages/backend build ./...   →  collector, processor, api
```

Passes clean. `packages/ui` builds separately via Vite (`npm run build --workspace=packages/ui`) and is excluded from the root `tsc --build` graph.

## Tests

```
npm test        →  go test ./... in packages/backend
npm run lint    →  eslint on packages/agent and packages/shared
```

`packages/backend` (Go) is the only package with automated tests:

| Package | Covers |
|---|---|
| `internal/api` | Every route against real Postgres + Redis: auth, roles, tenant isolation, validation, response shapes, API key cache sync |
| `internal/collector` | Ingestion: per-item validation, tenant stamping, API key auth, batch limits |
| `internal/auth` | JWT/bcrypt/API key compatibility with tokens and hashes issued by the former Node services |
| `internal/httpx` | Rate limiting, client IP, CORS |
| `internal/model` | Ingestion validation |
| `internal/processor/...` | Row mapping, alert engine, consumer-group behavior (retry, dead-lettering, `XAUTOCLAIM`) |

`internal/api` and the consumer tests need `TEST_DATABASE_URL` / `TEST_REDIS_ADDR` (see `packages/backend/README.md`) and are skipped without them.

The other suites use in-memory fakes; none sends email. `packages/agent` and `packages/ui` have no automated tests yet.

## Known gaps

- No CI workflow runs `npm run build` / `npm test` on push — both are local-only today.
- No `npm audit` / dependency-CVE gate.
- No automated test runs the full Collector → Redis → Processor → Postgres pipeline end to end (it has been verified manually with `docker compose`).
- `packages/ui` and `packages/agent` are untested.
