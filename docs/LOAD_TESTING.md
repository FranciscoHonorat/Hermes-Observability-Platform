# Load Testing Hermes

Adapted from Francisco's personal-project verification roadmap, specific to this repo's real endpoints, payload shapes, and auth. Run this against a deployed instance (or a local `docker-compose up`) before writing any performance number in the README.

**Golden rule stays the same: if the test didn't run, the number doesn't go in the README.**

---

## Phase 0 — Prerequisites

- [ ] Stack is up: `npm run docker:up` (local) or a live deploy URL
- [ ] `curl http://<host>:3000/health` and `curl http://<host>:4000/health` both return `200`
- [ ] You know whether `COLLECTOR_API_KEYS` / `API_ADMIN_TOKEN` are set on this instance (changes which commands below need a header)
- [ ] `docker-compose logs -f` (or your platform's log tail) is open in another terminal
- [ ] Apache Bench and Vegeta installed locally (`brew install apache2-utils vegeta` / `apt-get install apache2-utils` + `go install github.com/tsenart/vegeta@latest`)

**Rate limits will get in the way of a naive load test — read this before running anything.** As of this audit pass, both services enforce a per-IP limit:

| Service | Default | Env override |
|---|---|---|
| API (`:3000`) | 300 req / 60s | `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS` |
| Collector (`:4000`) | 120 req / 60s | `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MS` |

Any `ab`/`vegeta` run faster than that will mostly measure the rate limiter, not the pipeline, and you'll see `429`s dominate the status-code breakdown. Two honest options:

1. **Test the rate limiter itself** (a legitimate, useful number — "the API rejects excess load at 300 req/min per IP instead of falling over").
2. **Raise the ceiling for the test window**, then report the real throughput ceiling underneath it:
   ```bash
   RATE_LIMIT_MAX=100000 RATE_LIMIT_WINDOW_MS=60000 docker-compose up -d api collector
   # ...run the tests below...
   docker-compose up -d api collector   # restore defaults when done
   ```

Never report a number as "throughput" that was actually capped by the rate limiter without saying so.

---

## Phase 1 — API read throughput & latency

These hit the API service (`:3000`), which reads from TimescaleDB (and Redis-cached queries, where applicable). No auth required — all `GET` routes are public.

### 1.1 Apache Bench — simple throughput

```bash
ab -n 1000 -c 10 http://localhost:3000/health > results/ab-health.txt 2>&1

ab -n 2000 -c 20 "http://localhost:3000/api/v1/metrics?limit=100" > results/ab-metrics-list.txt 2>&1
```

### 1.2 Vegeta — latency percentiles

```bash
mkdir -p results

cat > targets.txt <<'EOF'
GET http://localhost:3000/health
GET http://localhost:3000/api/v1/metrics?limit=100
GET http://localhost:3000/api/v1/applications
EOF

cat targets.txt | vegeta attack -duration=30s -rate=50 -timeout=10s \
  | tee results/vegeta-api.bin \
  | vegeta report -type=text | tee results/vegeta-api-report.txt

# Percentile breakdown + histogram
vegeta report -type=hist[0,50ms,100ms,250ms,500ms,1s] results/vegeta-api.bin
```

Adjust `-rate` to stay under `RATE_LIMIT_MAX / 60` requests/sec unless you've raised the limit for the run.

---

## Phase 2 — Ingestion throughput (the real pipeline)

This is the number that actually matters for an observability system: how fast can `Agent → Collector → Redis Stream → Processor → TimescaleDB` absorb metrics end to end.

### 2.1 Ingest via the Collector (realistic — exercises validation, Redis, auth, rate limiting)

```bash
cat > results/metric-batch.json <<'EOF'
{
  "metrics": [
    { "name": "http.requests.total", "type": "counter", "value": 1, "unit": "count",
      "timestamp": 0, "labels": { "method": "GET", "status": "200" },
      "metadata": { "service": "load-test", "environment": "test" } },
    { "name": "http.request.duration", "type": "histogram", "value": 42.5, "unit": "milliseconds",
      "timestamp": 0, "labels": { "method": "GET" },
      "metadata": { "service": "load-test", "environment": "test" } }
  ]
}
EOF
# stamp a real timestamp
python3 -c "
import json,time
d=json.load(open('results/metric-batch.json'))
for m in d['metrics']: m['timestamp']=int(time.time()*1000)
json.dump(d, open('results/metric-batch.json','w'))
"

# If COLLECTOR_API_KEYS is set on this instance, add: -H "x-api-key: $HERMES_API_KEY"
ab -n 1000 -c 20 -p results/metric-batch.json -T "application/json" \
  ${HERMES_API_KEY:+-H "x-api-key: $HERMES_API_KEY"} \
  http://localhost:4000/api/v1/metrics > results/ab-ingest.txt 2>&1
```

Each `ab` request here is one **batch** of 2 metrics (`202 Accepted` with `{accepted, rejected}` in the body), not one metric — multiply `Requests per second` by the batch size in `results/metric-batch.json` for an events/second figure, and quote both:

> "520 batches/sec (2 metrics/batch) = ~1,040 metrics/sec sustained via `POST /api/v1/metrics`"

### 2.2 Ingest directly to Redis (isolates the Collector/Redis hop from HTTP overhead)

```javascript
// scripts/load-test-redis-ingest.js
const Redis = require('ioredis');
const redis = new Redis({ host: process.env.REDIS_HOST || 'localhost', port: 6379 });

const STREAM = 'hermes:metrics:stream'; // REDIS_METRICS_STREAM, packages/shared/src/constants
const N = 10000;

async function main() {
  console.time(`Ingest ${N} metrics`);
  for (let i = 0; i < N; i++) {
    const metric = {
      name: 'http.requests.total',
      type: 'counter',
      value: 1,
      unit: 'count',
      timestamp: Date.now(),
      labels: { i },
      metadata: { service: 'load-test' }
    };
    await redis.xadd(STREAM, '*', 'data', JSON.stringify(metric));
  }
  console.timeEnd(`Ingest ${N} metrics`);
  console.log('Stream length:', await redis.xlen(STREAM));
  redis.quit();
}
main().catch(console.error);
```

```bash
node scripts/load-test-redis-ingest.js
```

This bypasses Collector auth/rate-limiting entirely (it writes straight to the stream the Collector itself writes to) — use it to isolate "how fast can the Processor drain the stream" from "how fast can the Collector accept HTTP requests." Compare `XLEN` before/after against the Processor's logs to get drain rate.

### 2.3 Sustained ingestion (existing repo script)

`generate-metrics.js` and `test-metrics.js` at the repo root already do this — they now forward `HERMES_API_KEY` automatically if set:

```bash
HERMES_API_KEY=$YOUR_KEY node generate-metrics.js   # continuous batches every 5s, Ctrl+C to stop
```

Useful for a longer-duration soak test rather than a burst — run it for 10+ minutes while watching Phase 3's memory numbers.

---

## Phase 3 — Resource usage under load

Since every service runs in its own container, use `docker stats` instead of `ps aux`:

```bash
# Terminal 1: baseline (idle)
docker stats --no-stream hermes-collector hermes-processor hermes-api hermes-postgres hermes-redis

# Terminal 2: generate load (e.g. Phase 2.1's ab command, or generate-metrics.js for a sustained run)

# Terminal 1 again, during load:
docker stats hermes-collector hermes-processor hermes-api --format \
  "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"

# After load stops, wait 30s and capture again to check for a leak (memory not returning toward baseline)
docker stats --no-stream hermes-collector hermes-processor hermes-api
```

Capture three numbers per service: idle, under load, and 30s after load stops.

---

## Phase 4 — Endpoint-specific tests

```bash
# Timeseries aggregation (exercises TimescaleDB time_bucket + the continuous aggregate)
FROM=$(( $(date +%s) - 21600 ))000   # 6 hours ago, ms
TO=$(date +%s)000
ab -n 300 -c 10 \
  "http://localhost:3000/api/v1/metrics/timeseries?appName=load-test&metricName=http.requests.total&interval=1%20minute&from=$FROM&to=$TO" \
  > results/ab-timeseries.txt 2>&1

# Alert list (public read)
ab -n 500 -c 10 "http://localhost:3000/api/v1/alerts" > results/ab-alerts-read.txt 2>&1

# Alert create (requires the admin token — skip if API_ADMIN_TOKEN is unset on this instance)
ab -n 200 -c 5 -p results/alert-payload.json -T "application/json" \
  -H "Authorization: Bearer $API_ADMIN_TOKEN" \
  http://localhost:3000/api/v1/alerts > results/ab-alerts-create.txt 2>&1
```

`results/alert-payload.json`:
```json
{
  "name": "Load test alert",
  "metric_name": "http.requests.total",
  "condition": "gt",
  "threshold": 1000000,
  "email_recipients": ["loadtest@example.com"],
  "enabled": false
}
```
(`threshold` set unreachably high and `enabled: false` so this doesn't actually start paging anyone via `emailService.ts`.)

---

## Phase 5 — Compile results

```markdown
## Performance Metrics (Verified via Load Test)

### Ingestion (Collector → Redis Stream)
- **HTTP batch throughput:** X batches/sec (Y metrics/sec) — `ab -n 1000 -c 20 .../api/v1/metrics`
- **Direct Redis XADD:** Z metrics/sec — scripts/load-test-redis-ingest.js

### API read throughput
- **P50 / P95 / P99 latency:** A / B / C ms — Vegeta, 50 req/s/30s
- **Timeseries query (6h range):** D ms avg — TimescaleDB continuous aggregate

### Reliability
- **Success rate:** 99.X%
- **429 (rate limited) responses:** N — expected above 300/120 req·min⁻¹ per IP unless raised for the test
- **5xx errors:** 0

### Resources (docker stats)
- **Collector — idle / under load / +30s:** X / Y / Z MB
- **Processor — idle / under load / +30s:** X / Y / Z MB
- **API — idle / under load / +30s:** X / Y / Z MB

### Captured
- Date: <fill in>
- Tooling: Apache Bench <version>, Vegeta <version>
- Environment: <local docker-compose | Render | ...>, rate limit <default | raised to N for this run>
- Reproduce: `docs/LOAD_TESTING.md`, commit `<git rev-parse --short HEAD>`
```

---

## Phase 6 — README snippet

```markdown
## Performance

Tested via Apache Bench and Vegeta against the full Collector → Redis → Processor → TimescaleDB → API pipeline (see [docs/LOAD_TESTING.md](docs/LOAD_TESTING.md)).

| Metric | Value | Test |
|---|---|---|
| Ingestion throughput | X metrics/s | `POST /api/v1/metrics`, ab -n 1000 -c 20 |
| API P99 latency | Y ms | Vegeta, 50 req/s / 30s |
| Timeseries query (6h) | Z ms | `GET /api/v1/metrics/timeseries` |
| Memory under load | W MB / service | `docker stats`, sustained load |
| Rate limit | 300 req/min (API), 120 req/min (Collector) | per source IP |

Reproduce: `docs/LOAD_TESTING.md`. Raw output in `results/` (gitignored — regenerate, don't commit stale numbers).
```

---

## Roadmap (day by day)

1. **Deploy check** — stack up, both `/health` endpoints green, decide whether this run tests default rate limits or a raised ceiling.
2. **Phase 1** — API read throughput (`ab` + Vegeta), save to `results/`.
3. **Phase 2 + 3** — ingestion throughput and resource usage together (run `generate-metrics.js` in the background while watching `docker stats`).
4. **Phase 4** — the endpoints your README actually wants to brag about (probably ingestion + timeseries, not `/health`).
5. **Phase 5 + 6** — compile the table, paste into README, re-run *one* number cold to confirm it wasn't a fluke before publishing.

Don't put a number in the README that Phase 5's template can't cite a command for.
