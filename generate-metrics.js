// Continuous metrics generator for Hermes Observability Platform
const http = require('http');

const COLLECTOR_URL = 'localhost';
const COLLECTOR_PORT = 4000;
const INTERVAL_MS = 5000; // Send metrics every 5 seconds

// Function to send a metric batch
function sendMetrics(metrics) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify({ metrics });
        
        const options = {
            hostname: COLLECTOR_URL,
            port: COLLECTOR_PORT,
            path: '/api/v1/metrics',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': data.length
            }
        };

        const req = http.request(options, (res) => {
            let responseData = '';
            
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            
            res.on('end', () => {
                if (res.statusCode === 200 || res.statusCode === 202) {
                    console.log(`✅ [${new Date().toLocaleTimeString()}] Batch sent successfully`);
                    resolve(responseData);
                } else {
                    console.error(`❌ Error: ${res.statusCode} - ${responseData}`);
                    reject(new Error(`Status ${res.statusCode}`));
                }
            });
        });

        req.on('error', (error) => {
            console.error(`❌ Request failed: ${error.message}`);
            reject(error);
        });

        req.write(data);
        req.end();
    });
}

// Generate realistic varying metrics
function generateMetrics() {
    const now = Date.now();
    const randomVariation = () => 0.8 + Math.random() * 0.4; // 80% to 120% variation
    
    return [
        {
            name: 'cpu_usage_percent',
            type: 'gauge',
            value: 35 + Math.random() * 30, // 35-65%
            timestamp: now,
            labels: {
                service: 'test-app',
                environment: 'production',
                host: 'server-01'
            }
        },
        {
            name: 'memory_usage_percent',
            type: 'gauge',
            value: 60 + Math.random() * 20, // 60-80%
            timestamp: now,
            labels: {
                service: 'test-app',
                environment: 'production',
                host: 'server-01'
            }
        },
        {
            name: 'http_requests_total',
            type: 'counter',
            value: Math.floor(100 + Math.random() * 200), // 100-300 requests
            timestamp: now,
            labels: {
                service: 'test-app',
                environment: 'production',
                method: 'GET',
                status: '200'
            }
        },
        {
            name: 'http_request_duration_ms',
            type: 'histogram',
            value: 50 + Math.random() * 150, // 50-200ms
            timestamp: now,
            labels: {
                service: 'test-app',
                environment: 'production',
                endpoint: '/api/users'
            }
        },
        {
            name: 'event_loop_lag_ms',
            type: 'gauge',
            value: 2 + Math.random() * 10, // 2-12ms
            timestamp: now,
            labels: {
                service: 'test-app',
                environment: 'production'
            }
        }
    ];
}

// Main loop
let iteration = 0;
async function run() {
    console.log('🚀 Starting Hermes Continuous Metrics Generator');
    console.log(`📊 Sending metrics every ${INTERVAL_MS/1000} seconds`);
    console.log('Press Ctrl+C to stop\n');
    
    while (true) {
        try {
            iteration++;
            const metrics = generateMetrics();
            await sendMetrics(metrics);
            console.log(`   Iteration ${iteration} - ${metrics.length} metrics sent`);
        } catch (error) {
            console.error(`Failed to send metrics: ${error.message}`);
        }
        
        // Wait before next iteration
        await new Promise(resolve => setTimeout(resolve, INTERVAL_MS));
    }
}

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    console.log('\n\n✨ Stopping metrics generator...');
    console.log(`📈 Total iterations: ${iteration}`);
    console.log('👋 Goodbye!');
    process.exit(0);
});

// Start the generator
run().catch(console.error);
