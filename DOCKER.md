# Docker Guide

## Services

`docker-compose.yml` defines six services on a single bridge network (`hermes-network`):

| Service | Image / build | Port | Role |
|---|---|---|---|
| `postgres` | `timescale/timescaledb:latest-pg15` | 5432 | Metrics store (hypertable + continuous aggregates) |
| `redis` | `redis:7-alpine` | 6379 | Stream buffer between Collector and Processor |
| `collector` | `docker/Dockerfile.collector` | 4000 | Ingests metrics over HTTP, pushes to the Redis Stream |
| `processor` | `docker/Dockerfile.processor` | — | Consumes the stream, persists to Postgres, runs the alert engine |
| `api` | `docker/Dockerfile.api` | 3000 | REST API the UI and external tools read from |
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

Compose ships with the ingestion and admin API keys **empty**, so a freshly cloned repo runs unauthenticated on your local network — matching the project's original MVP posture. To exercise the authenticated path locally:

```yaml
# docker-compose.yml
collector:
  environment:
    COLLECTOR_API_KEYS: "dev-key-1"
api:
  environment:
    API_ADMIN_TOKEN: "dev-admin-token"
ui:
  environment:
    API_ADMIN_TOKEN: "dev-admin-token"   # forwarded server-side by nginx, never shipped to the browser
```

Once `COLLECTOR_API_KEYS` is set, every `@hermes/agent` instance must send a matching key (`HERMES_API_KEY` env var, or `apiKey` in `createAgent()`'s config) or the Collector returns `401`. Once `API_ADMIN_TOKEN` is set, `POST`/`PUT`/`DELETE` on `/api/v1/alerts` require `Authorization: Bearer <token>` — the dashboard gets this from nginx (see `docker/nginx.conf`), not from client-side JavaScript, so the token never reaches the browser bundle.

Both API_ADMIN_TOKEN and COLLECTOR_API_KEYS are **required** (the services refuse to start without them) once `NODE_ENV=production` — see `render.yml`, where Render generates them automatically.

## Troubleshooting

**Collector isn't receiving metrics**
```bash
curl http://localhost:4000/health
docker logs hermes-collector
```
If `COLLECTOR_API_KEYS` is set, confirm the sending app's `HERMES_API_KEY` matches one of them — mismatches return `401`, not a connection error.

**Processor isn't processing metrics**
```bash
docker exec -it hermes-redis redis-cli
> XINFO STREAM hermes:metrics
> XLEN hermes:metrics        # should stay low if the processor is keeping up
> XPENDING hermes:metrics processor-group   # entries here are stuck (see below)
docker logs hermes-processor
```
A non-zero, non-shrinking `XPENDING` count that isn't the malformed-metric dead-letter path (those are acked immediately and logged as `Métrica descartada`) means the processor is failing to persist — check `docker logs hermes-processor` for a Postgres connection error first.

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
That's the fail-fast check in `config.ts` for `POSTGRES_PASSWORD` (api, processor), `CORS_ORIGIN`/`API_ADMIN_TOKEN` (api, production only), or `COLLECTOR_API_KEYS` (collector, production only). Set the variable — there is deliberately no silent fallback to a default credential in code.
