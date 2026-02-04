# Hermes Observability Platform

Sistema de observabilidade completo para aplicações Node.js, focando em métricas, dashboards e alertas.

## 🎯 MVP Scope

### ✅ Incluído no MVP
- ✅ Coletar métricas básicas de aplicação Node.js
- ✅ Visualizar dashboard simples
- ✅ Alertas básicos por email
- ✅ Armazenamento otimizado para séries temporais (TimescaleDB)
- ✅ Cache e streaming em tempo real (Redis)

### ❌ Fora do MVP (v2+)
- ❌ Distributed Tracing Complexo
- ❌ Machine Learning / Anomaly Detection
- ❌ Multi-tenant Architecture
- ❌ Advanced Query Language
- ❌ Custom Plugins System

## 🛠 Tech Stack

### Backend
- **Node.js 18+** + **TypeScript** - Runtime e linguagem
- **PostgreSQL** + **TimescaleDB** - Banco de dados para séries temporais
- **Redis** - Cache e message streaming
- **Express** - API REST

### Frontend
- **React** - Interface do usuário
- **Chart.js** - Visualização de gráficos
- **TailwindCSS** - Estilização

### DevOps
- **Docker** + **Docker Compose** - Containerização
- **npm workspaces** - Monorepo management

## 📁 Project Structure

```
hermes-observability/
├── packages/
│   ├── agent/          # SDK para instrumentar aplicações Node.js
│   ├── collector/      # Recebe métricas das aplicações
│   ├── processor/      # Processa e persiste métricas
│   ├── api/           # API REST para consulta de métricas
│   ├── ui/            # Dashboard React
│   └── shared/        # Código compartilhado (types, utils)
├── docker/            # Dockerfiles e configurações
├── docs/             # Documentação
└── docker-compose.yml
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- Docker & Docker Compose
- npm 9+

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd hermes-observability
```

2. Install dependencies
```bash
npm install
```

3. Copy environment variables
```bash
cp .env.example .env
```

4. Start infrastructure (PostgreSQL + Redis)
```bash
docker-compose up postgres redis -d
```

5. Run database migrations
```bash
npm run migrate
```

6. Start development servers
```bash
npm run dev
```

### Using Docker (Full Stack)

```bash
docker-compose up
```

Services will be available at:
- **Collector**: http://localhost:4317 (gRPC), http://localhost:4318 (HTTP)
- **API**: http://localhost:3000
- **UI**: http://localhost:3001
- **PostgreSQL**: localhost:5432
- **Redis**: localhost:6379

## 📊 Usage Example

### Instrumenting Your Node.js App

```javascript
const { HermesAgent } = require('@hermes/agent');

const agent = HermesAgent.init({
  appName: 'my-app',
  collectorUrl: 'http://localhost:4318',
});

// Track custom metrics
agent.counter('requests_total').inc();
agent.gauge('active_users').set(42);
agent.histogram('response_time').observe(150);
```

## 📈 Features

### Metrics Collection
- Counter, Gauge, Histogram
- Custom labels/tags
- Automatic Node.js runtime metrics
- HTTP request/response tracking

### Dashboard
- Real-time metric visualization
- Time range selection
- Multiple chart types
- Application filtering

### Alerts
- Threshold-based alerts
- Email notifications
- Alert history tracking

## 🧪 Development

```bash
# Run tests
npm test

# Build all packages
npm run build

# Lint code
npm run lint

# Format code
npm run format
```

## 📝 License

MIT
