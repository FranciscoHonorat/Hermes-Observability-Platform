/**
 * Hermes Observability - Demo Application
 * 
 * This application demonstrates how to instrument a Node.js/Express
 * application with the Hermes Agent SDK to collect automatic and custom metrics.
 */

const express = require('express');
const { HermesAgent } = require('@hermes/agent');

// =============================================================================
// 1. INITIALIZE HERMES AGENT
// =============================================================================

const agent = HermesAgent.init({
  appName: 'demo-ecommerce',
  collectorUrl: 'http://localhost:4000/metrics',
  labels: {
    environment: 'development',
    service: 'api',
    version: '1.0.0',
    datacenter: 'us-east-1'
  },
  flushInterval: 5000  // Send metrics every 5 seconds
});

console.log('✅ Hermes Agent initialized');
console.log('📊 Sending metrics to: http://localhost:4000/metrics');
console.log('🏷️  App Name: demo-ecommerce');

// =============================================================================
// 2. CREATE EXPRESS APPLICATION
// =============================================================================

const app = express();
app.use(express.json());

// In-memory database simulation
let users = [];
let orders = [];
let products = [
  { id: 1, name: 'Laptop', price: 999.99 },
  { id: 2, name: 'Mouse', price: 29.99 },
  { id: 3, name: 'Keyboard', price: 79.99 }
];

// =============================================================================
// 3. MIDDLEWARE FOR HTTP REQUEST TRACKING
// =============================================================================

app.use((req, res, next) => {
  const start = Date.now();
  
  // Increment request counter
  agent.counter('http_requests_total', {
    method: req.method,
    path: req.path
  }).inc();
  
  // When response finishes, record metrics
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    // Record request duration (histogram)
    agent.histogram('http_request_duration_ms', {
      method: req.method,
      path: req.path,
      status: res.statusCode.toString()
    }).observe(duration);
    
    // Count errors (4xx, 5xx)
    if (res.statusCode >= 400) {
      agent.counter('http_errors_total', {
        method: req.method,
        path: req.path,
        status: res.statusCode.toString()
      }).inc();
    }
  });
  
  next();
});

// =============================================================================
// 4. API ENDPOINTS
// =============================================================================

// Health check
app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// List products
app.get('/api/products', (req, res) => {
  // Simulate variable latency (50-200ms)
  const delay = Math.random() * 150 + 50;
  
  setTimeout(() => {
    agent.counter('products_listed_total').inc();
    res.json(products);
  }, delay);
});

// Create user
app.post('/api/users', (req, res) => {
  const { name, email } = req.body;
  
  if (!name || !email) {
    agent.counter('user_creation_failed_total', { reason: 'validation_error' }).inc();
    return res.status(400).json({ error: 'Name and email are required' });
  }
  
  const user = {
    id: users.length + 1,
    name,
    email,
    createdAt: new Date()
  };
  
  users.push(user);
  
  // Business metrics
  agent.counter('users_created_total').inc();
  agent.gauge('total_users', { status: 'active' }).set(users.length);
  
  res.status(201).json(user);
});

// Create order
app.post('/api/orders', (req, res) => {
  const { userId, productId, quantity = 1 } = req.body;
  
  // Validations
  if (!userId || !productId) {
    agent.counter('order_creation_failed_total', { reason: 'validation_error' }).inc();
    return res.status(400).json({ error: 'userId and productId are required' });
  }
  
  const product = products.find(p => p.id === parseInt(productId));
  if (!product) {
    agent.counter('order_creation_failed_total', { reason: 'product_not_found' }).inc();
    return res.status(404).json({ error: 'Product not found' });
  }
  
  const totalValue = product.price * quantity;
  
  const order = {
    id: orders.length + 1,
    userId,
    productId,
    quantity,
    totalValue,
    createdAt: new Date()
  };
  
  orders.push(order);
  
  // Detailed business metrics
  agent.counter('orders_created_total', {
    product: product.name,
    value_range: totalValue > 500 ? 'high' : 'low'
  }).inc();
  
  agent.gauge('order_value_usd', {
    product: product.name
  }).set(totalValue);
  
  agent.histogram('order_quantity', {
    product: product.name
  }).observe(quantity);
  
  agent.gauge('total_orders').set(orders.length);
  
  // Total GMV (Gross Merchandise Value)
  const gmv = orders.reduce((sum, o) => sum + o.totalValue, 0);
  agent.gauge('total_gmv_usd').set(gmv);
  
  res.status(201).json(order);
});

// Simulate 500 error
app.get('/api/error', (req, res) => {
  agent.counter('forced_errors_total', { type: '500' }).inc();
  
  // Simulate server error
  throw new Error('Simulated server error');
});

// Endpoint with high latency (simulates heavy operation)
app.get('/api/slow', async (req, res) => {
  agent.counter('slow_endpoint_calls_total').inc();
  
  const start = Date.now();
  
  // Simulate time-consuming operation (2-5 seconds)
  const delay = Math.random() * 3000 + 2000;
  await new Promise(resolve => setTimeout(resolve, delay));
  
  const duration = Date.now() - start;
  agent.histogram('slow_operation_duration_ms').observe(duration);
  
  res.json({ 
    message: 'Slow operation completed',
    duration_ms: duration
  });
});

