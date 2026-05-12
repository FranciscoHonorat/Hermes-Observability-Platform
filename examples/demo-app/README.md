# Hermes Observability - Demo Application

Complete demonstration application showing how to use the **Hermes Agent SDK** to instrument a Node.js/Express application with observability metrics.

## 📋 What This Demo Shows

### ✅ Automatic Metrics
- ✨ **CPU Usage** - Process CPU usage
- 💾 **Memory** - Heap, RSS, external memory
- ⏱️ **Event Loop Lag** - Event loop latency
- 🔌 **Active Handles** - Active Node.js handles

### ✅ HTTP Metrics
- 📊 **Request Count** - Total requests by method/path/status
- ⏲️ **Request Duration** - Latency of each request (histogram)
- ❌ **Error Count** - Total 4xx/5xx errors

### ✅ Business Metrics
- 👥 **Users Created** - Total users created
- 🛒 **Orders Created** - Total orders created
- 💰 **GMV** (Gross Merchandise Value) - Total sales value
- 📦 **Order Value & Quantity** - Value and quantity distribution

### ✅ Advanced Features
- 🏷️ **Labels/Tags** - Customizable dimensions (product, status, etc)
- 📈 **Counter, Gauge, Histogram** - All metric types
- 🚦 **Traffic Simulator** - Automatic traffic simulator
- 💥 **Error Simulation** - Endpoint to test error alerts

## 🚀 How to Run

### Prerequisites

Make sure the **Hermes Observability Platform** is running:

```bash
# In the hermes-observability project root
npm run docker:up

# Or manually:
# Terminal 1: Collector
cd packages/collector && npm run dev

# Terminal 2: Processor  
cd packages/processor && npm run dev

# Terminal 3: API
cd packages/api && npm run dev

# Terminal 4: UI
cd packages/ui && npm run dev
```

### Install and Execute Demo

```bash
# Enter the demo folder
cd examples/demo-app

# Install dependencies
npm install

# Execute
npm start
```

The application will be running at: **http://localhost:3030**

## 🎯 Available Endpoints

### Main API

| Method | Endpoint          | Description                          |
|--------|-------------------|--------------------------------------|
| GET    | `/health`         | Health check                         |
| GET    | `/api/products`   | List products (variable latency)     |
| POST   | `/api/users`      | Create user                          |
| POST   | `/api/orders`     | Create order                         |
| GET    | `/api/stats`      | General statistics                   |
| GET    | `/api/slow`       | Slow endpoint (2-5s) for testing     |
| GET    | `/api/error`      | Simulate 500 error                   |

### Traffic Simulator (Optional)

| Method | Endpoint                  | Description                       |
|--------|---------------------------|-----------------------------------|
| POST   | `/api/simulator/start`    | Start traffic simulator           |
| POST   | `/api/simulator/stop`     | Stop traffic simulator            |

## 📝 Usage Examples

### 1. Create User

```bash
curl -X POST http://localhost:3030/api/users \
  -H "Content-Type: application/json" \
  -d '{
    "name": "John Doe",
    "email": "john@example.com"
  }'
```

**Generated metrics:**
- `users_created_total` (counter) +1
- `total_users` (gauge) = current number of users
- `http_requests_total` (counter) +1
- `http_request_duration_ms` (histogram) with duration

### 2. Create Order

```bash
curl -X POST http://localhost:3030/api/orders \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "productId": 1,
    "quantity": 2
  }'
```

**Generated metrics:**
- `orders_created_total{product="Laptop",value_range="high"}` (counter) +1
- `order_value_usd{product="Laptop"}` (gauge) = 1999.98
- `order_quantity{product="Laptop"}` (histogram) observes 2
- `total_orders` (gauge) = total number of orders
- `total_gmv_usd` (gauge) = total value of all sales

### 3. List Products (with variable latency)

```bash
curl http://localhost:3030/api/products
```

**Generated metrics:**
- `products_listed_total` (counter) +1
- `http_request_duration_ms` (histogram) observes latency (50-200ms)

### 4. View Statistics

```bash
curl http://localhost:3030/api/stats
```

**Returns:**
```json
{
  "total_users": 5,
  "total_orders": 12,
  "total_gmv": 5234.88,
  "avg_order_value": 436.24
}
```

### 5. Simulate Error

```bash
curl http://localhost:3030/api/error
```

**Generated metrics:**
- `forced_errors_total{type="500"}` (counter) +1
- `http_errors_total{status="500"}` (counter) +1
- `unhandled_errors_total` (counter) +1

### 6. Test High Latency

```bash
curl http://localhost:3030/api/slow
```

**Generated metrics:**
- `slow_endpoint_calls_total` (counter) +1
- `slow_operation_duration_ms` (histogram) observes 2000-5000ms
- `http_request_duration_ms` (histogram) observes total time

### 7. Start Traffic Simulator

```bash
curl -X POST http://localhost:3030/api/simulator/start
```

**What it does:**
- Automatically generates traffic every 2 seconds
- Simulates requests to different endpoints (weight-based)
- Updates `active_users_count` with random values (50-250)
- Useful for populating the dashboard with data

### 8. Stop Simulator

```bash
curl -X POST http://localhost:3030/api/simulator/stop
```

## 📊 Viewing Metrics

### 1. Via Dashboard (UI)

Open the dashboard: **http://localhost:3001**

You'll see:
- Charts of all collected metrics
- Filters by application (`demo-ecommerce`)
- Time range selector (15min, 1h, 6h, 24h, 7d, 30d)

### 2. Via API

**Fetch latest metrics:**
```bash
curl "http://localhost:3000/api/v1/metrics/latest?appName=demo-ecommerce"
```

