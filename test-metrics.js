// Test script to send metrics to Hermes Observability Platform
const http = require('http');

const COLLECTOR_URL = 'localhost';
const COLLECTOR_PORT = 4000;

// Function to send a metric
function sendMetric(metric) {
    return new Promise((resolve, reject) => {
        const data = JSON.stringify(metric);
        
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
                if (res.statusCode === 200 || res.statusCode === 201) {
                    console.log(`✅ Metrics batch sent successfully!`);
                    console.log(`   Response: ${responseData}`);
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

// Generate test metrics
async function runTest() {
    console.log('🚀 Starting Hermes Observability Test\n');
    
    const metrics = [
        {
            name: 'cpu_usage_percent',
            type: 'gauge',
            value: 45.5,
            timestamp: Date.now(),
            labels: {
                service: 'test-app',
                environment: 'production',
                host: 'server-01'
            }
        },
        {
            name: 'memory_usage_percent',
            type: 'gauge',
            value: 68.2,
            timestamp: Date.now(),
            labels: {
                service: 'test-app',
                environment: 'production',
                host: 'server-01'
            }
        },
        {
            name: 'http_requests_total',
            type: 'counter',
            value: 150,
            timestamp: Date.now(),
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
            value: 125.5,
            timestamp: Date.now(),
            labels: {
                service: 'test-app',
                environment: 'production',
                endpoint: '/api/users'
            }
        },
        {
            name: 'event_loop_lag_ms',
            type: 'gauge',
            value: 8.5,
            timestamp: Date.now(),
            labels: {
                service: 'test-app',
                environment: 'production'
            }
        }
    ];

    console.log(`📊 Sending ${metrics.length} test metrics in batch...\n`);
    
    try {
        // Send all metrics in a single batch
        await sendMetric({ metrics });
    } catch (error) {
        console.error(`Failed to send metrics batch`);
    }

    console.log('\n✨ Test completed!');
    console.log('\n📍 Next steps:');
    console.log('1. Wait a few seconds for metrics to be processed');
    console.log('2. Check API: http://localhost:3000/api/v1/metrics/names');
    console.log('3. View dashboard: http://localhost:3001');
    console.log('4. Query metrics: http://localhost:3000/api/v1/metrics/query?name=cpu.usage');
}

// Run the test
runTest().catch(console.error);
