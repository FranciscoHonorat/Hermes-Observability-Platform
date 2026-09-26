import { Router, Request, Response, NextFunction } from 'express';
import { LogBatch, Logger, validateLogEntry } from '@hermes/shared';
import { addLogToStream } from '../redis';
import { config } from '../config';

const router = Router();
const logger = new Logger('LogsRoute');

router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const batch: LogBatch = req.body;

        if (!batch.logs || !Array.isArray(batch.logs)) {
            return res.status(400).json({
                error: 'Invalid batch format',
                message: 'Expected { logs: [...] }'
            });
        }

        if (batch.logs.length > config.maxBatchSize) {
            return res.status(400).json({
                error: 'Batch too large',
                message: `Maximum ${config.maxBatchSize} logs per batch`,
                received: batch.logs.length
            });
        }

        logger.info(`Received batch with ${batch.logs.length} logs`);

        let accepted = 0;
        let rejected = 0;
        const errors: string[] = [];

        for (let i = 0; i < batch.logs.length; i++) {
            const entry = batch.logs[i];

            try {
                validateLogEntry(entry);

                entry.tenantId = req.tenantId;

                await addLogToStream(entry);
                accepted++;

                logger.debug(`Log queued: ${entry.level}`, {
                    service: entry.serviceName,
                    traceId: entry.traceId
                });

            } catch (error: any) {
                rejected++;
                const errorMsg = `Log ${i}: ${error.message}`;
                errors.push(errorMsg);
                logger.warn(errorMsg, { entry });
            }
        }

        logger.info(`Batch processed: ${accepted} accepted, ${rejected} rejected`);

        const response: any = {
            accepted,
            rejected,
            total: batch.logs.length,
            message: 'Logs queued for processing'
        };

        if (errors.length > 0 && errors.length <= 10) {
            response.errors = errors;
        } else if (errors.length > 10) {
            response.errors = errors.slice(0, 10);
            response.moreErrors = errors.length - 10;
        }

        res.status(202).json(response);

    } catch (error: any) {
        logger.error('Error processing logs batch:', error);
        next(error);
    }
});

router.get('/health', (req: Request, res: Response) => {
    res.json({
        status: 'ok',
        endpoint: '/api/v1/logs',
        maxBatchSize: config.maxBatchSize
    });
});

export { router as logsRouter };
