import { Logger } from '@hermes/shared';
import { createServer } from './server';
import { testConnection, closePool } from './database';
import { config } from './config';

const logger = new Logger('API');

async function main() {
    try {
        logger.info('Starting Hermes API...', {
            environment: config.environment,
            port: config.port
        });

        const dbConnected = await testConnection();
        if (!dbConnected) {
            throw new Error('Failed to connect to database');
        }

        const app = createServer();
        
        const server = app.listen(config.port, () => {
            logger.info(`API listening on port ${config.port}`);
            logger.info(`API URL: http://localhost:${config.port}`);
            logger.info(`Health check: http://localhost:${config.port}/health`);
            logger.info(`Documentation: http://localhost:${config.port}/`);
        });

        server.on('error', (error: any) => {
            if (error.code === 'EADDRINUSE') {
                logger.error(`Port ${config.port} is already in use`);
            } else {
                logger.error('Server error:', error);
            }
            process.exit(1);
        });

    } catch (error: any) {
        logger.error('Failed to start API:', error);
        process.exit(1);
    }
}

async function shutdown(signal: string) {
    logger.info(`${signal} received, shutting down gracefully...`);
    
    try {
        await closePool();
        
        logger.info('Shutdown complete');
        process.exit(0);
    } catch (error: any) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
    }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection:', { reason });
    shutdown('unhandledRejection');
});

main();
