# Build Status

Last verified: 2026-09-07, branch `render-test.o1`.

## Schema fix: metric timestamp collisions (2026-09-07)

Load testing (`docs/LOAD_TESTING.md`, results in `results/RESULTS.md`) found that `metrics`'s primary key — `(time, app_name, metric_name)`, with `time` at millisecond resolution — let two distinct events for the same app+metric silently overwrite each other via `ON CONFLICT DO UPDATE` whenever they landed in the same millisecond. Reproduced a 72% silent data loss rate under realistic concurrency. Fixed by keying uniqueness on the Redis Stream message ID (`stream_id`, added to the primary key) instead of client timestamp — verified 0% loss on the same reproduction after the fix. See `docker/init-db.sql` and `packages/processor/src/metricsProcessor.ts`. Existing deployments need the same migration this repo's local instance got: drop and recreate `metrics`/`metrics_1min` (or write a proper `ALTER TABLE` migration if the data must be preserved — this repo doesn't have a migration tool set up yet).

## Build

```
npm run build   →  tsc --build (packages/shared, agent, collector, processor, api)
```

Passes clean. `packages/ui` builds separately via Vite (`npm run build --workspace=packages/ui`) and is excluded from the root `tsc --build` graph.

## Tests

```
npm test        →  vitest run, per workspace
```

| Package | Suite | Covers |
|---|---|---|
| `@hermes/shared` | 18 tests | `validateMetric`, `validateAlertRule`/`validateAlertRuleUpdate`, `sanitizeMetricName` |
| `@hermes/processor` | 4 tests | `evaluateCondition` (alert threshold logic) |
| `@hermes/api` | 7 tests | `/api/v1/alerts` routes — auth, validation, CRUD (Postgres pool mocked) |
| `@hermes/collector` | 4 tests | `apiKeyAuth` middleware |

No suite touches a live database, Redis, or SMTP server; `pool.query` and Redis calls are mocked where exercised. `packages/agent` and `packages/ui` have no automated tests yet.

## Known gaps

- No CI workflow runs `npm run build` / `npm test` on push — both are local-only today.
- No `npm audit` / dependency-CVE gate.
- No integration test that runs the full Collector → Redis → Processor → Postgres pipeline end to end.
- `packages/ui` is untested (no component or route tests).

See the audit artifact linked from the project history for the full findings list this build addresses (auth, rate limiting, CORS, dead code, build-artifact hygiene, poison-pill handling).
