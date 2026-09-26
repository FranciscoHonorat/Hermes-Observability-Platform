# Hermes Collector

Service responsible for receiving metrics via HTTP and sending them to Redis Stream for asynchronous processing.

## Features

- Receives metrics via HTTP POST
- Validates metric format and content
- Sends metrics to Redis Stream
- Supports metric batching
- Health checks
- Robust error handling

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
COLLECTOR_PORT=4318
REDIS_HOST=localhost
REDIS_PORT=6379
MAX_BATCH_SIZE=1000
NODE_ENV=development
```

## API Endpoints

### POST /api/v1/metrics

Receives a batch of metrics.

**Request:**
```json
{
  "metrics": [
    {
      "name": "cpu.usage",
      "type": "gauge",
      "value": 45.2,
      "unit": "percent",
      "timestamp": 1234567890,
      "metadata": {
        "service": "my-api",
        "environment": "production"
      },
      "labels": {
        "host": "server-01"
      }
    }
  ],
  "timestamp": 1234567890
}
```

**Response (202 Accepted):**
```json
{
  "accepted": 1,
  "rejected": 0,
  "total": 1,
  "message": "Metrics queued for processing"
}
```

### GET /health

Service health check.

**Response:**
```json
{
  "status": "ok",
  "service": "hermes-collector",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## Architecture

```
┌─────────────┐      HTTP/POST      ┌───────────────┐
│   Agent     │ ─────────────────> │   Collector   │
│ (@hermes/   │                     │               │
│   agent)    │                     │  - Validates  │
└─────────────┘                     │  - Enqueues   │
                                    └───────┬───────┘
                                            │
                                            │ Redis Stream
                                            ▼
                                    ┌───────────────┐
                                    │     Redis     │
                                    │  (Streaming)  │
                                    └───────┬───────┘
                                            │
                                            ▼
                                    ┌───────────────┐
                                    │   Processor   │
                                    │  - Processes  │
                                    │  - Persists   │
                                    └───────────────┘
```

## Logs

The Collector uses the Logger from @hermes/shared and records:

- Redis connection
- Requests received
- Metrics accepted/rejected
- Validation errors
- System errors

Example:
```
[Collector] INFO: Starting Hermes Collector...
[Redis] INFO: Redis connected
[Collector] INFO: Collector listening on port 4318
[MetricsRoute] INFO: Received batch with 10 metrics
[MetricsRoute] INFO: Batch processed: 10 accepted, 0 rejected
```

## Docker

The Collector can be run via Docker:

```bash
docker build -f docker/Dockerfile.collector -t hermes-collector .
docker run -p 4318:4318 -e REDIS_HOST=redis hermes-collector
```

## Troubleshooting

### Error: Failed to connect to Redis

Check that Redis is running:
```bash
redis-cli ping
```

### Error: Port already in use

Change the port via environment variable:
```bash
COLLECTOR_PORT=4319 npm start
```

### Metrics being rejected

Check the logs for validation errors. Make sure the metrics match the @hermes/shared schema.
