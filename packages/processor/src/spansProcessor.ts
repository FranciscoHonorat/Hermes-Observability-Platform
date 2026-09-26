import { Span, Logger, validateSpan, REDIS_TRACES_STREAM } from '@hermes/shared';
import { pool } from './database';
import { tracesRedis as redis } from './redis';
import { config } from './config';

const logger = new Logger('SpansProcessor');

export async function processSpans(): Promise<void> {
    logger.info('Spans processor started');

    while (true) {
        try {
            const results = await redis.xreadgroup(
                'GROUP',
                config.processor.tracesConsumerGroup,
                config.processor.consumerName,
                'COUNT',
                config.processor.batchSize,
                'BLOCK',
                config.processor.blockTimeout,
                'STREAMS',
                REDIS_TRACES_STREAM,
                '>'
            );

            if (!results || results.length === 0) {
                continue;
            }

            const [, messages] = results[0] as [string, Array<[string, string[]]>];

            for (const [messageId, fields] of messages) {
                let span: Span | undefined;

                try {
                    const spanData = fields[1];
                    span = JSON.parse(spanData);

                    validateSpan(span);
                } catch (error: any) {
                    logger.warn(`Span discarded (dead-letter) ${messageId}: ${error.message}`, { raw: fields[1] });
                    await redis.xack(REDIS_TRACES_STREAM, config.processor.tracesConsumerGroup, messageId);
                    continue;
                }

                if (!span) {
                    continue;
                }
                const validSpan: Span = span;

                try {
                    await persistSpan(validSpan);

                    await registerApplication(validSpan.tenantId ?? 1, validSpan.serviceName || 'unknown');

                    await redis.xack(REDIS_TRACES_STREAM, config.processor.tracesConsumerGroup, messageId);

                    logger.info(`Span processed and acknowledged: ${messageId}`);
                } catch (error: any) {
                    logger.error(`Error persisting span ${messageId}: ${error.message}`);
                }
            }
        } catch (error: any) {
            logger.error(`Error reading from Redis (traces): ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

async function persistSpan(span: Span): Promise<void> {
  await pool.query(
    `INSERT INTO spans (trace_id, span_id, tenant_id, parent_span_id, service_name, operation_name, start_time, duration_ms, status, attributes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (start_time, tenant_id, trace_id, span_id) DO NOTHING`,
    [
      span.traceId,
      span.spanId,
      span.tenantId ?? 1,
      span.parentSpanId || null,
      span.serviceName,
      span.operationName,
      new Date(span.startTime),
      span.duration,
      span.status,
      JSON.stringify(span.attributes || {})
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
