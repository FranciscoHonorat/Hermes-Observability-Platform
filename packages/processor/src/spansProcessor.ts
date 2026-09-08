import { Span, Logger, validateSpan, REDIS_TRACES_STREAM } from '@hermes/shared';
import { pool } from './database';
import { tracesRedis as redis } from './redis';
import { config } from './config';

const logger = new Logger('SpansProcessor');

export async function processSpans(): Promise<void> {
    logger.info('Spans processor iniciado');

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

                    // Validar span
                    validateSpan(span);
                } catch (error: any) {
                    // Poison pill: malformed JSON or a span that fails validation will
                    // never succeed on retry, so ack it now to drain it from the pending
                    // entries list instead of leaving it stuck there forever.
                    logger.warn(`Span descartado (dead-letter) ${messageId}: ${error.message}`, { raw: fields[1] });
                    await redis.xack(REDIS_TRACES_STREAM, config.processor.tracesConsumerGroup, messageId);
                    continue;
                }

                if (!span) {
                    continue;
                }
                const validSpan: Span = span;

                try {
                    // Persistir no banco
                    await persistSpan(validSpan);

                    // Registrar aplicação
                    await registerApplication(validSpan.tenantId ?? 1, validSpan.serviceName || 'unknown');

                    // Confirmar processamento
                    await redis.xack(REDIS_TRACES_STREAM, config.processor.tracesConsumerGroup, messageId);

                    logger.info(`Span processado e confirmado: ${messageId}`);
                } catch (error: any) {
                    // Transient failure (e.g. DB unavailable): left unacked. Note this
                    // does NOT currently get redelivered — there's no XCLAIM/reclaim
                    // logic anywhere in this processor, so an unacked entry just sits
                    // in the consumer group's pending list until someone looks. Same
                    // known gap as the metrics pipeline; not fixed here.
                    logger.error(`Erro ao persistir span ${messageId}: ${error.message}`);
                }
            }
        } catch (error: any) {
            logger.error(`Erro ao ler do Redis (traces): ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, 5000)); // Espera antes de tentar novamente
        }
    }
}

async function persistSpan(span: Span): Promise<void> {
  // No stream_id needed in the conflict target (unlike metrics): spanId is a
  // random 8-byte value generated once per span, not a coarse client
  // timestamp, so (tenantId, traceId, spanId) can never legitimately
  // collide between two distinct spans. DO NOTHING (not DO UPDATE) because
  // a span's data is immutable once emitted — a redelivered duplicate is a
  // true no-op.
  await pool.query(
    `INSERT INTO spans (trace_id, span_id, tenant_id, parent_span_id, service_name, operation_name, start_time, duration_ms, status, attributes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (start_time, tenant_id, trace_id, span_id) DO NOTHING`,
    [
      span.traceId,
      span.spanId,
      span.tenantId ?? 1, // Collector always sets this; 1 (default tenant) is a defensive fallback
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
