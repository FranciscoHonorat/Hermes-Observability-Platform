import { Logger } from '@hermes/shared';
import { createServer } from './server';
import { redis, testRedisConnection } from './redis';
import { config } from './config';

const logger = new Logger('Collector');

async function main() {
    try {
        logger.info('Starting Hermes Collector...', {
            environment: config.environment,
            port: config.port
        });

        // Testar conexão com Redis
        const redisConnected = await testRedisConnection();
        if (!redisConnected) {
            throw new Error('Failed to connect to Redis');
        }

        // Criar e iniciar servidor HTTP
        const app = createServer();
        
        const server = app.listen(config.port, () => {
            logger.info(`Collector listening on port ${config.port}`);
            logger.info(`HTTP endpoint: http://localhost:${config.port}/api/v1/metrics`);
            logger.info(`Health check: http://localhost:${config.port}/health`);
        });

        // Tratamento de erros do servidor
        server.on('error', (error: any) => {
            if (error.code === 'EADDRINUSE') {
                logger.error(`Port ${config.port} is already in use`);
            } else {
                logger.error('Server error:', error);
            }
            process.exit(1);
        });

    } catch (error: any) {
        logger.error('Failed to start collector:', error);
        process.exit(1);
    }
}

// Graceful shutdown
async function shutdown(signal: string) {
    logger.info(`${signal} received, shutting down gracefully...`);
    
    try {
        // Fechar conexão Redis
        await redis.quit();
        logger.info('Redis connection closed');
        
        logger.info('Shutdown complete');
        process.exit(0);
    } catch (error: any) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
    }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

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
