import { Router, Request, Response } from 'express';
import { pool } from '../database';
import { Logger } from '@hermes/shared';

const router = Router();
const logger = new Logger('ServiceMapAPI');

router.get('/', async (req: Request, res: Response) => {
    try {
        const { from, to } = req.query;

        const query = `
            SELECT
                parent.service_name AS caller,
                child.service_name AS callee,
                COUNT(*) AS call_count,
                AVG(child.duration_ms) AS avg_duration_ms,
                SUM(CASE WHEN child.status = 'error' THEN 1 ELSE 0 END) AS error_count
            FROM spans child
            JOIN spans parent
                ON parent.span_id = child.parent_span_id
               AND parent.trace_id = child.trace_id
               AND parent.tenant_id = child.tenant_id
            WHERE child.tenant_id = $1
              AND parent.service_name != child.service_name
              AND ($2::timestamptz IS NULL OR child.start_time >= $2)
              AND ($3::timestamptz IS NULL OR child.start_time <= $3)
            GROUP BY parent.service_name, child.service_name
            ORDER BY call_count DESC
        `;

        const params = [
            req.user!.tenantId,
            from ? new Date(Number(from)) : null,
            to ? new Date(Number(to)) : null
        ];

        const result = await pool.query(query, params);

        const edges = result.rows.map(row => ({
            source: row.caller,
            target: row.callee,
            callCount: Number(row.call_count),
            errorCount: Number(row.error_count),
            avgDurationMs: Number(row.avg_duration_ms)
        }));

        const nodeStats = new Map<string, { callCount: number; errorCount: number }>();
        const touch = (name: string) => {
            if (!nodeStats.has(name)) {
                nodeStats.set(name, { callCount: 0, errorCount: 0 });
            }
            return nodeStats.get(name)!;
        };

        for (const edge of edges) {
            touch(edge.source);
            const callee = touch(edge.target);
            callee.callCount += edge.callCount;
            callee.errorCount += edge.errorCount;
        }

        const nodes = Array.from(nodeStats.entries()).map(([serviceName, stats]) => ({
            serviceName,
            callCount: stats.callCount,
            errorCount: stats.errorCount,
            errorRate: stats.callCount > 0 ? stats.errorCount / stats.callCount : 0
        }));

        logger.debug(`Fetched service map: ${nodes.length} nodes, ${edges.length} edges`, { from, to });

        res.json({ nodes, edges });

    } catch (error: any) {
        logger.error('Error fetching service map:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export { router as serviceMapRouter };
