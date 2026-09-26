import Redis from 'ioredis';
import { Logger, REDIS_METRICS_STREAM, REDIS_TRACES_STREAM, REDIS_LOGS_STREAM, REDIS_API_KEYS_HASH } from '@hermes/shared';
import { config } from './config';

const logger = new Logger('Redis');

export const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
    }
});

redis.on('connect', () => {
    logger.info('Redis connected', {
        host: config.redis.host,
        port: config.redis.port
    });
});

redis.on('error', (err) => {
    logger.error('Redis error:', err);
});

redis.on('close', () => {
    logger.warn('Redis connection closed');
});

export async function testRedisConnection(): Promise<boolean> {
    try {
        await redis.ping();
        logger.info('Redis connection test: OK');
        return true;
    } catch (error) {
        logger.error('Redis connection test failed:', error);
        return false;
    }
}

export async function addMetricToStream(metric: any): Promise<string> {
    const id = await redis.xadd(
        REDIS_METRICS_STREAM,
        '*',
        'data',
        JSON.stringify(metric)
    );
    return id || '';
}

export async function addSpanToStream(span: any): Promise<string> {
    const id = await redis.xadd(
        REDIS_TRACES_STREAM,
        '*',
        'data',
        JSON.stringify(span)
    );
    return id || '';
}

export async function lookupTenantForApiKey(keyHash: string): Promise<number | null> {
    const tenantId = await redis.hget(REDIS_API_KEYS_HASH, keyHash);
    return tenantId ? Number(tenantId) : null;
}

export async function addLogToStream(log: any): Promise<string> {
    const id = await redis.xadd(
        REDIS_LOGS_STREAM,
        '*',
        'data',
        JSON.stringify(log)
    );
    return id || '';
}
