
const express = require('express');
const { createAgent, increment, gauge, histogram } = require('@hermes/agent');


const agent = createAgent();
agent.start();

console.log('Hermes Agent initialized');
console.log('Sending metrics to collector...');


const app = express();
app.use(express.json());

let users = [];
let orders = [];
let products = [
  { id: 1, name: 'Laptop', price: 999.99 },
  { id: 2, name: 'Mouse', price: 29.99 },
  { id: 3, name: 'Keyboard', price: 79.99 }
];


app.use((req, res, next) => {
  const start = Date.now();
  
  increment('http_requests_total', 1, {
    method: req.method,
    path: req.path
  });
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    histogram('http_request_duration_ms', duration, undefined, {
      method: req.method,
      path: req.path,
      status: res.statusCode.toString()
    });
    
    if (res.statusCode >= 400) {
      increment('http_errors_total', 1, {
        method: req.method,
        path: req.path,
        status: res.statusCode.toString()
      });
    }
  });
  
  next();
});


app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

app.get('/api/products', (req, res) => {
  const delay = Math.random() * 150 + 50;
  
  setTimeout(() => {
    increment('products_listed_total', 1);
    res.json(products);
  }, delay);
});

app.post('/api/users', (req, res) => {
  const { name, email } = req.body;
  
  if (!name || !email) {
    increment('user_creation_failed_total', 1, { reason: 'validation_error' });
    return res.status(400).json({ error: 'Name and email are required' });
  }
  
  const user = {
    id: users.length + 1,
    name,
    email,
    createdAt: new Date()
  };
  
  users.push(user);
  
  increment('users_created_total', 1);
  gauge('total_users', users.length, undefined, { status: 'active' });
  
  res.status(201).json(user);
});

app.post('/api/orders', (req, res) => {
  const { userId, productId, quantity = 1 } = req.body;
  
  if (!userId || !productId) {
    increment('order_creation_failed_total', 1, { reason: 'validation_error' });
    return res.status(400).json({ error: 'userId and productId are required' });
  }
  
  const product = products.find(p => p.id === parseInt(productId));
  if (!product) {
    increment('order_creation_failed_total', 1, { reason: 'product_not_found' });
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
  
  increment('orders_created_total', 1, {
    product: product.name,
    value_range: totalValue > 500 ? 'high' : 'low'
  });
  
  gauge('order_value_usd', totalValue, undefined, {
    product: product.name
  });
  
  histogram('order_quantity', quantity, undefined, {
    product: product.name
  });
  
  gauge('total_orders', orders.length);
  
  const gmv = orders.reduce((sum, o) => sum + o.totalValue, 0);
  gauge('total_gmv_usd', gmv);
  
  res.status(201).json(order);
});

app.get('/api/error', (req, res) => {
  increment('forced_errors_total', 1, { type: '500' });
  res.status(500).json({ error: 'Simulated server error' });
});

app.get('/api/slow', async (req, res) => {
  increment('slow_endpoint_calls_total', 1);
  
  const start = Date.now();
  
  const delay = Math.random() * 3000 + 2000;
  await new Promise(resolve => setTimeout(resolve, delay));
  
  const duration = Date.now() - start;
  histogram('slow_operation_duration_ms', duration);
  
  res.json({ 
    message: 'Slow operation completed',
    duration_ms: duration
  });
});

app.get('/api/stats', (req, res) => {
  const gmv = orders.reduce((sum, o) => sum + o.totalValue, 0);
  const avgOrderValue = orders.length > 0 ? gmv / orders.length : 0;
  
  const stats = {
    total_users: users.length,
    total_orders: orders.length,
    total_gmv: gmv,
    avg_order_value: avgOrderValue
  };
  
  gauge('stats_users', stats.total_users);
  gauge('stats_orders', stats.total_orders);
  gauge('stats_gmv', stats.total_gmv);
  gauge('stats_avg_order_value', stats.avg_order_value);
  
  res.json(stats);
});

app.use((err, req, res, next) => {
  console.error('Error:', err.message);
  
  increment('unhandled_errors_total', 1, {
    path: req.path
  });
  
  res.status(500).json({ 
    error: 'Internal Server Error',
    message: err.message 
  });
});


let trafficSimulatorInterval = null;

function startTrafficSimulator() {
  console.log('Starting traffic simulator...');
  
  trafficSimulatorInterval = setInterval(() => {
    const endpoints = [
      { method: 'GET', path: '/api/products', weight: 40 },
      { method: 'POST', path: '/api/users', weight: 10 },
      { method: 'POST', path: '/api/orders', weight: 30 },
      { method: 'GET', path: '/api/stats', weight: 15 },
      { method: 'GET', path: '/api/error', weight: 5 }
    ];
    
    const random = Math.random() * 100;
    let cumulative = 0;
    
    for (const endpoint of endpoints) {
      cumulative += endpoint.weight;
      if (random <= cumulative) {
        increment('simulated_traffic', 1, {
          method: endpoint.method,
          path: endpoint.path
        });
        break;
      }
    }
    
    const activeUsers = Math.floor(Math.random() * 200) + 50;
    gauge('active_users_count', activeUsers);
    
  }, 2000);
}

function stopTrafficSimulator() {
  if (trafficSimulatorInterval) {
    clearInterval(trafficSimulatorInterval);
    console.log('Traffic simulator stopped');
  }
}

app.post('/api/simulator/start', (req, res) => {
  startTrafficSimulator();
  res.json({ message: 'Traffic simulator started' });
});

app.post('/api/simulator/stop', (req, res) => {
  stopTrafficSimulator();
  res.json({ message: 'Traffic simulator stopped' });
});


const PORT = process.env.PORT || 3333;

const server = app.listen(PORT, () => {
  console.log('');
  console.log('='.repeat(80));
  console.log('Hermes Demo App is running!');
  console.log('='.repeat(80));
  console.log('');
  console.log(`Server:          http://localhost:${PORT}`);
  console.log(`Health Check:    http://localhost:${PORT}/health`);
  console.log(`API Endpoints:`);
  console.log(`   GET  /api/products       - List products`);
  console.log(`   POST /api/users          - Create user`);
  console.log(`   POST /api/orders         - Create order`);
  console.log(`   GET  /api/stats          - View statistics`);
  console.log(`   GET  /api/slow           - Slow endpoint (2-5s)`);
  console.log(`   GET  /api/error          - Simulate error`);
  console.log('');
  console.log(`Traffic Simulator:`);
  console.log(`   POST /api/simulator/start - Start traffic simulation`);
  console.log(`   POST /api/simulator/stop  - Stop traffic simulation`);
  console.log('');
  console.log(`Metrics are being sent to: http://localhost:4000/metrics`);
  console.log(`View dashboard at:         http://localhost:3001`);
  console.log('');
  console.log('='.repeat(80));
  console.log('');
  console.log('TIP: Try these commands in another terminal:');
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

process.on('SIGINT', () => {
  console.log('');
  console.log('Shutting down gracefully...');
  stopTrafficSimulator();
  process.exit(0);
});
