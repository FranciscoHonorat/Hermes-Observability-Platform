import { LogEntry, Logger, validateLogEntry, REDIS_LOGS_STREAM } from '@hermes/shared';
import { pool } from './database';
import { logsRedis as redis } from './redis';
import { config } from './config';

const logger = new Logger('LogsProcessor');

export async function processLogs(): Promise<void> {
    logger.info('Logs processor started');

    while (true) {
        try {
            const results = await redis.xreadgroup(
                'GROUP',
                config.processor.logsConsumerGroup,
                config.processor.consumerName,
                'COUNT',
                config.processor.batchSize,
                'BLOCK',
                config.processor.blockTimeout,
                'STREAMS',
                REDIS_LOGS_STREAM,
                '>'
            );

            if (!results || results.length === 0) {
                continue;
            }

            const [, messages] = results[0] as [string, Array<[string, string[]]>];

            const valid: Array<{ log: LogEntry; messageId: string }> = [];

            for (const [messageId, fields] of messages) {
                let entry: LogEntry | undefined;

                try {
                    const logData = fields[1];
                    entry = JSON.parse(logData);

                    validateLogEntry(entry);
                } catch (error: any) {
                    logger.warn(`Log discarded (dead-letter) ${messageId}: ${error.message}`, { raw: fields[1] });
                    await redis.xack(REDIS_LOGS_STREAM, config.processor.logsConsumerGroup, messageId);
                    continue;
                }

                if (!entry) {
                    continue;
                }
                valid.push({ log: entry, messageId });
            }

            if (valid.length === 0) {
                continue;
            }

            try {
                await persistLogsBatch(valid);

                const apps = new Map<string, { tenantId: number; appName: string }>();
                for (const { log } of valid) {
                    const tenantId = log.tenantId ?? 1;
                    const appName = log.serviceName || 'unknown';
                    apps.set(`${tenantId}:${appName}`, { tenantId, appName });
                }
                for (const { tenantId, appName } of apps.values()) {
                    await registerApplication(tenantId, appName);
                }

                await redis.xack(REDIS_LOGS_STREAM, config.processor.logsConsumerGroup, ...valid.map(v => v.messageId));

                logger.info(`Log batch processed and acknowledged: ${valid.length} entries`);
            } catch (error: any) {
                logger.error(`Error persisting log batch (${valid.length} entries): ${error.message}`);
            }
        } catch (error: any) {
            logger.error(`Error reading from Redis (logs): ${error.message}`);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

async function persistLogsBatch(items: Array<{ log: LogEntry; messageId: string }>): Promise<void> {
    const COLUMNS = 9;
    const values: any[] = [];
    const placeholders: string[] = [];

    items.forEach(({ log, messageId }, i) => {
        const base = i * COLUMNS;
        placeholders.push(
            `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`
        );
        values.push(
            new Date(log.timestamp),
            log.tenantId ?? 1,
            log.serviceName || 'unknown',
            log.level,
            log.message,
            log.traceId || null,
            log.spanId || null,
            JSON.stringify(log.attributes || {}),
            messageId
        );
    });

    await pool.query(
        `INSERT INTO logs (time, tenant_id, app_name, level, message, trace_id, span_id, attributes, stream_id)
         VALUES ${placeholders.join(', ')}
         ON CONFLICT (time, tenant_id, app_name, stream_id) DO NOTHING`,
        values
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
