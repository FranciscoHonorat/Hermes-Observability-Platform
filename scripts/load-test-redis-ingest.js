const Redis = require('ioredis');

const redis = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10)
});

const STREAM = 'hermes:metrics:stream';
const N = parseInt(process.argv[2] || '10000', 10);

async function main() {
    const before = await redis.xlen(STREAM);

    console.time(`Ingest ${N} metrics`);
    for (let i = 0; i < N; i++) {
        const metric = {
            name: 'http.requests.total',
            type: 'counter',
            value: 1,
            unit: 'count',
            timestamp: Date.now(),
            labels: { i: String(i) },
            metadata: { service: 'load-test' }
        };
        await redis.xadd(STREAM, '*', 'data', JSON.stringify(metric));
    }
    console.timeEnd(`Ingest ${N} metrics`);

    const after = await redis.xlen(STREAM);
    console.log(`Stream length: ${before} -> ${after} (+${after - before})`);
    console.log('Compare against the Processor\'s logs / XLEN over the next few seconds to see drain rate.');

    await redis.quit();
}

main().catch((error) => {
    console.error('Failed:', error.message);
    process.exit(1);
});
