# Hermes Collector

Serviço responsável por receber métricas via HTTP e enviá-las para o Redis Stream para processamento assíncrono.

## 📋 Funcionalidades

- ✅ Recebe métricas via HTTP POST
- ✅ Valida formato e conteúdo das métricas
- ✅ Envia métricas para Redis Stream
- ✅ Suporta batch de métricas
- ✅ Health checks
- ✅ Tratamento de erros robusto

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
COLLECTOR_PORT=4318
REDIS_HOST=localhost
REDIS_PORT=6379
MAX_BATCH_SIZE=1000
NODE_ENV=development
```

## 📡 API Endpoints

### POST /api/v1/metrics

Recebe um batch de métricas.

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

Health check do serviço.

**Response:**
```json
{
  "status": "ok",
  "service": "hermes-collector",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

## 🏗️ Arquitetura

```
┌─────────────┐      HTTP/POST      ┌───────────────┐
│   Agent     │ ─────────────────> │   Collector   │
│ (@hermes/   │                     │               │
│   agent)    │                     │  - Valida     │
└─────────────┘                     │  - Enfileira  │
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
                                    │  - Processa   │
                                    │  - Persiste   │
                                    └───────────────┘
```

## 📊 Logs

O Collector usa o Logger do @hermes/shared e registra:

- Conexão com Redis
- Requests recebidos
- Métricas aceitas/rejeitadas
- Erros de validação
- Erros de sistema

Exemplo:
```
[Collector] INFO: Starting Hermes Collector...
[Redis] INFO: Redis connected
[Collector] INFO: Collector listening on port 4318
[MetricsRoute] INFO: Received batch with 10 metrics
[MetricsRoute] INFO: Batch processed: 10 accepted, 0 rejected
```

## 🐳 Docker

O Collector pode ser executado via Docker:

```bash
docker build -f docker/Dockerfile.collector -t hermes-collector .
docker run -p 4318:4318 -e REDIS_HOST=redis hermes-collector
```

## 🔍 Troubleshooting

### Erro: Failed to connect to Redis

Verifique se o Redis está rodando:
```bash
redis-cli ping
```

### Erro: Port already in use

Mude a porta via variável de ambiente:
```bash
COLLECTOR_PORT=4319 npm start
```

### Métricas sendo rejeitadas

Verifique os logs para ver erros de validação. Certifique-se que as métricas atendem o schema do @hermes/shared.
