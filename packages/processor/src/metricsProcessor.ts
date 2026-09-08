import { Metric, Logger, validateMetric, REDIS_METRICS_STREAM } from '@hermes/shared';
import { pool } from './database';
import { redis } from './redis';
import { config } from './config';

const logger = new Logger('MetricsProcessor');

export async function processMetrics(): Promise<void> {
    logger.info('Metrics processor iniciado');

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

                    //Validar métrica
                    validateMetric(metric);
                } catch (error: any) {
                    // Poison pill: malformed JSON or a metric that fails validation will
                    // never succeed on retry, so ack it now to drain it from the pending
                    // entries list instead of leaving it stuck there forever.
                    logger.warn(`Métrica descartada (dead-letter) ${messageId}: ${error.message}`, { raw: fields[1] });
                    await redis.xack(REDIS_METRICS_STREAM, config.processor.consumerGroup, messageId);
                    continue;
                }

                if (!metric) {
                    continue;
                }
                const validMetric: Metric = metric;

                try {
                    //Persistir no banco
                    await persistMetric(validMetric, messageId);

                    // Registrar aplicação
                    await registerApplication(validMetric.metadata?.service || 'unknown');

                    // Confirmar processamento
                    await redis.xack(REDIS_METRICS_STREAM, config.processor.consumerGroup, messageId);

                    logger.info(`Métrica processada e confirmada: ${messageId}`);
                } catch (error: any) {
                    // Transient failure (e.g. DB unavailable): leave unacked so it is
                    // redelivered to the consumer group and retried.
                    logger.error(`Erro ao persistir métrica ${messageId}, será reprocessada: ${error.message}`);
                }
            }
        } catch (error: any) {
            logger.error(`Erro ao ler do Redis: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, 5000)); // Espera antes de tentar novamente
        }
    }
}

async function persistMetric(metric: Metric, streamId: string): Promise<void> {
  // stream_id (not just time/app_name/metric_name) is part of the conflict
  // target: two distinct events for the same app+metric can share a
  // millisecond under real load, and streamId is what keeps them from
  // silently overwriting one another while still deduping a genuine
  // Redis Streams redelivery of the *same* message. See docker/init-db.sql.
  await pool.query(
    `INSERT INTO metrics (time, app_name, metric_name, metric_type, value, labels, stream_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (time, app_name, metric_name, stream_id) DO UPDATE
     SET value = EXCLUDED.value, labels = EXCLUDED.labels`,
    [
      new Date(metric.timestamp),
      metric.metadata?.service || 'unknown',
      metric.name,
      metric.type,
      metric.value,
      JSON.stringify(metric.labels || {}),
      streamId
    ]
  );
}

async function registerApplication(appName: string): Promise<void> {
  await pool.query(
    `INSERT INTO applications (name, last_seen)
     VALUES ($1, NOW())
     ON CONFLICT (name) DO UPDATE
     SET last_seen = NOW()`,
    [appName]
  );
}