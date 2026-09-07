import dotenv from 'dotenv';

dotenv.config();

const isProduction = process.env.NODE_ENV === 'production';

// Comma-separated list of API keys that instrumented applications may send
// as the `x-api-key` header. Required in production; if unset in dev, the
// Collector accepts requests unauthenticated (with a startup warning).
const apiKeys = (process.env.COLLECTOR_API_KEYS || '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);

if (isProduction && apiKeys.length === 0) {
    throw new Error('Missing required environment variable: COLLECTOR_API_KEYS');
}

export const config = {
    port: parseInt(process.env.COLLECTOR_PORT || '4318', 10),
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10)
    },
    maxBatchSize: parseInt(process.env.MAX_BATCH_SIZE || '1000', 10),
    environment: process.env.NODE_ENV || 'development',
    auth: {
        apiKeys
    },
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
        max: parseInt(process.env.RATE_LIMIT_MAX || '120', 10)
    }
};
