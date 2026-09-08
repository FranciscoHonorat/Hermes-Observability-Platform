import { Router, Request, Response } from 'express';
import { pool } from '../database';
import { Logger } from '@hermes/shared';

const router = Router();
const logger = new Logger('LogsAPI');

// GET /api/v1/logs - Buscar logs com filtros
router.get('/', async (req: Request, res: Response) => {
    try {
        const {
            appName,
            level,
            search,
            traceId,
            from,
            to,
            limit = '100',
            offset = '0'
        } = req.query;

        const query = `
            SELECT
                time,
                app_name,
                level,
                message,
                trace_id,
                span_id,
                attributes
            FROM logs
            WHERE tenant_id = $1
              AND ($2::text IS NULL OR app_name = $2)
              AND ($3::text IS NULL OR level = $3)
              AND ($4::text IS NULL OR message ILIKE '%' || $4 || '%')
              AND ($5::text IS NULL OR trace_id = $5)
              AND ($6::timestamptz IS NULL OR time >= $6)
              AND ($7::timestamptz IS NULL OR time <= $7)
            ORDER BY time DESC
            LIMIT $8 OFFSET $9
        `;

        const params = [
            req.user!.tenantId,
            appName ?? null,
            level ?? null,
            search ?? null,
            traceId ?? null,
            from ? new Date(Number(from)) : null,
            to ? new Date(Number(to)) : null,
            Number(limit),
            Number(offset)
        ];

        const result = await pool.query(query, params);

        const logs = result.rows.map(row => ({
            serviceName: row.app_name,
            level: row.level,
            message: row.message,
            timestamp: new Date(row.time).getTime(),
            traceId: row.trace_id || undefined,
            spanId: row.span_id || undefined,
            attributes: row.attributes
        }));

        logger.debug(`Fetched ${logs.length} logs`, { appName, level, search, traceId });

        res.json({
            logs,
            count: logs.length
        });

    } catch (error: any) {
        logger.error('Error fetching logs:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export { router as logsRouter };
