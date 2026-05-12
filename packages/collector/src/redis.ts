import Redis from 'ioredis';
import { Logger, REDIS_METRICS_STREAM } from '@hermes/shared';
import { config } from './config';

const logger = new Logger('Redis');

// Configuração do Redis
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

// Função para verificar conexão
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

// Função para adicionar métrica ao stream
export async function addMetricToStream(metric: any): Promise<string> {
    const id = await redis.xadd(
        REDIS_METRICS_STREAM,
        '*',
        'data',
        JSON.stringify(metric)
    );
    return id || '';
}
