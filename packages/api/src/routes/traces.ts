import { Router, Request, Response } from 'express';
import { pool } from '../database';
import { Logger } from '@hermes/shared';

const router = Router();
const logger = new Logger('TracesAPI');

// GET /api/v1/traces - Listar traces recentes
router.get('/', async (req: Request, res: Response) => {
    try {
        const {
            serviceName,
            from,
            to,
            limit = '50',
            offset = '0'
        } = req.query;

        const query = `
            WITH trace_summary AS (
                SELECT
                    trace_id,
                    MIN(start_time) AS trace_start,
                    MAX(start_time + (duration_ms * interval '1 millisecond')) AS trace_end,
                    COUNT(*) AS span_count,
                    bool_or(status = 'error') AS has_error
                FROM spans
                WHERE tenant_id = $1
                  AND ($2::text IS NULL OR service_name = $2)
                  AND ($3::timestamptz IS NULL OR start_time >= $3)
                  AND ($4::timestamptz IS NULL OR start_time <= $4)
                GROUP BY trace_id
                ORDER BY trace_start DESC
                LIMIT $5 OFFSET $6
            ),
            roots AS (
                SELECT DISTINCT ON (trace_id) trace_id, service_name, operation_name
                FROM spans
                WHERE parent_span_id IS NULL AND tenant_id = $1
                ORDER BY trace_id, start_time ASC
            )
            SELECT
                ts.trace_id,
                ts.trace_start AS start_time,
                EXTRACT(EPOCH FROM (ts.trace_end - ts.trace_start)) * 1000 AS duration_ms,
                ts.span_count,
                ts.has_error,
                r.service_name AS root_service,
                r.operation_name AS root_operation
            FROM trace_summary ts
            LEFT JOIN roots r ON r.trace_id = ts.trace_id
            ORDER BY ts.trace_start DESC
        `;

        const params = [
            req.user!.tenantId,
            serviceName ?? null,
            from ? new Date(Number(from)) : null,
            to ? new Date(Number(to)) : null,
            Number(limit),
            Number(offset)
        ];

        const result = await pool.query(query, params);

        const traces = result.rows.map(row => ({
            traceId: row.trace_id,
            rootService: row.root_service,
            rootOperation: row.root_operation,
            startTime: new Date(row.start_time).getTime(),
            durationMs: Number(row.duration_ms),
            spanCount: Number(row.span_count),
            hasError: row.has_error
        }));

        logger.debug(`Fetched ${traces.length} traces`, { serviceName, from, to });

        res.json({
            traces,
            count: traces.length
        });

    } catch (error: any) {
        logger.error('Error fetching traces:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/v1/traces/:traceId - Todos os spans de um trace
router.get('/:traceId', async (req: Request, res: Response) => {
    try {
        const { traceId } = req.params;

        const query = `
            SELECT
                trace_id,
                span_id,
                parent_span_id,
                service_name,
                operation_name,
                start_time,
                duration_ms,
                status,
                attributes
            FROM spans
            WHERE trace_id = $1 AND tenant_id = $2
            ORDER BY start_time ASC
        `;

        const result = await pool.query(query, [traceId, req.user!.tenantId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Trace not found' });
        }

        const spans = result.rows.map(row => ({
            traceId: row.trace_id,
            spanId: row.span_id,
            parentSpanId: row.parent_span_id || undefined,
            serviceName: row.service_name,
            operationName: row.operation_name,
            startTime: new Date(row.start_time).getTime(),
            durationMs: Number(row.duration_ms),
            status: row.status,
            attributes: row.attributes
        }));

        res.json({
            traceId,
            spans
        });

    } catch (error: any) {
        logger.error('Error fetching trace:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export { router as tracesRouter };
