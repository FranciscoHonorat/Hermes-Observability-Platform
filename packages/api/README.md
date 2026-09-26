# Hermes API

REST API to query metrics, applications, and manage alerts for Hermes Observability.

## Features

- Query metrics with advanced filters
- Aggregated time-series data
- Application management
- Full alert CRUD
- Alert history
- Configurable CORS
- Structured logging

## How to Use

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

### Build

```bash
npm run build
```

### Production

```bash
npm start
```

## Configuration

Environment variables:

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

## API Endpoints

### **Metrics**

#### `GET /api/v1/metrics`
Fetch metrics with filters.

**Query Parameters:**
- `appName` (optional): Application name
- `metricName` (optional): Metric name
- `from` (optional): Start timestamp (ms)
- `to` (optional): End timestamp (ms)
- `limit` (optional): Result limit (default: 1000)
- `offset` (optional): Offset for pagination (default: 0)

**Example:**
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
Time-aggregated data (uses TimescaleDB time_bucket).

**Query Parameters:**
- `appName` (required): Application name
- `metricName` (required): Metric name
- `from` (required): Start timestamp (ms)
- `to` (required): End timestamp (ms)
- `interval` (optional): Aggregation interval (default: '1 minute')

**Example:**
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
List available metric names.

**Query Parameters:**
- `appName` (optional): Filter by application

#### `GET /api/v1/metrics/latest`
Latest value of each metric.

**Query Parameters:**
- `appName` (optional): Filter by application

---

### **Applications**

#### `GET /api/v1/applications`
List all registered applications.

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
Details of a specific application.

#### `GET /api/v1/applications/:name/metrics`
Metrics of a specific application.

**Query Parameters:**
- `limit` (optional): Result limit (default: 100)

---

### **Alerts**

#### `GET /api/v1/alerts`
List all alerts.

**Query Parameters:**
- `enabled` (optional): Filter by status (true/false)

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
Create a new alert.

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
Update an existing alert.

#### `DELETE /api/v1/alerts/:id`
Delete an alert.

#### `GET /api/v1/alerts/:id/history`
History of alert triggers.

**Query Parameters:**
- `limit` (optional): Result limit (default: 100)

---

### **Health Check**

#### `GET /health`
Check API status.

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

## Architecture

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

## Fetch Usage Example

```javascript
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

## Docker

```bash
docker build -f docker/Dockerfile.api -t hermes-api .
docker run -p 3000:3000 \
  -e POSTGRES_HOST=postgres \
  -e POSTGRES_PASSWORD=secret \
  hermes-api
```

## Troubleshooting

### Error: Failed to connect to database

Check that PostgreSQL is running:
```bash
psql -h localhost -U hermes -d hermes
```

### CORS Error

Set the `CORS_ORIGIN` variable:
```bash
CORS_ORIGIN=http://localhost:3001 npm start
```

### Slow Queries

The API uses TimescaleDB for optimization. Make sure that:
- The `metrics` table is a hypertable
- Indexes are created correctly
- `time_bucket` is being used for aggregations
