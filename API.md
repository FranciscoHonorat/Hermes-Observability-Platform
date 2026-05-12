# Hermes Observability API Documentation

Complete REST API reference for the Hermes Observability Platform.

**Base URL:** `http://localhost:3000/api/v1`

## 📋 Table of Contents

- [Authentication](#authentication)
- [Metrics Endpoints](#metrics-endpoints)
  - [Get Metrics](#get-metrics)
  - [Get Timeseries](#get-timeseries)
  - [Get Metric Names](#get-metric-names)
  - [Get Latest Metrics](#get-latest-metrics)
- [Alerts Endpoints](#alerts-endpoints)
  - [List Alerts](#list-alerts)
  - [Get Alert Details](#get-alert-details)
  - [Create Alert](#create-alert)
  - [Update Alert](#update-alert)
  - [Delete Alert](#delete-alert)
  - [Get Alert History](#get-alert-history)
- [Applications Endpoints](#applications-endpoints)
- [Error Responses](#error-responses)
- [Rate Limiting](#rate-limiting)

---

## Authentication

🔓 **MVP não possui autenticação**. Todos os endpoints são públicos.

> **v2+**: Será implementado API keys e JWT tokens.

---

## Metrics Endpoints

### Get Metrics

Busca métricas com filtros opcionais.

**Endpoint:** `GET /api/v1/metrics`

**Query Parameters:**

| Parameter    | Type   | Required | Description                          | Example                    |
|-------------|--------|----------|--------------------------------------|----------------------------|
| `appName`   | string | No       | Filtrar por nome da aplicação        | `my-service`              |
| `metricName`| string | No       | Filtrar por nome da métrica          | `http_requests_total`     |
| `from`      | number | No       | Timestamp inicial (milliseconds)     | `1708617600000`           |
| `to`        | number | No       | Timestamp final (milliseconds)       | `1708704000000`           |
| `limit`     | number | No       | Número máximo de resultados (default: 1000) | `100`        |
| `offset`    | number | No       | Offset para paginação (default: 0)   | `50`                      |

**Example Request:**

```bash
curl "http://localhost:3000/api/v1/metrics?appName=my-service&metricName=http_requests_total&limit=100"
```

**Example Response:**

```json
{
  "metrics": [
    {
      "time": "2026-02-22T15:30:00.000Z",
      "app_name": "my-service",
      "metric_name": "http_requests_total",
      "metric_type": "counter",
      "value": 1523,
      "labels": {
        "method": "GET",
        "path": "/api/users",
        "status": "200"
      }
    },
    {
      "time": "2026-02-22T15:29:50.000Z",
      "app_name": "my-service",
      "metric_name": "http_requests_total",
      "metric_type": "counter",
      "value": 1522,
      "labels": {
        "method": "POST",
        "path": "/api/orders",
        "status": "201"
      }
    }
  ],
  "count": 2,
  "offset": 0,
  "limit": 100
}
```

---

### Get Timeseries

Busca dados agregados por tempo (para gráficos).

**Endpoint:** `GET /api/v1/metrics/timeseries`

**Query Parameters:**

| Parameter    | Type   | Required | Description                          | Example                    |
|-------------|--------|----------|--------------------------------------|----------------------------|
| `appName`   | string | **Yes**  | Nome da aplicação                    | `my-service`              |
| `metricName`| string | **Yes**  | Nome da métrica                      | `http_request_duration_ms`|
| `from`      | number | **Yes**  | Timestamp inicial (milliseconds)     | `1708617600000`           |
| `to`        | number | **Yes**  | Timestamp final (milliseconds)       | `1708704000000`           |
| `interval`  | string | No       | Intervalo de agregação (default: "1 minute") | `5 minutes`, `1 hour` |

**Supported Intervals:**
- `1 second`, `5 seconds`, `10 seconds`, `30 seconds`
- `1 minute`, `5 minutes`, `15 minutes`, `30 minutes`
- `1 hour`, `3 hours`, `6 hours`, `12 hours`
- `1 day`, `7 days`, `30 days`

**Example Request:**

```bash
curl "http://localhost:3000/api/v1/metrics/timeseries?appName=my-service&metricName=http_request_duration_ms&from=1708617600000&to=1708704000000&interval=5%20minutes"
```

**Example Response:**

```json
{
  "timeseries": [
    {
      "bucket": "2026-02-22T15:00:00.000Z",
      "app_name": "my-service",
      "metric_name": "http_request_duration_ms",
      "avg_value": 125.43,
      "max_value": 450,
      "min_value": 23,
      "count": 1523
    },
    {
      "bucket": "2026-02-22T15:05:00.000Z",
      "app_name": "my-service",
      "metric_name": "http_request_duration_ms",
      "avg_value": 132.15,
      "max_value": 520,
      "min_value": 18,
      "count": 1847
    }
  ],
  "interval": "5 minutes",
  "count": 2
}
```

**Use Case:**

Este endpoint é ideal para gráficos de linha/área mostrando evolução temporal das métricas.

---

### Get Metric Names

Lista todas as métricas disponíveis.

**Endpoint:** `GET /api/v1/metrics/names`

**Query Parameters:**

| Parameter  | Type   | Required | Description                   | Example      |
|-----------|--------|----------|-------------------------------|--------------|
| `appName` | string | No       | Filtrar por nome da aplicação | `my-service` |

**Example Request:**

```bash
curl "http://localhost:3000/api/v1/metrics/names?appName=my-service"
```

**Example Response:**

```json
{
  "metrics": [
    {
      "metric_name": "cpu_usage_percent",
      "metric_type": "gauge"
    },
    {
      "metric_name": "http_requests_total",
      "metric_type": "counter"
    },
    {
      "metric_name": "http_request_duration_ms",
      "metric_type": "histogram"
    },
    {
      "metric_name": "memory_heap_used_bytes",
      "metric_type": "gauge"
    }
  ],
  "count": 4
}
```

---

### Get Latest Metrics

Busca os últimos valores de cada métrica.

**Endpoint:** `GET /api/v1/metrics/latest`

**Query Parameters:**

| Parameter  | Type   | Required | Description                   | Example      |
|-----------|--------|----------|-------------------------------|--------------|
| `appName` | string | No       | Filtrar por nome da aplicação | `my-service` |

**Example Request:**

```bash
curl "http://localhost:3000/api/v1/metrics/latest?appName=my-service"
```

**Example Response:**

```json
{
  "metrics": [
    {
      "time": "2026-02-22T15:35:12.000Z",
      "app_name": "my-service",
      "metric_name": "cpu_usage_percent",
      "metric_type": "gauge",
      "value": 45.2,
      "labels": {}
    },
    {
      "time": "2026-02-22T15:35:10.000Z",
      "app_name": "my-service",
      "metric_name": "memory_heap_used_bytes",
      "metric_type": "gauge",
      "value": 125829120,
      "labels": {}
    }
  ],
  "count": 2
}
```

**Use Case:**

Dashboard de overview mostrando valores atuais (current CPU, memory, request rate, etc).

---

## Alerts Endpoints

### List Alerts

Lista todos os alertas configurados.

**Endpoint:** `GET /api/v1/alerts`

**Query Parameters:**

| Parameter | Type    | Required | Description                          | Example |
|----------|---------|----------|--------------------------------------|---------|
| `enabled`| boolean | No       | Filtrar por status (true/false)      | `true`  |

**Example Request:**

```bash
curl "http://localhost:3000/api/v1/alerts?enabled=true"
```

**Example Response:**

```json
{
  "alerts": [
    {
      "id": 1,
      "name": "High Error Rate",
      "description": "Alert when error rate exceeds 5%",
      "metric_name": "http_errors_total",
      "condition": "gt",
      "threshold": 100,
      "app_name": "my-service",
      "email_recipients": ["ops@company.com", "dev@company.com"],
      "enabled": true,
      "created_at": "2026-02-20T10:00:00.000Z",
      "updated_at": "2026-02-20T10:00:00.000Z"
    }
  ],
  "count": 1
}
```

---

### Get Alert Details

Busca detalhes de um alerta específico.

**Endpoint:** `GET /api/v1/alerts/:id`

**Path Parameters:**

| Parameter | Type   | Required | Description | Example |
|----------|--------|----------|-------------|---------|
| `id`     | number | **Yes**  | Alert ID    | `1`     |

**Example Request:**

```bash
curl "http://localhost:3000/api/v1/alerts/1"
```

**Example Response:**

```json
{
  "id": 1,
  "name": "High Error Rate",
  "description": "Alert when error rate exceeds 5%",
  "metric_name": "http_errors_total",
  "condition": "gt",
  "threshold": 100,
  "app_name": "my-service",
  "email_recipients": ["ops@company.com"],
  "enabled": true,
  "created_at": "2026-02-20T10:00:00.000Z",
  "updated_at": "2026-02-20T10:00:00.000Z"
}
```

---

### Create Alert

Cria um novo alerta.

**Endpoint:** `POST /api/v1/alerts`

**Request Body:**

| Field              | Type     | Required | Description                          | Example                    |
|-------------------|----------|----------|--------------------------------------|----------------------------|
| `name`            | string   | **Yes**  | Nome do alerta                       | `"High CPU Usage"`        |
| `description`     | string   | No       | Descrição do alerta                  | `"Alert when CPU > 80%"`  |
| `metric_name`     | string   | **Yes**  | Nome da métrica a monitorar          | `"cpu_usage_percent"`     |
| `condition`       | string   | **Yes**  | Condição: `gt`, `lt`, `eq`           | `"gt"`                    |
| `threshold`       | number   | **Yes**  | Valor threshold                      | `80`                      |
| `app_name`        | string   | No       | Nome da aplicação (null = todas)     | `"my-service"`            |
| `email_recipients`| string[] | **Yes**  | Lista de emails para notificação     | `["ops@company.com"]`     |
| `enabled`         | boolean  | No       | Status inicial (default: true)       | `true`                    |

**Conditions:**
- `gt` - Greater than
- `lt` - Less than
- `eq` - Equal

**Example Request:**

```bash
curl -X POST http://localhost:3000/api/v1/alerts \
  -H "Content-Type: application/json" \
  -d '{
    "name": "High CPU Usage",
    "description": "Alert when CPU usage exceeds 80%",
    "metric_name": "cpu_usage_percent",
    "condition": "gt",
    "threshold": 80,
    "app_name": "my-service",
    "email_recipients": ["ops@company.com", "dev@company.com"],
    "enabled": true
  }'
```

**Example Response:**

```json
{
  "id": 2,
  "name": "High CPU Usage",
  "description": "Alert when CPU usage exceeds 80%",
  "metric_name": "cpu_usage_percent",
  "condition": "gt",
  "threshold": 80,
  "app_name": "my-service",
  "email_recipients": ["ops@company.com", "dev@company.com"],
  "enabled": true,
  "created_at": "2026-02-22T15:40:00.000Z",
  "updated_at": "2026-02-22T15:40:00.000Z"
}
```

**Status Code:** `201 Created`

---

### Update Alert

Atualiza um alerta existente.

**Endpoint:** `PUT /api/v1/alerts/:id`

**Path Parameters:**

| Parameter | Type   | Required | Description | Example |
|----------|--------|----------|-------------|---------|
| `id`     | number | **Yes**  | Alert ID    | `1`     |

**Request Body:**

Mesmos campos do [Create Alert](#create-alert), mas todos opcionais. Apenas os campos enviados serão atualizados.

**Example Request:**

```bash
curl -X PUT http://localhost:3000/api/v1/alerts/1 \
  -H "Content-Type: application/json" \
  -d '{
    "threshold": 90,
    "enabled": false
  }'
```

**Example Response:**

```json
{
  "id": 1,
  "name": "High CPU Usage",
  "description": "Alert when CPU usage exceeds 90%",
  "metric_name": "cpu_usage_percent",
  "condition": "gt",
  "threshold": 90,
  "app_name": "my-service",
  "email_recipients": ["ops@company.com"],
  "enabled": false,
  "created_at": "2026-02-20T10:00:00.000Z",
  "updated_at": "2026-02-22T15:45:00.000Z"
}
```

---

### Delete Alert

Remove um alerta.

**Endpoint:** `DELETE /api/v1/alerts/:id`

**Path Parameters:**

| Parameter | Type   | Required | Description | Example |
|----------|--------|----------|-------------|---------|
| `id`     | number | **Yes**  | Alert ID    | `1`     |

**Example Request:**

```bash
curl -X DELETE http://localhost:3000/api/v1/alerts/1
```

**Example Response:**

```json
{
  "message": "Alert deleted successfully",
  "id": 1
}
```

**Status Code:** `200 OK`

---

### Get Alert History

Lista histórico de alertas disparados.

**Endpoint:** `GET /api/v1/alerts/:id/history`

**Path Parameters:**

| Parameter | Type   | Required | Description | Example |
|----------|--------|----------|-------------|---------|
| `id`     | number | **Yes**  | Alert ID    | `1`     |

**Query Parameters:**

| Parameter | Type   | Required | Description                     | Example |
|----------|--------|----------|---------------------------------|---------|
| `limit`  | number | No       | Limite de resultados (default: 100) | `50` |

**Example Request:**

```bash
curl "http://localhost:3000/api/v1/alerts/1/history?limit=50"
```

**Example Response:**

```json
{
  "history": [
    {
      "id": 123,
      "alert_rule_id": 1,
      "triggered_at": "2026-02-22T14:30:00.000Z",
      "metric_value": 95.3,
      "threshold": 80,
      "condition": "gt",
      "app_name": "my-service",
      "email_sent": true,
      "resolved_at": "2026-02-22T14:45:00.000Z"
    },
    {
      "id": 122,
      "alert_rule_id": 1,
      "triggered_at": "2026-02-21T10:15:00.000Z",
      "metric_value": 87.1,
      "threshold": 80,
      "condition": "gt",
      "app_name": "my-service",
      "email_sent": true,
      "resolved_at": "2026-02-21T10:20:00.000Z"
    }
  ],
  "count": 2
}
```

---

## Applications Endpoints

### List Applications

List all applications that send metrics.

**Endpoint:** `GET /api/v1/apps`

**Example Request:**

```bash
curl "http://localhost:3000/api/v1/apps"
```

**Example Response:**

```json
{
  "applications": [
    {
      "app_name": "my-service",
      "metric_count": 15234,
      "first_seen": "2026-02-20T00:00:00.000Z",
      "last_seen": "2026-02-22T15:50:00.000Z"
    },
    {
      "app_name": "payment-service",
      "metric_count": 8721,
      "first_seen": "2026-02-21T10:00:00.000Z",
      "last_seen": "2026-02-22T15:48:00.000Z"
    }
  ],
  "count": 2
}
```

---

## Error Responses

Todos os erros seguem o formato:

```json
{
  "error": "Error message description"
}
```

**Status Codes:**

| Code | Description                      | Example                                    |
|------|----------------------------------|--------------------------------------------|
| 400  | Bad Request - Parâmetros inválidos | Missing required parameter: appName      |
| 404  | Not Found - Recurso não encontrado | Alert not found                          |
| 500  | Internal Server Error            | Database connection error                |

**Example Error Response:**

```bash
curl "http://localhost:3000/api/v1/metrics/timeseries?appName=test"
```

```json
{
  "error": "Missing required parameters: appName, metricName, from, to"
}
```

---

## Rate Limiting

⚠️ **MVP não possui rate limiting**.

> **v2+**: Será implementado rate limiting de 1000 requests/minute por IP.

---

## Health Check

**Endpoint:** `GET /health`

Verifica se a API está funcionando.

**Example Request:**

```bash
curl http://localhost:3000/health
```

**Example Response:**

```json
{
  "status": "ok",
  "timestamp": "2026-02-22T15:55:00.000Z",
  "uptime": 86400,
  "database": "connected",
  "redis": "connected"
}
```

---

## Complete cURL Examples

### Scenario: Monitoring a Web Service

**1. Create an alert for high error rate:**

```bash
curl -X POST http://localhost:3000/api/v1/alerts \
  -H "Content-Type: application/json" \
  -d '{
    "name": "High Error Rate",
    "metric_name": "http_errors_total",
    "condition": "gt",
    "threshold": 50,
    "app_name": "web-api",
    "email_recipients": ["ops@company.com"]
  }'
```

**2. Query error metrics for last 24 hours:**

```bash
FROM=$(date -d '24 hours ago' +%s)000
TO=$(date +%s)000

curl "http://localhost:3000/api/v1/metrics?appName=web-api&metricName=http_errors_total&from=$FROM&to=$TO"
```

**3. Get timeseries for response time (last 6 hours, 5min intervals):**

```bash
FROM=$(date -d '6 hours ago' +%s)000
TO=$(date +%s)000

curl "http://localhost:3000/api/v1/metrics/timeseries?appName=web-api&metricName=http_request_duration_ms&from=$FROM&to=$TO&interval=5%20minutes"
```

**4. Check current CPU and memory:**

```bash
curl "http://localhost:3000/api/v1/metrics/latest?appName=web-api"
```

**5. List all active alerts:**

```bash
curl "http://localhost:3000/api/v1/alerts?enabled=true"
```

---

## JavaScript/TypeScript Examples

### Using Fetch API

```javascript
// Get latest metrics
async function getLatestMetrics(appName) {
  const response = await fetch(
    `http://localhost:3000/api/v1/metrics/latest?appName=${appName}`
  );
  const data = await response.json();
  return data.metrics;
}

// Get timeseries for chart
async function getTimeseries(appName, metricName, hours = 24) {
  const to = Date.now();
  const from = to - (hours * 60 * 60 * 1000);
  
  const params = new URLSearchParams({
    appName,
    metricName,
    from: from.toString(),
    to: to.toString(),
    interval: '5 minutes'
  });
  
  const response = await fetch(
    `http://localhost:3000/api/v1/metrics/timeseries?${params}`
  );
  const data = await response.json();
  return data.timeseries;
}

// Create alert
async function createAlert(alertConfig) {
  const response = await fetch('http://localhost:3000/api/v1/alerts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(alertConfig)
  });
  
  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error);
  }
  
  return response.json();
}

// Usage
const metrics = await getLatestMetrics('my-service');
console.log('Current CPU:', metrics.find(m => m.metric_name === 'cpu_usage_percent').value);

const chartData = await getTimeseries('my-service', 'http_requests_total', 6);
console.log('Chart data points:', chartData.length);

await createAlert({
  name: 'Memory Alert',
  metric_name: 'memory_heap_used_bytes',
  condition: 'gt',
  threshold: 500000000, // 500MB
  app_name: 'my-service',
  email_recipients: ['dev@company.com']
});
```

---

## Postman Collection

Importe esta collection no Postman para testar todos os endpoints:

```json
{
  "info": {
    "name": "Hermes Observability API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Metrics",
      "item": [
        {
          "name": "Get Metrics",
          "request": {
            "method": "GET",
            "header": [],
            "url": {
              "raw": "http://localhost:3000/api/v1/metrics?appName=my-service&limit=10",
              "protocol": "http",
              "host": ["localhost"],
              "port": "3000",
              "path": ["api", "v1", "metrics"],
              "query": [
                {"key": "appName", "value": "my-service"},
                {"key": "limit", "value": "10"}
              ]
            }
          }
        }
      ]
    }
  ]
}
```

---

## Support

📚 **Complete documentation:** [README.md](README.md)  
🐋 **Docker guide:** [DOCKER.md](DOCKER.md)  
🚀 **Quick Start:** [QUICKSTART.md](QUICKSTART.md)  
🐛 **Issues:** [GitHub Issues](https://github.com/FranciscoHonorat/hermes-observability/issues)

---

**Última atualização:** February 22, 2026  
**API Version:** v1.0.0
