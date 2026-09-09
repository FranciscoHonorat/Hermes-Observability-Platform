# Quickstart

Two paths: Docker (recommended, five minutes) or running each service manually.

## Docker

```bash
git clone https://github.com/FranciscoHonorat/hermes-observability.git
cd hermes-observability
cp .env.example .env
npm install
npm run docker:up
```

This starts Postgres+TimescaleDB, Redis, the Collector, the Processor, the API, and the UI. Local dev leaves `COLLECTOR_API_KEYS` and `API_ADMIN_TOKEN` empty in `docker-compose.yml`, so every service runs unauthenticated — that's intentional for a local network, not for anything reachable outside it (see [DOCKER.md](DOCKER.md#authentication) to turn auth on).

Open the dashboard at http://localhost:3001. Nothing will show up until an instrumented app sends metrics — see below.

## Manual

Prerequisites: Node.js 18+, PostgreSQL 15+ with the TimescaleDB extension, Redis 7+, npm 9+.

```bash
npm install
cp .env.example .env    # edit POSTGRES_* / REDIS_* for your setup
npm run build

# apply the schema
psql "$DATABASE_URL" -f docker/init-db.sql

# one terminal per service
npm run dev --workspace=packages/collector
npm run dev --workspace=packages/processor
npm run dev --workspace=packages/api
npm run dev --workspace=packages/ui
```

## Send your first metric

```bash
npm install @hermes/agent
```

```javascript
const { createAgent, increment } = require('@hermes/agent');

// Reads HERMES_COLLECTOR_URL / HERMES_SERVICE_NAME / HERMES_API_KEY from env;
// HERMES_API_KEY is only needed once COLLECTOR_API_KEYS is set.
createAgent().start();

increment('http_requests_total', 1, { method: 'GET' });
```

Or skip the SDK and push a metric directly:

```bash
curl -X POST http://localhost:4000/api/v1/metrics \
  -H "Content-Type: application/json" \
  -d '{
    "metrics": [{
      "name": "test_metric",
      "type": "counter",
      "value": 1,
      "unit": "count",
      "timestamp": '"$(date +%s%3N)"'
    }]
  }'
```

Refresh the dashboard — the metric shows up within a few seconds (Collector → Redis Stream → Processor → TimescaleDB → API → UI).

## Next

- [API.md](API.md) — full REST reference
- [DOCKER.md](DOCKER.md) — service topology, volumes, auth, troubleshooting
- [examples/demo-app](examples/demo-app/) — a fully instrumented e-commerce API with a traffic simulator
