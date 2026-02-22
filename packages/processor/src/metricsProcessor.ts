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
                try {
                    const metricData = fields[1];
                    const metric: Metric = JSON.parse(metricData);

                    //Validar métrica
                    validateMetric(metric);

                    //Persistir no banco
                    await persistMetric(metric);

                    // Registrar aplicação
                    await registerApplication(metric.metadata?.service || 'unknown');

                    // Confirmar processamento
                    await redis.xack(REDIS_METRICS_STREAM, config.processor.consumerGroup, messageId);

                    logger.info(`Métrica processada e confirmada: ${messageId}`);
                } catch (error: any) {
                    logger.error(`Erro ao processar métrica ${messageId}: ${error.message}`);
                }
            }
        } catch (error: any) {
            logger.error(`Erro ao ler do Redis: ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, 5000)); // Espera antes de tentar novamente
        }
    }
}

async function persistMetric(metric: Metric): Promise<void> {
  await pool.query(
    `INSERT INTO metrics (time, app_name, metric_name, metric_type, value, labels)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (time, app_name, metric_name) DO UPDATE
     SET value = EXCLUDED.value, labels = EXCLUDED.labels`,
    [
      new Date(metric.timestamp),
      metric.metadata?.service || 'unknown',
      metric.name,
      metric.type,
      metric.value,
      JSON.stringify(metric.labels || {})
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