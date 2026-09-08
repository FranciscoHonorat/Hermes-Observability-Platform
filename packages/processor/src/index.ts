import { Logger, REDIS_METRICS_STREAM, REDIS_TRACES_STREAM } from '@hermes/shared';
import { testConnection, closePool } from './database';
import { redis, tracesRedis, criarGrupoConsumidor } from './redis';
import { processMetrics } from './metricsProcessor';
import { processSpans } from './spansProcessor';
import { startAlertEngine } from './alertEngine';
import { config } from './config';

const logger = new Logger('Processor');

async function main() {
    logger.info('Iniciando Hermes Processor...');

    try {
        // 1. Testar conexão com o banco de dados
        const dbConnected = await testConnection();
        if (!dbConnected) {
            throw new Error('Falha ao conectar no banco de dados');
        }

        // 2. Criar grupos de consumidores no Redis
        await criarGrupoConsumidor(REDIS_METRICS_STREAM, config.processor.consumerGroup);
        await criarGrupoConsumidor(REDIS_TRACES_STREAM, config.processor.tracesConsumerGroup);

        // 3. Iniciar processamento de métricas
        logger.info('Iniciando processamento de métricas...');
        processMetrics().catch(err => {
            logger.error('Erro fatal no processamento de métricas:', err);
            process.exit(1);
        });

        // 3b. Iniciar processamento de spans
        logger.info('Iniciando processamento de spans...');
        processSpans().catch(err => {
            logger.error('Erro fatal no processamento de spans:', err);
            process.exit(1);
        });

        // 4. Iniciar motor de alertas
        logger.info('Iniciando motor de alertas...');
        startAlertEngine().catch(err => {
            logger.error('Erro fatal no motor de alertas:', err);
            process.exit(1);
        });

        logger.info('Hermes Processor iniciado com sucesso!');

    } catch (error) {
        logger.error('Erro ao iniciar processor:', error);
        process.exit(1);
    }
}

// Tratamento de shutdown graceful
async function shutdown(signal: string) {
    logger.info(`${signal} recebido. Encerrando gracefully...`);
    
    try {
        await closePool();
        await redis.quit();
        await tracesRedis.quit();
        logger.info('Recursos liberados com sucesso');
        process.exit(0);
    } catch (error) {
        logger.error('Erro ao encerrar:', error);
        process.exit(1);
    }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// Tratamento de erros não capturados
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection:', { reason });
    shutdown('unhandledRejection');
});

// Iniciar aplicação
main();
