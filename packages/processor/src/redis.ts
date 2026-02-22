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
    logger.info('Redis conectado');
});

redis.on('error', (err) => {
    logger.error('Redis error', err);
});

// Função para criar o grupo de consumidores
export async function criarGrupoConsumidor() {
    try {
        await redis.xgroup(
            'CREATE',
            REDIS_METRICS_STREAM,
            config.processor.consumerGroup,
            '0',
            'MKSTREAM'
        );
        logger.info('Grupo de consumidores criado', { group: config.processor.consumerGroup });
    } catch (error: any) {
        if (error.message.includes('BUSYGROUP')) {
            logger.info('Grupo de consumidores já existe');
        } else {
            throw error;
        }
    }
}