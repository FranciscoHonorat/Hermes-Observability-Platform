import { Router, Request, Response, NextFunction } from 'express';
import { MetricBatch, Logger, validateMetric } from '@hermes/shared';
import { addMetricToStream } from '../redis';
import { config } from '../config';

const router = Router();
const logger = new Logger('MetricsRoute');

// POST /api/v1/metrics - Receber métricas
router.post('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const batch: MetricBatch = req.body;

        // Validar formato do batch
        if (!batch.metrics || !Array.isArray(batch.metrics)) {
            return res.status(400).json({ 
                error: 'Invalid batch format',
                message: 'Expected { metrics: [...] }' 
            });
        }

        // Validar tamanho do batch
        if (batch.metrics.length > config.maxBatchSize) {
            return res.status(400).json({ 
                error: 'Batch too large',
                message: `Maximum ${config.maxBatchSize} metrics per batch`,
                received: batch.metrics.length
            });
        }

        logger.info(`Received batch with ${batch.metrics.length} metrics`);

        let accepted = 0;
        let rejected = 0;
        const errors: string[] = [];

        // Processar cada métrica
        for (let i = 0; i < batch.metrics.length; i++) {
            const metric = batch.metrics[i];
            
            try {
                // Validar métrica
                validateMetric(metric);

                // Adicionar ao Redis Stream
                await addMetricToStream(metric);
                accepted++;

                logger.debug(`Metric queued: ${metric.name}`, {
                    type: metric.type,
                    value: metric.value,
                    service: metric.metadata?.service
                });

            } catch (error: any) {
                rejected++;
                const errorMsg = `Metric ${i}: ${error.message}`;
                errors.push(errorMsg);
                logger.warn(errorMsg, { metric });
            }
        }

        logger.info(`Batch processed: ${accepted} accepted, ${rejected} rejected`);

        // Retornar resultado
        const response: any = {
            accepted,
            rejected,
            total: batch.metrics.length,
            message: 'Metrics queued for processing'
        };

        if (errors.length > 0 && errors.length <= 10) {
            response.errors = errors;
        } else if (errors.length > 10) {
            response.errors = errors.slice(0, 10);
            response.moreErrors = errors.length - 10;
        }

        res.status(202).json(response);

    } catch (error: any) {
        logger.error('Error processing metrics batch:', error);
        next(error);
    }
});

// GET /api/v1/metrics/health - Health check específico de métricas
router.get('/health', (req: Request, res: Response) => {
    res.json({ 
        status: 'ok',
        endpoint: '/api/v1/metrics',
        maxBatchSize: config.maxBatchSize
    });
});

export { router as metricsRouter };
