import { Router, Request, Response } from 'express';
import { pool } from '../database';
import { Logger } from '@hermes/shared';

const router = Router();
const logger = new Logger('ApplicationsAPI');

// GET /api/v1/applications - Listar todas as aplicações
router.get('/', async (req: Request, res: Response) => {
    try {
        const query = `
            SELECT 
                name,
                description,
                created_at,
                last_seen,
                (NOW() - last_seen) < INTERVAL '5 minutes' as is_active
            FROM applications
            ORDER BY last_seen DESC
        `;

        const result = await pool.query(query);

        logger.debug(`Fetched ${result.rows.length} applications`);

        res.json({
            applications: result.rows,
            count: result.rows.length
        });

    } catch (error: any) {
        logger.error('Error fetching applications:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/v1/applications/:name - Detalhes de uma aplicação
router.get('/:name', async (req: Request, res: Response) => {
    try {
        const { name } = req.params;

        const query = `
            SELECT 
                name,
                description,
                created_at,
                last_seen,
                (NOW() - last_seen) < INTERVAL '5 minutes' as is_active
            FROM applications
            WHERE name = $1
        `;

        const result = await pool.query(query, [name]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Application not found' });
        }

        res.json(result.rows[0]);

    } catch (error: any) {
        logger.error('Error fetching application:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/v1/applications/:name/metrics - Métricas de uma aplicação
router.get('/:name/metrics', async (req: Request, res: Response) => {
    try {
        const { name } = req.params;
        const { limit = '100' } = req.query;

        const query = `
            SELECT 
                time,
                metric_name,
                metric_type,
                value,
                labels
            FROM metrics
            WHERE app_name = $1
            ORDER BY time DESC
            LIMIT $2
        `;

        const result = await pool.query(query, [name, Number(limit)]);

        res.json({
            application: name,
            metrics: result.rows,
            count: result.rows.length
        });

    } catch (error: any) {
        logger.error('Error fetching application metrics:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export { router as applicationsRouter };
