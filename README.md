# Hermes Observability Platform

Complete observability system for Node.js applications, focusing on metrics, dashboards, and alerts.

## 📚 Quick Links

- **[🚀 Quick Start](#-getting-started)** - Get started in 5 minutes with Docker
- **[📖 API Documentation](API.md)** - Complete REST API reference
- **[🎯 Demo Application](examples/demo-app/)** - Practical SDK usage example
- **[🐋 Docker Guide](DOCKER.md)** - Complete Docker guide (400+ lines)
- **[⚡ Troubleshooting](#-troubleshooting)** - Common problems & solutions

## 🎯 MVP Scope

### ✅ Included in MVP
- ✅ Collect basic Node.js application metrics
- ✅ Simple dashboard visualization
- ✅ Basic email alerts
- ✅ Optimized time-series storage (TimescaleDB)
- ✅ Real-time cache and streaming (Redis)

### ❌ Out of MVP (v2+)
- ❌ Complex Distributed Tracing
- ❌ Machine Learning / Anomaly Detection
- ❌ Multi-tenant Architecture
- ❌ Advanced Query Language
- ❌ Custom Plugins System

## 🛠 Tech Stack

### Backend
- **Node.js 18+** + **TypeScript** - Runtime and language
- **PostgreSQL** + **TimescaleDB** - Time-series database
- **Redis** - Cache and message streaming
- **Express** - REST API

### Frontend
- **React** - User interface
- **Chart.js** - Chart visualization
- **TailwindCSS** - Styling

### DevOps
- **Docker** + **Docker Compose** - Containerization
- **npm workspaces** - Monorepo management

## 📁 Project Structure

```
hermes-observability/
├── packages/
│   ├── agent/          # SDK to instrument Node.js applications
│   ├── collector/      # Receives metrics from applications
│   ├── processor/      # Processes and persists metrics
│   ├── api/           # REST API for querying metrics
│   ├── ui/            # React Dashboard
│   └── shared/        # Shared code (types, utils)
├── docker/            # Dockerfiles and configurations
├── docs/             # Documentation
└── docker-compose.yml
```

## 🚀 Getting Started

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
- PostgreSQL 15+ com TimescaleDB
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
# Terminal 1 - Collector
cd packages/collector && npm run dev

# Terminal 2 - Processor
cd packages/processor && npm run dev

# Terminal 3 - API
cd packages/api && npm run dev

# Terminal 4 - UI
cd packages/ui && npm run dev
```

See [QUICKSTART.md](QUICKSTART.md) for detailed guide.

### 🐋 Docker Services

When running with Docker, services will be available at:

| Service    | Port | URL/Connection                    |
|-----------|------|-----------------------------------|
| UI        | 3001 | http://localhost:3001             |
| API       | 3000 | http://localhost:3000             |
| Collector | 4000 | http://localhost:4000/metrics     |
| PostgreSQL| 5432 | postgres://localhost:5432/hermes  |
| Redis     | 6379 | redis://localhost:6379            |

📖 **Complete Docker documentation:** [DOCKER.md](DOCKER.md)

## 🏗 Architecture

```
┌─────────────┐     HTTP      ┌───────────┐     Redis      ┌───────────┐     SQL     ┌──────────────┐
│   Node.js   │  ──────────►  │ Collector │  ──────────►  │ Processor │  ────────►  │ PostgreSQL + │
│ Application │   (metrics)   │  (HTTP)   │   (Stream)    │  (Worker) │             │  TimescaleDB │
└─────────────┘               └───────────┘               └───────────┘             └──────────────┘
                                    ▲                                                        │
                                    │                                                        │
                               [@hermes/agent]                                               │
                                                                                             ▼
┌─────────────┐     HTTP      ┌───────────┐                                         ┌──────────────┐
│   Browser   │  ◄──────────  │    API    │  ◄──────────────────────────────────  │    Cache     │
│     UI      │   (queries)   │  (REST)   │                                         │    (Redis)   │
└─────────────┘               └───────────┘                                         └──────────────┘
```

## 📊 Usage Examples

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

### 2. Custom Metrics Types

**Counter** - Sempre cresce (requisições, erros, pedidos):
```javascript
const requestCounter = agent.counter('api_calls_total', { 
  endpoint: '/users' 
});
requestCounter.inc();      // Incrementa 1
requestCounter.inc(5);     // Incrementa 5
```

**Gauge** - Valor que sobe/desce (memória, conexões ativas, temperatura):
```javascript
const activeUsers = agent.gauge('active_users_count', {
  region: 'us-east-1'
});
activeUsers.set(142);      // Define valor
activeUsers.inc();         // +1
activeUsers.dec(5);        // -5
```

**Histogram** - Distribução de valores (latência, tamanho de resposta):
```javascript
const responseTime = agent.histogram('response_time_ms', {
  service: 'database'
});
responseTime.observe(45);  // Registra 45ms
responseTime.observe(123); // Registra 123ms
// Automaticamente calcula p50, p95, p99, média
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
```bash
curl -X POST http://localhost:3000/api/alerts \
  -H "Content-Type: application/json" \
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

### 5. Try the Demo Application 🎯

Want to see everything working? We have a **complete demonstration application** that shows:
- ✅ E-commerce API instrumented with Hermes SDK
- ✅ All metric types (Counter, Gauge, Histogram)
- ✅ Business metrics (GMV, orders, users)
- ✅ Automatic traffic simulator
- ✅ Test endpoints (error, latency)

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

📖 **[See complete demo documentation →](examples/demo-app/README.md)**

## 📈 Features

### 📡 Metrics Collection
- ✅ **Counter**: Incremental metrics (requests, errors)
- ✅ **Gauge**: Instant values (memory, CPU, active users)
- ✅ **Histogram**: Distributions (latency, sizes)
- ✅ **Labels/Tags**: Customizable dimensions for filtering
- ✅ **Auto-instrumentation**: Automatic Node.js metrics:
  - CPU usage
  - Memory (heap, RSS, external)
  - Event loop lag
  - Active handles

### 📊 Dashboard (UI)
- ✅ Real-time visualization with Chart.js
- ✅ Time range selection (15min, 1h, 6h, 24h, 7d, 30d)
- ✅ Multiple chart types (line, area, bar)
- ✅ Filters by application and metrics
- ✅ Responsive interface with TailwindCSS

### 🚨 Alerts
- ✅ Threshold-based alerts
- ✅ Email notifications (SMTP)
- ✅ Configurable time window
- ✅ Triggered alert history
- ✅ Automatic evaluation every 1 minute

### 💾 Storage & Performance
- ✅ **TimescaleDB**: Optimized for time-series
  - Hypertables with automatic chunking
  - Continuous aggregates for fast queries
  - Retention policy (30 days by default)
- ✅ **Redis Streams**: Async buffer between collector and processor
- ✅ **Batch Processing**: Batch processing for efficiency

### 🔧 Developer Experience
- ✅ TypeScript SDK with complete type safety
- ✅ Zero-config defaults (works out-of-the-box)
- ✅ Docker Compose for local development
- ✅ Hot-reload in development
- ✅ Structured logs

## 🧪 Development

### Building the Project

```bash
# Install all dependencies
npm install

# Build all packages (monorepo)
npm run build

# Build específico de um package
npm run build --workspace=packages/agent
```

### Running Tests

```bash
# Run all tests
npm test

# Test específico
npm test --workspace=packages/processor

# Test com coverage
npm run test:coverage
```

### Code Quality

```bash
# Lint all packages
npm run lint

# Format code
npm run format

# Type checking
npm run type-check
```

### Development Workflow

```bash
# Start all services in development mode (hot-reload)
npm run dev

# Or start services individually:
npm run dev --workspace=packages/collector
npm run dev --workspace=packages/processor
npm run dev --workspace=packages/api
npm run dev --workspace=packages/ui
```

## 🔧 Troubleshooting

### Collector not receiving metrics

**Problem:** Instrumented application not sending metrics.

**Solution:**
```bash
# Check if collector is running
curl http://localhost:4000/health

# Check collector logs
docker logs hermes-collector  # or:
npm run docker logs collector

# Test manually sending metric
curl -X POST http://localhost:4000/metrics \
  -H "Content-Type: application/json" \
  -d '{
    "appName": "test",
    "metricName": "test_metric",
    "metricType": "counter",
    "value": 1,
    "labels": {}
  }'
```

### Processor not processing metrics

**Problem:** Metrics arrive at collector but don't appear in database.

**Solution:**
```bash
# Check Redis Stream
docker exec -it hermes-redis redis-cli
> XINFO STREAM hermes:metrics
> XLEN hermes:metrics  # Should be low if processor is working

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

## 📚 Documentation

### 📖 User Guides
- **[QUICKSTART.md](QUICKSTART.md)** - Quick installation guide (Docker + Manual)
- **[API.md](API.md)** - Complete REST API reference with examples
- **[DOCKER.md](DOCKER.md)** - Complete Docker guide (400+ lines)

### 🎯 Examples
- **[Demo Application](examples/demo-app/)** - E-commerce instrumented with Hermes SDK
  - All metric types
  - Traffic simulator
  - Business metrics (GMV, orders, users)

### 📝 Technical Docs
- **[MVP.md](docs/MVP.md)** - MVP scope and decisions
- **[BUILD_STATUS.md](BUILD_STATUS.md)** - Build status and fixes
- **API Reference** - Available at `/api/docs` when running (in development)

## 🤝 Contributing

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

## 📝 License

MIT License - see [LICENSE](LICENSE) for details.

---

**Developed with ❤️ by Francisco Honorat**

📫 Questions or suggestions? Open an [issue](https://github.com/FranciscoHonorat/hermes-observability/issues)!
