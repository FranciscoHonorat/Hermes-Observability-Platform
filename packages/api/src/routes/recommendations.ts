import { Router, Request, Response } from 'express';
import { pool } from '../database';
import { Logger, validateRecommendationStatusUpdate, ValidationError, requireRole } from '@hermes/shared';

const router = Router();
const logger = new Logger('RecommendationsAPI');

// Only the status field is mutable (acknowledge/dismiss) — admin-only, same
// as alerts.ts's mutating routes.
router.use((req, res, next) => {
    if (['PUT'].includes(req.method)) {
        return requireRole('admin')(req, res, next);
    }
    next();
});

// GET /api/v1/recommendations - Listar recomendações
router.get('/', async (req: Request, res: Response) => {
    try {
        const {
            appName,
            status,
            category,
            limit = '100'
        } = req.query;

        let query = `
            SELECT
                id,
                app_name,
                category,
                severity,
                title,
                description,
                related_metric_name,
                related_operation_name,
                evidence,
                status,
                created_at,
                updated_at
            FROM recommendations
            WHERE tenant_id = $1
        `;
        const params: any[] = [req.user!.tenantId];
        let paramIndex = 2;

        if (appName) {
            query += ` AND app_name = $${paramIndex++}`;
            params.push(appName);
        }

        if (status) {
            query += ` AND status = $${paramIndex++}`;
            params.push(status);
        }

        if (category) {
            query += ` AND category = $${paramIndex++}`;
            params.push(category);
        }

        query += ` ORDER BY created_at DESC LIMIT $${paramIndex++}`;
        params.push(Number(limit));

        const result = await pool.query(query, params);

        logger.debug(`Fetched ${result.rows.length} recommendations`, { appName, status, category });

        res.json({
            recommendations: result.rows,
            count: result.rows.length
        });

    } catch (error: any) {
        logger.error('Error fetching recommendations:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/v1/recommendations/:id - Detalhes de uma recomendação
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            'SELECT * FROM recommendations WHERE id = $1 AND tenant_id = $2',
            [id, req.user!.tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Recommendation not found' });
        }

        res.json(result.rows[0]);

    } catch (error: any) {
        logger.error('Error fetching recommendation:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/v1/recommendations/:id - Acknowledge/dismiss uma recomendação
router.put('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        try {
            validateRecommendationStatusUpdate(req.body);
        } catch (validationError: any) {
            if (validationError instanceof ValidationError) {
                return res.status(400).json({ error: validationError.message });
            }
            throw validationError;
        }

        const result = await pool.query(
            `UPDATE recommendations
             SET status = $1, updated_at = NOW()
             WHERE id = $2 AND tenant_id = $3
             RETURNING *`,
            [req.body.status, id, req.user!.tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Recommendation not found' });
        }

        logger.info(`Recommendation ${id} status updated to ${req.body.status}`);

        res.json(result.rows[0]);

    } catch (error: any) {
        logger.error('Error updating recommendation:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export { router as recommendationsRouter };
