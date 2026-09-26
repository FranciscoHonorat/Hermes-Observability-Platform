import Redis from 'ioredis';
import { Logger, REDIS_API_KEYS_HASH } from '@hermes/shared';
import { config } from './config';

const logger = new Logger('Redis');

export const API_KEYS_HASH = REDIS_API_KEYS_HASH;

export const redis = new Redis({
    host: config.redis.host,
    port: config.redis.port,
    retryStrategy(times) {
        return Math.min(times * 50, 2000);
    }
});

redis.on('error', (err) => {
    logger.error('Redis error:', err);
});

export async function cacheApiKey(keyHash: string, tenantId: number): Promise<void> {
    await redis.hset(API_KEYS_HASH, keyHash, String(tenantId));
}

export async function uncacheApiKey(keyHash: string): Promise<void> {
    await redis.hdel(API_KEYS_HASH, keyHash);
}
