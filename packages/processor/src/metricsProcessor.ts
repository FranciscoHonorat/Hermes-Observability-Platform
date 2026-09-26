import { Metric, Logger, validateMetric, REDIS_METRICS_STREAM } from '@hermes/shared';
import { pool } from './database';
import { redis } from './redis';
import { config } from './config';

const logger = new Logger('MetricsProcessor');

export async function processMetrics(): Promise<void> {
    logger.info('Metrics processor started');

    while (true) {
        try {
            const results = await redis.xreadgroup(
                'GROUP',
                config.processor.consumerGroup,
                config.processor.consumerName,
                'COUNT',
                config.processor.batchSize,
                'BLOCK',
                config.processor.blockTimeout,
                'STREAMS',
                REDIS_METRICS_STREAM,
                '>'
            );

            if (!results || results.length === 0) {
                continue;
            }

            const [streamKey, messages] = results[0] as [string, Array<[string, string[]]>];

            for (const [messageId, fields] of messages) {
                let metric: Metric | undefined;

                try {
                    const metricData = fields[1];
                    metric = JSON.parse(metricData);

                    validateMetric(metric);
                } catch (error: any) {
                    logger.warn(`Metric discarded (dead-letter) ${messageId}: ${error.message}`, { raw: fields[1] });
                    await redis.xack(REDIS_METRICS_STREAM, config.processor.consumerGroup, messageId);
                    continue;
                }

                if (!metric) {
                    continue;
                }
                const validMetric: Metric = metric;

                try {
                    await persistMetric(validMetric, messageId);

                    await registerApplication(validMetric.tenantId ?? 1, validMetric.metadata?.service || 'unknown');

                    await redis.xack(REDIS_METRICS_STREAM, config.processor.consumerGroup, messageId);

                    logger.info(`Metric processed and acknowledged: ${messageId}`);
                } catch (error: any) {
                    logger.error(`Error persisting metric ${messageId}, will be reprocessed: ${error.message}`);
                }
            }
        } catch (error: any) {
            logger.error(`Error reading from Redis: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

async function persistMetric(metric: Metric, streamId: string): Promise<void> {
  await pool.query(
    `INSERT INTO metrics (time, tenant_id, app_name, metric_name, metric_type, value, labels, stream_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     ON CONFLICT (time, tenant_id, app_name, metric_name, stream_id) DO UPDATE
     SET value = EXCLUDED.value, labels = EXCLUDED.labels`,
    [
      new Date(metric.timestamp),
      metric.tenantId ?? 1,
      metric.metadata?.service || 'unknown',
      metric.name,
      metric.type,
      metric.value,
      JSON.stringify(metric.labels || {}),
      streamId
    ]
  );
}

async function registerApplication(tenantId: number, appName: string): Promise<void> {
  await pool.query(
    `INSERT INTO applications (tenant_id, name, last_seen)
     VALUES ($1, $2, NOW())
     ON CONFLICT (tenant_id, name) DO UPDATE
     SET last_seen = NOW()`,
    [tenantId, appName]
  );
}