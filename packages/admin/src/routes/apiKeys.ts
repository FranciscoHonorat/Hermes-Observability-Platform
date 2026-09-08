import { Router, Request, Response } from 'express';
import { Logger, generateApiKey, hashApiKey } from '@hermes/shared';
import { pool } from '../database';
import { cacheApiKey, uncacheApiKey } from '../redis';

const router = Router();
const logger = new Logger('AdminApiKeysAPI');

// GET /api/v1/admin/api-keys - Listar chaves do tenant do chamador (nunca a chave crua)
router.get('/', async (req: Request, res: Response) => {
    try {
        const result = await pool.query(
            `SELECT id, tenant_id, label, created_at, revoked_at FROM api_keys WHERE tenant_id = $1 ORDER BY created_at DESC`,
            [req.user!.tenantId]
        );
        res.json({ apiKeys: result.rows, count: result.rows.length });
    } catch (error: any) {
        logger.error('Error listing API keys:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/v1/admin/api-keys - Gerar uma nova chave (mostrada em texto puro só aqui, uma vez)
router.post('/', async (req: Request, res: Response) => {
    try {
        const { label } = req.body;

        const rawKey = generateApiKey();
        const keyHash = hashApiKey(rawKey);

        const result = await pool.query(
            `INSERT INTO api_keys (tenant_id, key_hash, label)
             VALUES ($1, $2, $3)
             RETURNING id, tenant_id, label, created_at, revoked_at`,
            [req.user!.tenantId, keyHash, label || null]
        );

        await cacheApiKey(keyHash, req.user!.tenantId);

        logger.info(`API key created`, { tenantId: req.user!.tenantId, label });
        res.status(201).json({ ...result.rows[0], key: rawKey });

    } catch (error: any) {
        logger.error('Error creating API key:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /api/v1/admin/api-keys/:id - Revogar uma chave
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        const result = await pool.query(
            `UPDATE api_keys SET revoked_at = NOW()
             WHERE id = $1 AND tenant_id = $2 AND revoked_at IS NULL
             RETURNING key_hash`,
            [id, req.user!.tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'API key not found or already revoked' });
        }

        await uncacheApiKey(result.rows[0].key_hash);

        logger.info(`API key revoked: ${id}`);
        res.json({ message: 'API key revoked', id: Number(id) });

    } catch (error: any) {
        logger.error('Error revoking API key:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export { router as apiKeysRouter };
