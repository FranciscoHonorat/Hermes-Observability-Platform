import { Logger, REDIS_METRICS_STREAM, REDIS_TRACES_STREAM, REDIS_LOGS_STREAM } from '@hermes/shared';
import { testConnection, closePool } from './database';
import { redis, tracesRedis, logsRedis, createConsumerGroup } from './redis';
import { processMetrics } from './metricsProcessor';
import { processSpans } from './spansProcessor';
import { processLogs } from './logsProcessor';
import { startAlertEngine } from './alertEngine';
import { config } from './config';

const logger = new Logger('Processor');

async function main() {
    logger.info('Starting Hermes Processor...');

    try {
        const dbConnected = await testConnection();
        if (!dbConnected) {
            throw new Error('Failed to connect to database');
        }

        await createConsumerGroup(REDIS_METRICS_STREAM, config.processor.consumerGroup);
        await createConsumerGroup(REDIS_TRACES_STREAM, config.processor.tracesConsumerGroup);
        await createConsumerGroup(REDIS_LOGS_STREAM, config.processor.logsConsumerGroup);

        logger.info('Starting metrics processing...');
        processMetrics().catch(err => {
            logger.error('Fatal error in metrics processing:', err);
            process.exit(1);
        });

        logger.info('Starting spans processing...');
        processSpans().catch(err => {
            logger.error('Fatal error in spans processing:', err);
            process.exit(1);
        });

        logger.info('Starting logs processing...');
        processLogs().catch(err => {
            logger.error('Fatal error in logs processing:', err);
            process.exit(1);
        });

        logger.info('Starting alert engine...');
        startAlertEngine().catch(err => {
            logger.error('Fatal error in alert engine:', err);
            process.exit(1);
        });

        logger.info('Hermes Processor started successfully!');

    } catch (error) {
        logger.error('Error starting processor:', error);
        process.exit(1);
    }
}

async function shutdown(signal: string) {
    logger.info(`${signal} received. Shutting down gracefully...`);

    try {
        await closePool();
        await redis.quit();
        await tracesRedis.quit();
        await logsRedis.quit();
        logger.info('Resources released successfully');
        process.exit(0);
    } catch (error) {
        logger.error('Error during shutdown:', error);
        process.exit(1);
    }
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    shutdown('uncaughtException');
});

process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled Rejection:', { reason });
    shutdown('unhandledRejection');
});

main();
