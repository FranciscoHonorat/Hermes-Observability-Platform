import { Router, Request, Response, NextFunction } from 'express';
import { LogBatch, Logger, validateLogEntry } from '@hermes/shared';
import { addLogToStream } from '../redis';
import { config } from '../config';

const router = Router();
const logger = new Logger('LogsRoute');

// POST /api/v1/logs - Receber logs
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const batch: LogBatch = req.body;

        // Validar formato do batch
        if (!batch.logs || !Array.isArray(batch.logs)) {
            return res.status(400).json({
                error: 'Invalid batch format',
                message: 'Expected { logs: [...] }'
            });
        }

        // Validar tamanho do batch
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

        // Processar cada log
        for (let i = 0; i < batch.logs.length; i++) {
            const entry = batch.logs[i];

            try {
                // Validar log
                validateLogEntry(entry);

                // tenantId is always overwritten here, never trusted from
                // the client. See docs/adr/0002-*.md.
                entry.tenantId = req.tenantId;

                // Adicionar ao Redis Stream
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

        // Retornar resultado
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

// GET /api/v1/logs/health - Health check específico de logs
router.get('/health', (req: Request, res: Response) => {
    res.json({
        status: 'ok',
        endpoint: '/api/v1/logs',
        maxBatchSize: config.maxBatchSize
    });
});

export { router as logsRouter };
