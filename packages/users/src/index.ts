import { Logger } from '@hermes/shared';
import { createServer } from './server';
import { testConnection, closePool } from './database';
import { config } from './config';

const logger = new Logger('Users');

async function main() {
    try {
        logger.info('Starting Hermes Users...', { environment: config.environment, port: config.port });

        const dbConnected = await testConnection();
        if (!dbConnected) {
            throw new Error('Failed to connect to database');
        }

        const app = createServer();
        const server = app.listen(config.port, () => {
            logger.info(`Users API listening on port ${config.port}`);
        });

        server.on('error', (error: any) => {
            logger.error('Server error:', error);
            process.exit(1);
        });

    } catch (error: any) {
        logger.error('Failed to start Users API:', error);
        process.exit(1);
    }
}

async function shutdown(signal: string) {
    logger.info(`${signal} received, shutting down gracefully...`);
    try {
        await closePool();
        process.exit(0);
    } catch (error: any) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
    }
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

main();
