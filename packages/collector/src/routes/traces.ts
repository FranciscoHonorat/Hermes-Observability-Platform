import { Router, Request, Response, NextFunction } from 'express';
import { SpanBatch, Logger, validateSpan } from '@hermes/shared';
import { addSpanToStream } from '../redis';
import { config } from '../config';

const router = Router();
const logger = new Logger('TracesRoute');

// POST /api/v1/traces - Receber spans
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const batch: SpanBatch = req.body;

        // Validar formato do batch
        if (!batch.spans || !Array.isArray(batch.spans)) {
            return res.status(400).json({
                error: 'Invalid batch format',
                message: 'Expected { spans: [...] }'
            });
        }

        // Validar tamanho do batch
        if (batch.spans.length > config.maxBatchSize) {
            return res.status(400).json({
                error: 'Batch too large',
                message: `Maximum ${config.maxBatchSize} spans per batch`,
                received: batch.spans.length
            });
        }

        logger.info(`Received batch with ${batch.spans.length} spans`);

        let accepted = 0;
        let rejected = 0;
        const errors: string[] = [];

        // Processar cada span
        for (let i = 0; i < batch.spans.length; i++) {
            const span = batch.spans[i];

            try {
                // Validar span
                validateSpan(span);

                // Adicionar ao Redis Stream
                await addSpanToStream(span);
                accepted++;

                logger.debug(`Span queued: ${span.operationName}`, {
                    traceId: span.traceId,
                    spanId: span.spanId,
                    service: span.serviceName
                });

            } catch (error: any) {
                rejected++;
                const errorMsg = `Span ${i}: ${error.message}`;
                errors.push(errorMsg);
                logger.warn(errorMsg, { span });
            }
        }

        logger.info(`Batch processed: ${accepted} accepted, ${rejected} rejected`);

        // Retornar resultado
        const response: any = {
            accepted,
            rejected,
            total: batch.spans.length,
            message: 'Spans queued for processing'
        };

        if (errors.length > 0 && errors.length <= 10) {
            response.errors = errors;
        } else if (errors.length > 10) {
            response.errors = errors.slice(0, 10);
            response.moreErrors = errors.length - 10;
        }

        res.status(202).json(response);

    } catch (error: any) {
        logger.error('Error processing spans batch:', error);
        next(error);
    }
});

// GET /api/v1/traces/health - Health check específico de traces
router.get('/health', (req: Request, res: Response) => {
    res.json({
        status: 'ok',
        endpoint: '/api/v1/traces',
        maxBatchSize: config.maxBatchSize
    });
});

export { router as tracesRouter };
