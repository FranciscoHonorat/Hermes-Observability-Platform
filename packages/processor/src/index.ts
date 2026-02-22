import { Logger } from '@hermes/shared';
import { testConnection, closePool } from './database';
import { redis, criarGrupoConsumidor } from './redis';
import { processMetrics } from './metricsProcessor';
import { startAlertEngine } from './alertEngine';

const logger = new Logger('Processor');

async function main() {
    logger.info('Iniciando Hermes Processor...');

    try {
        // 1. Testar conexão com o banco de dados
        const dbConnected = await testConnection();
        if (!dbConnected) {
            throw new Error('Falha ao conectar no banco de dados');
        }

        // 2. Criar grupo de consumidores no Redis
        await criarGrupoConsumidor();

        // 3. Iniciar processamento de métricas
        logger.info('Iniciando processamento de métricas...');
        processMetrics().catch(err => {
            logger.error('Erro fatal no processamento de métricas:', err);
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

process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', { reason, promise });
});

// Iniciar aplicação
main();
