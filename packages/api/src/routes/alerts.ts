import { Router, Request, Response } from 'express';
import { pool } from '../database';
import { Logger, validateAlertRule, validateAlertRuleUpdate, ValidationError, requireRole } from '@hermes/shared';

const router = Router();
const logger = new Logger('AlertsAPI');

// Mutating routes require the admin role (was a shared bearer token before
// multi-tenancy/RBAC — see docs/adr/0002-*.md).
router.use((req, res, next) => {
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
        return requireRole('admin')(req, res, next);
    }
    next();
});

// GET /api/v1/alerts - Listar todos os alertas
router.get('/', async (req: Request, res: Response) => {
    try {
        const { enabled } = req.query;

        let query = `
            SELECT
                id,
                name,
                description,
                metric_name,
                condition,
                threshold,
                app_name,
                email_recipients,
                enabled,
                created_at,
                updated_at
            FROM alert_rules
            WHERE tenant_id = $1
        `;

        const params: any[] = [req.user!.tenantId];

        if (enabled !== undefined) {
            query += ` AND enabled = $2`;
            params.push(enabled === 'true');
        }

        query += ` ORDER BY created_at DESC`;

        const result = await pool.query(query, params);

        logger.debug(`Fetched ${result.rows.length} alert rules`);

        res.json({
            alerts: result.rows,
            count: result.rows.length
        });

    } catch (error: any) {
        logger.error('Error fetching alerts:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/v1/alerts/:id - Detalhes de um alerta
router.get('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const query = `
            SELECT
                id,
                name,
                description,
                metric_name,
                condition,
                threshold,
                app_name,
                email_recipients,
                enabled,
                created_at,
                updated_at
            FROM alert_rules
            WHERE id = $1 AND tenant_id = $2
        `;

        const result = await pool.query(query, [id, req.user!.tenantId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Alert not found' });
        }

        res.json(result.rows[0]);

    } catch (error: any) {
        logger.error('Error fetching alert:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/v1/alerts - Criar novo alerta
router.post('/', async (req: Request, res: Response) => {
    try {
        const body = { enabled: true, ...req.body };

        try {
            validateAlertRule(body);
        } catch (validationError: any) {
            if (validationError instanceof ValidationError) {
                return res.status(400).json({ error: validationError.message });
            }
            throw validationError;
        }

        const {
            name,
            description,
            metric_name,
            condition,
            threshold,
            app_name,
            email_recipients,
            enabled
        } = body;

        const query = `
            INSERT INTO alert_rules (
                tenant_id,
                name,
                description,
                metric_name,
                condition,
                threshold,
                app_name,
                email_recipients,
                enabled
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING *
        `;

        const result = await pool.query(query, [
            req.user!.tenantId,
            name,
            description || null,
            metric_name,
            condition,
            threshold,
            app_name || null,
            email_recipients,
            enabled
        ]);

        logger.info(`Alert created: ${name}`, { id: result.rows[0].id });

        res.status(201).json(result.rows[0]);

    } catch (error: any) {
        logger.error('Error creating alert:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/v1/alerts/:id - Atualizar alerta
router.put('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        try {
            validateAlertRuleUpdate(req.body);
        } catch (validationError: any) {
            if (validationError instanceof ValidationError) {
                return res.status(400).json({ error: validationError.message });
            }
            throw validationError;
        }

        const {
            name,
            description,
            metric_name,
            condition,
            threshold,
            app_name,
            email_recipients,
            enabled
        } = req.body;

        // Verificar se o alerta existe (no tenant do chamador)
        const checkQuery = 'SELECT id FROM alert_rules WHERE id = $1 AND tenant_id = $2';
        const checkResult = await pool.query(checkQuery, [id, req.user!.tenantId]);

        if (checkResult.rows.length === 0) {
            return res.status(404).json({ error: 'Alert not found' });
        }

        const query = `
            UPDATE alert_rules
            SET
                name = COALESCE($1, name),
                description = COALESCE($2, description),
                metric_name = COALESCE($3, metric_name),
                condition = COALESCE($4, condition),
                threshold = COALESCE($5, threshold),
                app_name = COALESCE($6, app_name),
                email_recipients = COALESCE($7, email_recipients),
                enabled = COALESCE($8, enabled),
                updated_at = NOW()
            WHERE id = $9 AND tenant_id = $10
            RETURNING *
        `;

        const result = await pool.query(query, [
            name,
            description,
            metric_name,
            condition,
            threshold,
            app_name,
            email_recipients,
            enabled,
            id,
            req.user!.tenantId
        ]);

        logger.info(`Alert updated: ${id}`);

        res.json(result.rows[0]);

    } catch (error: any) {
        logger.error('Error updating alert:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /api/v1/alerts/:id - Deletar alerta
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const query = 'DELETE FROM alert_rules WHERE id = $1 AND tenant_id = $2 RETURNING id';
        const result = await pool.query(query, [id, req.user!.tenantId]);

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'Alert not found' });
        }

        logger.info(`Alert deleted: ${id}`);

        res.json({
            message: 'Alert deleted successfully',
            id: result.rows[0].id
        });

    } catch (error: any) {
        logger.error('Error deleting alert:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/v1/alerts/:id/history - Histórico de disparos do alerta
router.get('/:id/history', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { limit = '100' } = req.query;

        // alert_history rows are tenant-scoped directly (not just via the
        // alert_rules join) so this stays correct even if a rule is ever
        // deleted out from under its history.
        const query = `
            SELECT
                id,
                alert_rule_id,
                app_name,
                triggered_at,
                metric_value,
                resolved_at,
                notification_sent
            FROM alert_history
            WHERE alert_rule_id = $1 AND tenant_id = $2
            ORDER BY triggered_at DESC
            LIMIT $3
        `;

        const result = await pool.query(query, [id, req.user!.tenantId, Number(limit)]);

        res.json({
            alert_id: id,
            history: result.rows,
            count: result.rows.length
        });

    } catch (error: any) {
        logger.error('Error fetching alert history:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export { router as alertsRouter };
