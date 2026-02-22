# Hermes API

REST API para consultar métricas, aplicações e gerenciar alertas do Hermes Observability.

## 📋 Funcionalidades

- ✅ Consulta de métricas com filtros avançados
- ✅ Dados agregados em time-series
- ✅ Gerenciamento de aplicações
- ✅ CRUD completo de alertas
- ✅ Histórico de alertas
- ✅ CORS configurável
- ✅ Logging estruturado

## 🚀 Como Usar

### Instalação

```bash
npm install
```

### Desenvolvimento

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Produção

```bash
npm start
```

## 🔧 Configuração

Variáveis de ambiente:

```env
API_PORT=3000
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=hermes
POSTGRES_USER=hermes
POSTGRES_PASSWORD=hermes
DB_POOL_SIZE=10
CORS_ORIGIN=*
NODE_ENV=development
```

## 📡 Endpoints da API

### **Métricas**

#### `GET /api/v1/metrics`
Buscar métricas com filtros.

**Query Parameters:**
- `appName` (optional): Nome da aplicação
- `metricName` (optional): Nome da métrica
- `from` (optional): Timestamp inicial (ms)
- `to` (optional): Timestamp final (ms)
- `limit` (optional): Limite de resultados (default: 1000)
- `offset` (optional): Offset para paginação (default: 0)

**Exemplo:**
```bash
curl "http://localhost:3000/api/v1/metrics?appName=my-api&metricName=cpu.usage&limit=100"
```

**Response:**
```json
{
  "metrics": [
    {
      "time": "2024-01-01T00:00:00.000Z",
      "app_name": "my-api",
      "metric_name": "cpu.usage",
      "metric_type": "gauge",
      "value": 45.2,
      "labels": {}
    }
  ],
  "count": 1,
  "offset": 0,
  "limit": 100
}
```

#### `GET /api/v1/metrics/timeseries`
Dados agregados por tempo (usa TimescaleDB time_bucket).

**Query Parameters:**
- `appName` (required): Nome da aplicação
- `metricName` (required): Nome da métrica
- `from` (required): Timestamp inicial (ms)
- `to` (required): Timestamp final (ms)
- `interval` (optional): Intervalo de agregação (default: '1 minute')

**Exemplo:**
```bash
curl "http://localhost:3000/api/v1/metrics/timeseries?appName=my-api&metricName=cpu.usage&from=1640995200000&to=1641081600000&interval=5 minutes"
```

**Response:**
```json
{
  "timeseries": [
    {
      "bucket": "2024-01-01T00:00:00.000Z",
      "app_name": "my-api",
      "metric_name": "cpu.usage",
      "avg_value": 45.2,
      "max_value": 60.5,
      "min_value": 30.1,
      "count": 120
    }
  ],
  "interval": "5 minutes",
  "count": 1
}
```

#### `GET /api/v1/metrics/names`
Listar nomes de métricas disponíveis.

**Query Parameters:**
- `appName` (optional): Filtrar por aplicação

#### `GET /api/v1/metrics/latest`
Últimos valores de cada métrica.

**Query Parameters:**
- `appName` (optional): Filtrar por aplicação

---

### **Aplicações**

#### `GET /api/v1/applications`
Listar todas as aplicações registradas.

**Response:**
```json
{
  "applications": [
    {
      "name": "my-api",
      "description": null,
      "created_at": "2024-01-01T00:00:00.000Z",
      "last_seen": "2024-01-01T12:00:00.000Z",
      "is_active": true
    }
  ],
  "count": 1
}
```

#### `GET /api/v1/applications/:name`
Detalhes de uma aplicação específica.

#### `GET /api/v1/applications/:name/metrics`
Métricas de uma aplicação específica.

**Query Parameters:**
- `limit` (optional): Limite de resultados (default: 100)

---

### **Alertas**

#### `GET /api/v1/alerts`
Listar todos os alertas.

**Query Parameters:**
- `enabled` (optional): Filtrar por status (true/false)

**Response:**
```json
{
  "alerts": [
    {
      "id": 1,
      "name": "High CPU Alert",
      "description": "Alert when CPU > 80%",
      "metric_name": "cpu.usage",
      "condition": "gt",
      "threshold": 80,
      "app_name": "my-api",
      "email_recipients": ["admin@example.com"],
      "enabled": true,
      "created_at": "2024-01-01T00:00:00.000Z",
      "updated_at": "2024-01-01T00:00:00.000Z"
    }
  ],
  "count": 1
}
```

#### `POST /api/v1/alerts`
Criar novo alerta.

**Request Body:**
```json
{
  "name": "High CPU Alert",
  "description": "Alert when CPU > 80%",
  "metric_name": "cpu.usage",
  "condition": "gt",
  "threshold": 80,
  "app_name": "my-api",
  "email_recipients": ["admin@example.com"],
  "enabled": true
}
```

**Conditions:**
- `gt`: Greater than (>)
- `lt`: Less than (<)
- `eq`: Equal (=)

#### `PUT /api/v1/alerts/:id`
Atualizar alerta existente.

#### `DELETE /api/v1/alerts/:id`
Deletar alerta.

#### `GET /api/v1/alerts/:id/history`
Histórico de disparos do alerta.

**Query Parameters:**
- `limit` (optional): Limite de resultados (default: 100)

---

### **Health Check**

#### `GET /health`
Verificar status da API.

**Response:**
```json
{
  "status": "ok",
  "service": "hermes-api",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "uptime": 123.456
}
```

---

## 🏗️ Arquitetura

```
┌─────────────┐
│  Dashboard  │
│    (UI)     │
└──────┬──────┘
       │ HTTP REST
       ▼
┌─────────────┐
│   API       │
│  - Express  │
│  - CORS     │
└──────┬──────┘
       │ SQL
       ▼
┌─────────────┐
│ PostgreSQL  │
│ TimescaleDB │
└─────────────┘
```

## 📊 Exemplo de Uso com Fetch

```javascript
// Buscar métricas
const response = await fetch(
  'http://localhost:3000/api/v1/metrics/timeseries?'
  + new URLSearchParams({
    appName: 'my-api',
    metricName: 'cpu.usage',
    from: Date.now() - 3600000,
    to: Date.now(),
    interval: '1 minute'
  })
);

const data = await response.json();
console.log(data.timeseries);

// Criar alerta
const alert = await fetch('http://localhost:3000/api/v1/alerts', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    name: 'High Memory',
    metric_name: 'memory.usage',
    condition: 'gt',
    threshold: 90,
    email_recipients: ['admin@example.com']
  })
});

console.log(await alert.json());
```

## 🐳 Docker

```bash
docker build -f docker/Dockerfile.api -t hermes-api .
docker run -p 3000:3000 \
  -e POSTGRES_HOST=postgres \
  -e POSTGRES_PASSWORD=secret \
  hermes-api
```

## 🔍 Troubleshooting

### Erro: Failed to connect to database

Verifique se o PostgreSQL está rodando:
```bash
psql -h localhost -U hermes -d hermes
```

### CORS Error

Configure a variável `CORS_ORIGIN`:
```bash
CORS_ORIGIN=http://localhost:3001 npm start
```

### Slow Queries

A API usa TimescaleDB para otimização. Certifique-se que:
- A tabela `metrics` é uma hypertable
- Índices estão criados corretamente
- `time_bucket` está sendo usado para agregações
