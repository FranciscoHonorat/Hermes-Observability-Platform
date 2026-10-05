# Hermes Observability Platform

Complete observability system for Node.js applications, focusing on metrics, dashboards, and alerts.

## Quick Links

- **[Quick Start](#getting-started)** - Get started in 5 minutes with Docker
- **[API Documentation](API.md)** - Complete REST API reference
- **[Demo Application](examples/demo-app/)** - Practical SDK usage example
- **[Docker Guide](DOCKER.md)** - Services, volumes, auth, and troubleshooting
- **[Troubleshooting](#troubleshooting)** - Common problems & solutions

## MVP Scope

### Included in MVP
- Collect basic Node.js application metrics
- Simple dashboard visualization
- Basic email alerts
- Optimized time-series storage (TimescaleDB)
- Real-time cache and streaming (Redis)

### Out of MVP (v2+)
- Advanced Query Language
- Custom Plugins System
- SSO / fine-grained permissions matrix (beyond the current `admin`/`viewer` roles)

> Distributed tracing, anomaly detection, and multi-tenancy with RBAC were originally scoped out of the MVP but have since been implemented — see [Features](#features) below and [ADR 0001](docs/adr/0001-anomaly-detection-and-performance-recommendations.md) / [ADR 0002](docs/adr/0002-multi-tenancy-and-rbac.md).

## Tech Stack

### Backend
- **Go 1.26** - Collector, processor and API (`packages/backend`, one module, three binaries)
- **PostgreSQL** + **TimescaleDB** - Time-series database
- **Redis** - Message streaming (collector → processor) and API key cache
- **Python** - Anomaly detection and recommendations (`packages/intelligence`)
- **TypeScript** - Node.js agent SDK (`packages/agent`)

### Frontend
- **React** - User interface
- **Chart.js** - Chart visualization
- **TailwindCSS** - Styling

### DevOps
- **Docker** + **Docker Compose** - Containerization
- **npm workspaces** - Monorepo management

## Project Structure

```
hermes-observability/
├── packages/
│   ├── agent/          # SDK to instrument Node.js applications
│   ├── agent-go/       # Go client (metrics, tracing, logs)
│   ├── backend/        # Go: collector, processor and api (see its README)
│   │   ├── cmd/        #   one binary per service
│   │   └── internal/   #   shared model, auth, HTTP plumbing + per-service code
│   ├── intelligence/   # Python service: anomaly detection + recommendations
│   ├── ui/             # React Dashboard
│   └── shared/         # Types and logger used by the Node agent
├── docker/            # Dockerfiles and configurations
├── docs/             # Documentation (incl. docs/adr/ decision records)
└── docker-compose.yml
```

## Getting Started

### Quick Start (Docker - Recommended)

```bash
# 1. Clone repository
git clone https://github.com/FranciscoHonorat/hermes-observability.git
cd hermes-observability

# 2. Install dependencies
npm install

# 3. Build packages
npm run build

# 4. Start everything with Docker
npm run docker:up

# 5. Access dashboard
# http://localhost:3001
```

**Done!** All services will be running. See [DOCKER.md](DOCKER.md) for more details.

### Manual Installation

#### Prerequisites
- Node.js 18+
- PostgreSQL 15+ with TimescaleDB
- Redis 7+
- npm 9+

#### Steps

1. **Clone and install**
```bash
git clone https://github.com/FranciscoHonorat/hermes-observability.git
cd hermes-observability
npm install
```

2. **Configure environment**
```bash
cp .env.example .env
# Edit .env with your configurations
```

3. **Build packages**
```bash
npm run build
```

4. **Start infrastructure** (if not using Docker)
- Start PostgreSQL and run `docker/init-db.sql`
- Start Redis

5. **Start services** (in separate terminals)
```bash
# Terminals 1-3 - Go services (Go 1.26+)
cd packages/backend && go run ./cmd/collector
cd packages/backend && go run ./cmd/processor
cd packages/backend && go run ./cmd/api

# Terminal 4 - UI
cd packages/ui && npm run dev
```

See [QUICKSTART.md](QUICKSTART.md) for detailed guide.

### Docker Services

When running with Docker, services will be available at:

| Service    | Port | URL/Connection                    |
|-----------|------|-----------------------------------|
| UI        | 3001 | http://localhost:3001             |
| API (data, auth, admin) | 3000 | http://localhost:3000/api/v1 |
| Collector | 4000 | http://localhost:4000/api/v1/{metrics,traces,logs} |
| Processor health | 4010 | http://localhost:4010/healthz (stream backlog) |
| Intelligence | — | internal only, no exposed port |
| PostgreSQL| 5432 | postgres://localhost:5432/hermes  |
| Redis     | 6379 | redis://localhost:6379            |

**Complete Docker documentation:** [DOCKER.md](DOCKER.md)

## Architecture

```
 Instrumented app            Go services (packages/backend)
 [@hermes/agent,
  agent-go, any HTTP]
        │ x-api-key
        ▼
 ┌───────────┐  Redis Streams  ┌───────────┐   batched SQL   ┌──────────────┐
 │ Collector │ ──────────────► │ Processor │ ──────────────► │ PostgreSQL + │
 │  :4000    │                 │  :4010    │   alert engine  │  TimescaleDB │
 └─────┬─────┘                 └───────────┘                 └──────┬───────┘
       │ HGET api key                                                │ ▲
       ▼                                                             │ │ anomalies,
 ┌───────────┐  API key cache  ┌───────────────────────┐   SQL       │ │ recommendations
 │   Redis   │ ◄────────────── │          API          │ ◄───────────┘ │
 └───────────┘                 │ data · auth · admin   │         ┌──────┴───────┐
                               │  :3000                │         │ Intelligence │
                               └───────────▲───────────┘         │   (Python)   │
                                           │ JWT cookie          └──────────────┘
                                 ┌─────────┴─────────┐
                                 │ Browser UI (nginx │
                                 │ :3001 → /api)     │
                                 └───────────────────┘
```

Collector, processor and API are Go binaries built from `packages/backend`. They share the ingestion model, auth and HTTP middleware. See [ADR 0003](docs/adr/0003-go-backend-consolidation.md).

## Performance

Tested via Apache Bench and Vegeta against a local Docker Compose stack — full method and how to reproduce in [docs/LOAD_TESTING.md](docs/LOAD_TESTING.md).

| Metric | Value | Test |
|---|---|---|
| API read throughput | 1,191–1,442 req/s | `ab`, `/api/v1/metrics` and `/health` |
| API P99 latency | 2.4 ms | Vegeta, 50 req/s sustained 30s |
| Ingestion (Collector HTTP) | ~1,755 metrics/s | `POST /api/v1/metrics`, 0 rejected |
| Ingestion (Redis Stream direct) | ~10,000 metrics/s | isolates the Collector's HTTP overhead |
| Processor drain rate (former Node processor) | ~282 metrics/s | 60,000-metric backlog drained in ~228 s, full stack |
| **Processor drain rate (Go, batched)** | **~6,100 metrics/s** | 60,000-metric backlog drained in ~9.8 s; Postgres + Redis only, not yet re-measured on the full stack |
| Timeseries query (6h, 1min buckets) | 567 req/s, verified against real TimescaleDB data | `GET /api/v1/metrics/timeseries` |
| Memory under load | +14–35 MB per service, no growth 30s after | `docker stats` |

**The Node processor was the bottleneck**: it drained the stream one message at a time (validate → INSERT → UPSERT application → `XACK` per message). It was replaced by a Go processor that persists each batch of up to 500 messages with a single `INSERT ... SELECT FROM unnest(...)`, one applications upsert and one `XACK`. The old system also held up under sustained overload: a 60s burst at ~3.5x its drain rate built a 60,000-message backlog with zero data loss. The Go processor exposes that backlog per stream at `GET :4010/healthz`. See [packages/backend/README.md](packages/backend/README.md).

This load test also caught and fixed a real bug: the metrics table's primary key used a millisecond-resolution client timestamp, so two distinct events for the same app+metric landing in the same millisecond silently overwrote each other (`ON CONFLICT DO UPDATE`) — reproduced a 72% silent data loss rate under realistic concurrency, fixed by keying on the Redis Stream message ID instead (verified 0% loss after). See `results/RESULTS.md` for the full repro/fix, and `BUILD_STATUS.md` for migration notes if you're running an existing deployment.

Not yet tested: sustained load beyond ~1 minute, the authenticated path under load, or a backlog large enough that it never catches up. Full numbers, caveats, and the `ab`/Vegeta commands to reproduce them: [docs/LOAD_TESTING.md](docs/LOAD_TESTING.md).

## Usage Examples

### 1. Instrumenting Your Node.js Application

**Install SDK:**
```bash
npm install @hermes/agent
```

**Basic Setup:**
```javascript
const express = require('express');
const { HermesAgent } = require('@hermes/agent');

// Initialize Hermes Agent
const agent = HermesAgent.init({
  appName: 'my-service',
  collectorUrl: 'http://localhost:4000/metrics',
  labels: {
    environment: 'production',
    version: '1.0.0',
    region: 'us-east-1'
  },
  flushInterval: 10000 // Send metrics every 10s
});

const app = express();

// Track HTTP requests automatically
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    // Record request metrics
    agent.counter('http_requests_total', {
      method: req.method,
      path: req.path,
      status: res.statusCode
    }).inc();
    
    agent.histogram('http_request_duration_ms', {
      method: req.method,
      path: req.path
    }).observe(duration);
  });
  
  next();
});

// Business metrics
app.post('/orders', async (req, res) => {
  try {
    const order = await createOrder(req.body);
    
    // Track business events
    agent.counter('orders_created_total', {
      product: order.productId
    }).inc();
    
    agent.gauge('order_value_usd', {
      product: order.productId
    }).set(order.value);
    
    res.json(order);
  } catch (error) {
    agent.counter('orders_failed_total').inc();
    res.status(500).json({ error: error.message });
  }
});

app.listen(3000, () => {
  console.log('Server started with Hermes observability');
});
```

**Not a Node.js app?** There's no SDK for other languages, but the Collector's `POST /api/v1/{metrics,traces,logs}` is plain HTTP+JSON — any language can send data directly. A full Go client exists at [`packages/agent-go`](packages/agent-go/README.md) (metrics, auto-instrumentation, tracing with cross-service `traceparent` propagation, logs — verified interoperable with this same UI/API).

### 2. Custom Metrics Types

**Counter** - Always increases (requests, errors, orders):
```javascript
const requestCounter = agent.counter('api_calls_total', { 
  endpoint: '/users' 
});
requestCounter.inc();      // Increments by 1
requestCounter.inc(5);     // Increments by 5
```

**Gauge** - Value that goes up/down (memory, active connections, temperature):
```javascript
const activeUsers = agent.gauge('active_users_count', {
  region: 'us-east-1'
});
activeUsers.set(142);      // Sets value
activeUsers.inc();         // +1
activeUsers.dec(5);        // -5
```

**Histogram** - Distribution of values (latency, response size):
```javascript
const responseTime = agent.histogram('response_time_ms', {
  service: 'database'
});
responseTime.observe(45);  // Records 45ms
responseTime.observe(123); // Records 123ms
// Automatically computes p50, p95, p99, average
```

### 3. Querying Metrics via API

**Get Recent Metrics:**
```bash
curl http://localhost:3000/api/metrics?appName=my-service&limit=100
```

**Get Metrics by Time Range:**
```bash
curl "http://localhost:3000/api/metrics?appName=my-service&startTime=2026-02-20T00:00:00Z&endTime=2026-02-22T23:59:59Z"
```

**Get Aggregated Metrics:**
```bash
curl "http://localhost:3000/api/metrics/aggregated?appName=my-service&metricName=http_requests_total&interval=1h"
```

**Response Example:**
```json
{
  "metrics": [
    {
      "timestamp": "2026-02-22T10:30:00.000Z",
      "appName": "my-service",
      "metricName": "http_requests_total",
      "metricType": "counter",
      "value": 1523,
      "labels": {
        "method": "GET",
        "path": "/api/users",
        "status": "200"
      }
    }
  ]
}
```

### 4. Configuring Alerts

**Create Alert via API:**

Mutating alert routes require an authenticated `admin` session. Sign up or log in first: the UI's Login/Signup pages call `/api/v1/auth/*` and set the session cookie automatically. For scripted access, pass the JWT as a bearer token instead:

```bash
curl -X POST http://localhost:3000/api/v1/alerts \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $JWT" \
  -d '{
    "name": "High Error Rate",
    "appName": "my-service",
    "metricName": "http_errors_total",
    "condition": "greater_than",
    "threshold": 100,
    "timeWindow": 300,
    "email": "alerts@mycompany.com"
  }'
```

**Alert Conditions:**
- `greater_than` - Above threshold
- `less_than` - Below threshold
- `equal` - Equal to threshold

### 5. Try the Demo Application

Want to see everything working? We have a **complete demonstration application** that shows:
- E-commerce API instrumented with Hermes SDK
- All metric types (Counter, Gauge, Histogram)
- Business metrics (GMV, orders, users)
- Automatic traffic simulator
- Test endpoints (error, latency)

**Quick Start:**
```bash
# Make sure Hermes is running
npm run docker:up

# Run the demo
cd examples/demo-app
npm install
npm start

# Start traffic simulator
curl -X POST http://localhost:3030/api/simulator/start

# View metrics on dashboard
# http://localhost:3001
```

**[See complete demo documentation →](examples/demo-app/README.md)**

## Features

### Metrics Collection
- **Counter**: Incremental metrics (requests, errors)
- **Gauge**: Instant values (memory, CPU, active users)
- **Histogram**: Distributions (latency, sizes)
- **Labels/Tags**: Customizable dimensions for filtering
- **Auto-instrumentation**: Automatic Node.js metrics:
  - CPU usage
  - Memory (heap, RSS, external)
  - Event loop lag
  - Active handles

### Distributed Tracing
- **Spans**: `startSpan()` for manual instrumentation, `httpTracingMiddleware()` for automatic per-request spans
- **Cross-service propagation**: W3C `traceparent` header, via `instrumentAxios()` on outgoing calls
- **Waterfall view**: parent/child span hierarchy with proportional timing in the UI
- **API**: `GET /api/v1/traces` (list) and `GET /api/v1/traces/:traceId` (detail) — see [API.md](API.md#traces-endpoints)

### Log Aggregation
- **Explicit API**: `log()`/`debug()`/`info()`/`warn()`/`error()`/`captureException()` — not a `console.*` monkeypatch
- **Trace correlation**: a log written inside an active span auto-carries its `traceId`/`spanId`, no extra API needed
- **Substring search**: `pg_trgm`-indexed, so `ILIKE '%text%'` against stack traces/error codes stays fast
- **API**: `GET /api/v1/logs?appName=&level=&search=&traceId=` — see [API.md](API.md#logs-endpoints)

### Service Dependency Map
- **Zero extra instrumentation**: derived entirely from existing `spans` data — a cross-service parent/child span pair *is* a dependency edge
- **Layered graph view**: services laid out by call depth, node size/color by traffic and error rate
- **Cross-linked**: click a service to jump to its filtered trace list
- **API**: `GET /api/v1/service-map?from=&to=` — see [API.md](API.md#service-map-endpoint)

### Dashboard (UI)
- Real-time visualization with Chart.js
- Time range selection (15min, 1h, 6h, 24h, 7d, 30d)
- Multiple chart types (line, area, bar)
- Filters by application and metrics
- Responsive interface with TailwindCSS

### Intelligence (Anomaly Detection + Performance Recommendations)
- **Anomaly detection**: `IsolationForest` (scikit-learn) per `(app, metric)` series, fit on a baseline window and scored against a separate recent window — see [`packages/intelligence`](packages/intelligence/README.md) and [ADR 0001](docs/adr/0001-anomaly-detection-and-performance-recommendations.md)
- **Performance recommendations**: rule-based (not ML), derived from span latency/error-rate regressions and resource anomalies — deliberately explainable
- **API**: `GET /api/v1/anomalies`, `GET /api/v1/recommendations`, `PUT /api/v1/recommendations/:id` — see [API.md](API.md#anomalies-endpoints)
- **UI**: new Insights page

### Alerts
- Threshold-based alerts
- Email notifications (SMTP)
- Configurable time window
- Triggered alert history
- Automatic evaluation every 1 minute

### Authentication & Multi-tenancy
- **Accounts**: self-service signup/login/logout at `/api/v1/auth/*`. The JWT is issued as an httpOnly cookie, so page JavaScript never sees it
- **Roles**: `admin` (mutate alerts, manage users and API keys) and `viewer` (read-only)
- **Tenant isolation**: every table carries `tenant_id`; every API read/write is scoped to the caller's tenant
- **API key management**: `/api/v1/admin/api-keys` issues and revokes per-tenant Collector API keys (`x-api-key`). Keys are cached in Redis for fast lookup on the ingestion hot path, and the cache is rebuilt from Postgres whenever the API starts
- **Dev-mode default**: unauthenticated Collector requests are attributed to a fixed `default` tenant, so `docker compose up` still works with zero configuration
- See [ADR 0002](docs/adr/0002-multi-tenancy-and-rbac.md) for the full design rationale

### Storage & Performance
- **TimescaleDB**: Optimized for time-series
  - Hypertables with automatic chunking
  - Continuous aggregates for fast queries
  - Retention policy (30 days by default)
- **Redis Streams**: Async buffer between collector and processor
- **Batch Processing**: the collector writes each request in one Redis pipeline; the processor persists up to 500 messages per `INSERT`

### Developer Experience
- TypeScript SDK with complete type safety (plus a Go client in `packages/agent-go`)
- Zero-config defaults (works out-of-the-box)
- Docker Compose for local development
- Hot-reload in development
- Structured logs

## Development

### Building the Project

```bash
# Install all dependencies
npm install

# Build the TypeScript packages (shared, agent; ui builds with Vite)
npm run build

# Build the Go services
go -C packages/backend build ./...

# Build a specific package
npm run build --workspace=packages/agent
```

### Running Tests

```bash
# Go services (unit tests; integration tests also run when TEST_DATABASE_URL
# and TEST_REDIS_ADDR are set, see packages/backend/README.md)
npm test

# With coverage
npm run test:coverage

# Check a running stack end to end
npm run test:system
```

### Code Quality

```bash
# Lint the TypeScript packages (agent, shared)
npm run lint

# Format code
npm run format

# Type-check and build the TypeScript packages
npm run build

# Go
go -C packages/backend vet ./...
```

### Development Workflow

```bash
# Start all services in development mode (hot-reload)
npm run dev

# Or start services individually:
go -C packages/backend run ./cmd/collector
go -C packages/backend run ./cmd/processor
go -C packages/backend run ./cmd/api
npm run dev --workspace=packages/ui
```

## Troubleshooting

### Collector not receiving metrics

**Problem:** Instrumented application not sending metrics.

**Solution:**
```bash
# Check if collector is running
curl http://localhost:4000/health

# Check collector logs
docker logs hermes-collector  # or:
npm run docker logs collector

# Test manually sending a metric (add -H "x-api-key: ..." in production)
curl -X POST http://localhost:4000/api/v1/metrics \
  -H "Content-Type: application/json" \
  -d "{\"metrics\":[{\"name\":\"test_metric\",\"type\":\"counter\",\"value\":1,\"timestamp\":$(date +%s000),\"metadata\":{\"service\":\"test\"}}]}"
```
The response lists per-item validation errors (`"errors": ["Metric 0: ..."]`) for anything rejected.

### Processor not processing metrics

**Problem:** Metrics arrive at collector but don't appear in database.

**Solution:**
```bash
# Check backlog per stream (lag = not yet read, pending = read but not acked)
curl http://localhost:4010/healthz

# Check processor logs
docker logs hermes-processor

# Check PostgreSQL
docker exec -it hermes-postgres psql -U hermes -d hermes
hermes=# SELECT COUNT(*) FROM metrics;
```

### Dashboard not loading data

**Problem:** UI shows "No data available".

**Solution:**
```bash
# Check API
curl http://localhost:3000/api/metrics?limit=10

# Check API logs
docker logs hermes-api

# Check browser connection (DevTools > Network)
# The UI makes requests to http://localhost:3000/api
```

### Docker containers not starting

**Problem:** `docker-compose up` fails.

**Solution:**
```bash
# Forced rebuild
npm run docker:rebuild

# Clean volumes and cache
docker-compose down -v
docker system prune -a

# Check ports in use
netstat -ano | findstr :3000  # Windows
lsof -i :3000                 # Linux/Mac

# Detailed logs
docker-compose up --no-start
docker-compose logs
```

## Documentation

### User Guides
- **[QUICKSTART.md](QUICKSTART.md)** - Quick installation guide (Docker + Manual)
- **[API.md](API.md)** - Complete REST API reference with examples
- **[DOCKER.md](DOCKER.md)** - Complete Docker guide

### Examples
- **[Demo Application](examples/demo-app/)** - E-commerce instrumented with Hermes SDK
  - All metric types
  - Traffic simulator
  - Business metrics (GMV, orders, users)

### Technical Docs
- **[MVP.md](docs/MVP.md)** - MVP scope and decisions
- **[BUILD_STATUS.md](BUILD_STATUS.md)** - Build status and fixes
- **[LOAD_TESTING.md](docs/LOAD_TESTING.md)** - Throughput/latency test roadmap and how to reproduce the numbers before they go in this README
- **[docs/adr/](docs/adr/)** - Architecture decision records (anomaly detection, multi-tenancy, Go backend)
- **[packages/backend](packages/backend/README.md)** - Go services: layout, configuration, tests

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a branch for your feature (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

### Development Guidelines

- Use TypeScript for type safety
- Follow the style guide (ESLint + Prettier configured)
- Add tests for new features
- Update documentation when necessary
- Commits should follow [Conventional Commits](https://www.conventionalcommits.org/)

## License

MIT License - see [LICENSE](LICENSE) for details.

---

**Developed by Francisco Honorat**

Questions or suggestions? Open an [issue](https://github.com/FranciscoHonorat/hermes-observability/issues)!
