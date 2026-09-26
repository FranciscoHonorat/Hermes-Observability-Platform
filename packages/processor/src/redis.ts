import Redis from 'ioredis';
import { Logger, REDIS_METRICS_STREAM } from '@hermes/shared';
import { config } from './config';

const logger = new Logger('Redis');

function createConnection(label: string): Redis {
    const client = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        retryStrategy(times) {
            const delay = Math.min(times * 50, 2000);
            return delay;
        }
    });

    client.on('connect', () => logger.info(`Redis connected (${label})`));
    client.on('error', (err) => logger.error(`Redis error (${label})`, err));

    return client;
}

export const redis = createConnection('main');

export const tracesRedis = createConnection('traces');

export const logsRedis = createConnection('logs');

export async function createConsumerGroup(
    streamKey: string = REDIS_METRICS_STREAM,
    groupName: string = config.processor.consumerGroup
) {
    try {
        await redis.xgroup(
            'CREATE',
            streamKey,
            groupName,
            '0',
            'MKSTREAM'
        );
        logger.info('Consumer group created', { stream: streamKey, group: groupName });
    } catch (error: any) {
        if (error.message.includes('BUSYGROUP')) {
            logger.info('Consumer group already exists', { stream: streamKey, group: groupName });
        } else {
            throw error;
        }
    }
}