**Fetch timeseries (for charts):**
```bash
# Last 6 hours, 5-minute intervals
FROM=$(date -d '6 hours ago' +%s)000
TO=$(date +%s)000

curl "http://localhost:3000/api/v1/metrics/timeseries?appName=demo-ecommerce&metricName=http_requests_total&from=$FROM&to=$TO&interval=5%20minutes"
```

**List all available metrics:**
```bash
curl "http://localhost:3000/api/v1/metrics/names?appName=demo-ecommerce"
```

### 3. Via Logs

The demo app shows logs in the console when it initializes:
```
✅ Hermes Agent initialized
📊 Sending metrics to: http://localhost:4000/metrics
🏷️  App Name: demo-ecommerce
```

## 🚨 Testing Alerts

### Create Alert for High Error Rate

```bash
curl -X POST http://localhost:3000/api/v1/alerts \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Demo - High Error Rate",
    "description": "Alert when demo app has too many errors",
    "metric_name": "http_errors_total",
    "condition": "gt",
    "threshold": 10,
    "app_name": "demo-ecommerce",
    "email_recipients": ["alerts@example.com"],
    "enabled": true
  }'
```

### Trigger the Alert

```bash
# Call the error endpoint 15 times
for i in {1..15}; do
  curl http://localhost:3030/api/error
  sleep 1
done
```

After ~1 minute, the alert will be triggered and you'll receive:
- Email notification (if SMTP configured)
- Entry in alert history

**Check history:**
```bash
curl "http://localhost:3000/api/v1/alerts/1/history"
```

## 🔍 Code Example - Instrumentation

### Initialize Agent

```javascript
const { HermesAgent } = require('@hermes/agent');

const agent = HermesAgent.init({
  appName: 'demo-ecommerce',
  collectorUrl: 'http://localhost:4000/metrics',
  labels: {
    environment: 'development',
    service: 'api',
    version: '1.0.0'
  },
  flushInterval: 5000
});
```

### Counter - Always Increases

```javascript
// Request total
agent.counter('http_requests_total', {
  method: req.method,
  path: req.path
}).inc();

// Orders created
agent.counter('orders_created_total', {
  product: product.name
}).inc();
```

### Gauge - Instant Value

```javascript
// Total users
agent.gauge('total_users').set(users.length);

// Order value
agent.gauge('order_value_usd', {
  product: product.name
}).set(totalValue);

// Total GMV
agent.gauge('total_gmv_usd').set(gmv);
```

### Histogram - Value Distribution

```javascript
// Request latency
agent.histogram('http_request_duration_ms', {
  method: req.method,
  path: req.path
}).observe(duration);

// Items quantity per order
agent.histogram('order_quantity', {
  product: product.name
}).observe(quantity);
```

## 📚 Code Structure

```
demo-app/
├── package.json          # Dependencies
├── README.md             # This documentation
└── src/
    └── index.js          # Main code (commented)
```

**Code sections:**

1. **Agent Initialization** - Hermes SDK setup
2. **Express Setup** - Application creation
3. **HTTP Middleware** - Automatic request tracking
4. **API Endpoints** - Business endpoints with metrics
5. **Traffic Simulator** - Automatic traffic generator
6. **Server Start** - Server initialization

## 🎓 Key Learnings

### 1. Metric Types

| Type      | When to Use                              | Examples                     |
|-----------|------------------------------------------|------------------------------|
| Counter   | Values that always increase              | requests_total, errors_total |
| Gauge     | Values that go up/down                   | memory, active_users, temp   |
| Histogram | Distributions (latency, sizes)           | request_duration, file_size  |

### 2. Labels/Tags Best Practices

✅ **Good:**
```javascript
agent.counter('http_requests_total', {
  method: 'GET',
  status: '200'
}).inc();
```

❌ **Avoid:**
```javascript
// Don't use high cardinality values (user_id, request_id, etc)
agent.counter('requests_per_user', {
  user_id: '12345'  // ❌ High cardinality
}).inc();
```

### 3. Flush Interval

- **Development:** 5-10 seconds (more frequent, fresher data)
- **Production:** 30-60 seconds (less overhead)

```javascript
HermesAgent.init({
  flushInterval: 30000  // 30 seconds
});
```

## 🐛 Troubleshooting

### Metrics don't appear on Dashboard

1. **Check if Collector is running:**
   ```bash
   curl http://localhost:4000/health
   ```

2. **Check demo app logs:**
   - Should show "✅ Hermes Agent initialized"

3. **Check if there are metrics in the database:**
   ```bash
   docker exec -it hermes-postgres psql -U hermes -d hermes
   hermes=# SELECT COUNT(*) FROM metrics WHERE app_name = 'demo-ecommerce';
   ```

4. **Force manual flush:**
   ```javascript
   // Add to code:
   await agent.flush();
   ```

### Demo app doesn't start

**Error:** `Cannot find module '@hermes/agent'`

**Solution:**
```bash
# Build agent first
cd ../../packages/agent
npm run build

# Go back and reinstall
cd ../../examples/demo-app
rm -rf node_modules
npm install
```

### Port 3030 already in use

```bash
# Use another port
PORT=3040 npm start
```

## 📖 Next Steps

1. **Explore the Dashboard** - http://localhost:3001
2. **Read the API documentation** - [API.md](../../API.md)
3. **Configure Alerts** - Create custom alerts
4. **Test in production** - Instrument your real application

## 🤝 Contributing

Suggestions to improve this demo? Open an [issue](https://github.com/FranciscoHonorat/hermes-observability/issues)!

---

**Developed with ❤️ by Francisco Honorat**