// List statistics
app.get('/api/stats', (req, res) => {
  const gmv = orders.reduce((sum, o) => sum + o.totalValue, 0);
  const avgOrderValue = orders.length > 0 ? gmv / orders.length : 0;
  
  const stats = {
    total_users: users.length,
    total_orders: orders.length,
    total_gmv: gmv,
    avg_order_value: avgOrderValue
  };
  
  // Update gauges with statistics
  agent.gauge('stats_users').set(stats.total_users);
  agent.gauge('stats_orders').set(stats.total_orders);
  agent.gauge('stats_gmv').set(stats.total_gmv);
  agent.gauge('stats_avg_order_value').set(stats.avg_order_value);
  
  res.json(stats);
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  
  agent.counter('unhandled_errors_total', {
    path: req.path
  }).inc();
  
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: err.message 
  });
});

// =============================================================================
// 5. TRAFFIC SIMULATOR (OPTIONAL)
// =============================================================================

let trafficSimulatorInterval = null;

function startTrafficSimulator() {
  console.log('🚦 Starting traffic simulator...');
  
  trafficSimulatorInterval = setInterval(() => {
    // Simulate random requests
    const endpoints = [
      { method: 'GET', path: '/api/products', weight: 40 },
      { method: 'POST', path: '/api/users', weight: 10 },
      { method: 'POST', path: '/api/orders', weight: 30 },
      { method: 'GET', path: '/api/stats', weight: 15 },
      { method: 'GET', path: '/api/error', weight: 5 }
    ];
    
    // Choose random endpoint based on weights
    const random = Math.random() * 100;
    let cumulative = 0;
    
    for (const endpoint of endpoints) {
      cumulative += endpoint.weight;
      if (random <= cumulative) {
        // Simulate metric for this endpoint
        agent.counter('simulated_traffic', {
          method: endpoint.method,
          path: endpoint.path
        }).inc();
        break;
      }
    }
    
    // Update gauge with random number of active users
    const activeUsers = Math.floor(Math.random() * 200) + 50;
    agent.gauge('active_users_count').set(activeUsers);
    
  }, 2000); // Every 2 seconds
}

function stopTrafficSimulator() {
  if (trafficSimulatorInterval) {
    clearInterval(trafficSimulatorInterval);
    console.log('🛑 Traffic simulator stopped');
  }
}

// Endpoint to control simulator
app.post('/api/simulator/start', (req, res) => {
  startTrafficSimulator();
  res.json({ message: 'Traffic simulator started' });
});

app.post('/api/simulator/stop', (req, res) => {
  stopTrafficSimulator();
  res.json({ message: 'Traffic simulator stopped' });
});

// =============================================================================
// 6. START SERVER
// =============================================================================

const PORT = process.env.PORT || 3030;

app.listen(PORT, () => {
  console.log('');
  console.log('='.repeat(80));
  console.log('🚀 Hermes Demo App is running!');
  console.log('='.repeat(80));
  console.log('');
  console.log(`📍 Server:          http://localhost:${PORT}`);
  console.log(`🏥 Health Check:    http://localhost:${PORT}/health`);
  console.log(`📊 API Endpoints:`);
  console.log(`   GET  /api/products       - List products`);
  console.log(`   POST /api/users          - Create user`);
  console.log(`   POST /api/orders         - Create order`);
  console.log(`   GET  /api/stats          - View statistics`);
  console.log(`   GET  /api/slow           - Slow endpoint (2-5s)`);
  console.log(`   GET  /api/error          - Simulate error`);
  console.log('');
  console.log(`🚦 Traffic Simulator:`);
  console.log(`   POST /api/simulator/start - Start traffic simulation`);
  console.log(`   POST /api/simulator/stop  - Stop traffic simulation`);
  console.log('');
  console.log(`📈 Metrics are being sent to: http://localhost:4000/metrics`);
  console.log(`👀 View dashboard at:         http://localhost:3001`);
  console.log('');
  console.log('='.repeat(80));
  console.log('');
  console.log('💡 TIP: Try these commands in another terminal:');
  console.log('');
  console.log('   # Create a user');
  console.log('   curl -X POST http://localhost:3030/api/users \\');
  console.log('     -H "Content-Type: application/json" \\');
  console.log('     -d \'{"name":"John","email":"john@example.com"}\'');
  console.log('');
  console.log('   # Create an order');
  console.log('   curl -X POST http://localhost:3030/api/orders \\');
  console.log('     -H "Content-Type: application/json" \\');
  console.log('     -d \'{"userId":1,"productId":1,"quantity":2}\'');
  console.log('');
  console.log('   # Start traffic simulator');
  console.log('   curl -X POST http://localhost:3030/api/simulator/start');
  console.log('');
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('');
  console.log('👋 Shutting down gracefully...');
  stopTrafficSimulator();
  process.exit(0);
});
