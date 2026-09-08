// Fresh-timestamp HTTP ingestion throughput test.
// Unlike `ab -p file.json` (which replays one static body — and, thanks to
// the metrics table's (time, app_name, metric_name) primary key with
// ON CONFLICT DO UPDATE, ends up upserting the same one or two rows over
// and over instead of exercising a real insert workload), this stamps a
// fresh Date.now() timestamp on every batch so each message lands on its
// own distinct row, like real traffic would.
//
// Usage: node scripts/load-test-http-ingest.js [totalBatches] [concurrency]
// See docs/LOAD_TESTING.md (Phase 2.1, corrected).
const http = require('http');

const COLLECTOR_HOST = process.env.COLLECTOR_HOST || 'localhost';
const COLLECTOR_PORT = parseInt(process.env.COLLECTOR_PORT || '4000', 10);
const TOTAL = parseInt(process.argv[2] || '2000', 10);
const CONCURRENCY = parseInt(process.argv[3] || '20', 10);

function sendBatch(i) {
    return new Promise((resolve) => {
        const now = Date.now();
        const body = JSON.stringify({
            metrics: [
                {
                    name: 'http.requests.total', type: 'counter', value: 1, unit: 'count',
                    timestamp: now, labels: { method: 'GET', status: '200', seq: String(i) },
                    metadata: { service: 'load-test-http', environment: 'test' }
                },
                {
                    name: 'http.request.duration', type: 'histogram', value: 40 + Math.random() * 20, unit: 'milliseconds',
                    timestamp: now, labels: { method: 'GET', seq: String(i) },
                    metadata: { service: 'load-test-http', environment: 'test' }
                }
            ]
        });

        const req = http.request({
            hostname: COLLECTOR_HOST,
            port: COLLECTOR_PORT,
            path: '/api/v1/metrics',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
                ...(process.env.HERMES_API_KEY ? { 'x-api-key': process.env.HERMES_API_KEY } : {})
            }
        }, (res) => {
            res.resume();
            res.on('end', () => resolve(res.statusCode));
        });
        req.on('error', () => resolve(0));
        req.write(body);
        req.end();
    });
}

async function worker(state) {
    while (state.next < TOTAL) {
        const i = state.next++;
        const status = await sendBatch(i);
        if (status === 202) state.ok++; else state.fail++;
    }
}

async function main() {
    const state = { next: 0, ok: 0, fail: 0 };
    const start = Date.now();

    await Promise.all(Array.from({ length: CONCURRENCY }, () => worker(state)));

    const elapsedSec = (Date.now() - start) / 1000;
    const metricsSent = state.ok * 2; // 2 metrics/batch
    console.log(`Sent ${TOTAL} batches (${CONCURRENCY} concurrent), ${state.ok} accepted, ${state.fail} failed`);
    console.log(`Elapsed: ${elapsedSec.toFixed(2)}s`);
    console.log(`Throughput: ${(state.ok / elapsedSec).toFixed(1)} batches/s = ${(metricsSent / elapsedSec).toFixed(1)} metrics/s`);
    console.log(`app_name for querying results: load-test-http`);
}

main().catch((err) => {
    console.error('Failed:', err.message);
    process.exit(1);
});
