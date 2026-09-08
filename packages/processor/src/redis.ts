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

    client.on('connect', () => logger.info(`Redis conectado (${label})`));
    client.on('error', (err) => logger.error(`Redis error (${label})`, err));

    return client;
}

// Conexão principal: usada para XACK/comandos pontuais em ambos os
// consumers, e para o loop de métricas (que faz XREADGROUP...BLOCK nela).
export const redis = createConnection('main');

// Conexão dedicada para o loop de spans. XREADGROUP...BLOCK ocupa a conexão
// inteira até retornar — dois loops de blocking-read concorrentes numa
// única conexão ficam se atravancando (um só desbloqueia quando o BLOCK do
// outro estoura), inflando a latência de ambos em até blockTimeout a cada
// ciclo. Precisa de uma conexão própria por loop bloqueante.
export const tracesRedis = createConnection('traces');

// Função para criar um grupo de consumidores num stream específico
export async function criarGrupoConsumidor(
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
        logger.info('Grupo de consumidores criado', { stream: streamKey, group: groupName });
    } catch (error: any) {
        if (error.message.includes('BUSYGROUP')) {
            logger.info('Grupo de consumidores já existe', { stream: streamKey, group: groupName });
        } else {
            throw error;
        }
    }
}