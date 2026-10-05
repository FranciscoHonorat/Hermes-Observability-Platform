# Docker Guide

## Services

`docker-compose.yml` defines seven services on a single bridge network (`hermes-network`). `collector`, `processor` and `api` run the same Go image (`docker/Dockerfile.backend`, tagged `hermes-backend`); `command` picks the binary.

| Service | Image / build | Port | Role |
|---|---|---|---|
| `postgres` | `timescale/timescaledb:latest-pg15` | 5432 | Metrics store (hypertable + continuous aggregates) |
| `redis` | `redis:7-alpine` | 6379 | Stream buffer between Collector and Processor |
| `collector` | `hermes-backend` `/collector` | 4000 | Ingests metrics, traces and logs over HTTP and pushes them to Redis Streams |
| `processor` | `hermes-backend` `/processor` | 4010 | Consumes the streams, persists to Postgres, runs the alert engine. `GET /healthz` shows backlog |
| `api` | `hermes-backend` `/api` | 3000 | REST API for the UI and external tools, plus signup/login and tenant admin (users, API keys) |
| `intelligence` | `packages/intelligence/Dockerfile` | — | Python anomaly detection and recommendations |
| `ui` | `docker/Dockerfile.ui` (nginx) | 3001 → 80 | React dashboard, proxies `/api` to the `api` service |

`postgres` and `redis` have healthchecks; `collector`, `processor`, and `api` wait on those before starting (`depends_on: condition: service_healthy`).

## Commands

```bash
npm run docker:up        # start everything, detached
npm run docker:down      # stop and remove containers
npm run docker:logs      # tail all logs
npm run docker:build     # rebuild images without starting
npm run docker:rebuild   # rebuild + restart
npm run docker:status    # docker-compose ps
npm run docker:clean     # down --remove-orphans
```

## Volumes

Two named volumes persist data across restarts: `postgres_data` (`/var/lib/postgresql/data`) and `redis_data` (`/data`). `docker-compose down -v` removes them — that deletes all stored metrics.

## Authentication

Authentication follows [ADR 0002](docs/adr/0002-multi-tenancy-and-rbac.md):

- **Dashboard and API.** Sign up at http://localhost:3001. The first account becomes `admin` of a new tenant. The api issues a JWT in an httpOnly `hermes_session` cookie. Scripts can send the same JWT as `Authorization: Bearer <jwt>`.
- **Ingestion.** An admin creates per-tenant API keys on the UI's Admin page (`POST /api/v1/admin/api-keys`). Agents send the key as `x-api-key` (`HERMES_API_KEY` for `@hermes/agent` and `agent-go`), and the collector stamps that tenant on everything it receives. In development (`HERMES_ENV` other than `production`), requests without a key are attributed to the seeded `default` tenant (id 1), so a fresh clone works with no setup.
- **Production.** With `HERMES_ENV=production`, the collector rejects requests without a key, the session cookie is `Secure`, and the api refuses to start without `JWT_SECRET` and `CORS_ORIGIN`.

## Troubleshooting

**Collector isn't receiving metrics**
```bash
curl http://localhost:4000/health
docker logs hermes-collector
```
A wrong or revoked `HERMES_API_KEY` returns `401`, not a connection error. Keys live in Postgres and are cached in the Redis hash `hermes:apikeys`. If Redis lost its data, restart the api, which rebuilds the cache on startup.

**Processor isn't processing metrics**
```bash
curl http://localhost:4010/healthz   # per-stream lag (unread) and pending (read, not acked)
docker logs hermes-processor
```
Invalid messages are acknowledged and logged as `message dead-lettered`, so they never accumulate. A non-zero, non-shrinking `pending` count means the processor is failing to persist and retrying. Check `docker logs hermes-processor` for a Postgres connection error first.

**Dashboard shows no data**
```bash
curl http://localhost:3000/api/v1/metrics?limit=10
docker logs hermes-api
```
Check the browser's Network tab — the UI calls `/api/...` relative to its own origin, proxied by nginx to the `api` service.

**Containers won't start**
```bash
npm run docker:rebuild
docker-compose down -v && docker system prune -a   # also wipes stored metrics
docker-compose logs
```

**A service exits immediately with "Missing required environment variable"**
That's the fail-fast config check: `POSTGRES_PASSWORD` (api, processor) always, and `JWT_SECRET`/`CORS_ORIGIN` (api) when `HERMES_ENV=production`. The error lists every missing or malformed variable at once. Set them. There is deliberately no fallback to a default credential in production.

**The UI returns 502 for every `/api` call after recreating only the `api` container**
nginx resolves `api` once at startup and keeps the old container's IP. Restart the UI too: `docker compose restart ui`.

**The Go services have no shell**
They run on a distroless image, so `docker compose exec api sh` won't work. Use `docker logs` and the `/health` (api, collector) and `/healthz` (processor) endpoints instead.
