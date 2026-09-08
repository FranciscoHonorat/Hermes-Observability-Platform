import { Router, Request, Response } from 'express';
import { Logger, hashPassword, Role } from '@hermes/shared';
import { pool } from '../database';

const router = Router();
const logger = new Logger('AdminUsersAPI');

const VALID_ROLES: Role[] = ['admin', 'viewer'];

// GET /api/v1/admin/users - Listar usuários do tenant do chamador
router.get('/', async (req: Request, res: Response) => {
    try {
        const result = await pool.query(
            `SELECT id, tenant_id, email, role, created_at FROM users WHERE tenant_id = $1 ORDER BY created_at ASC`,
            [req.user!.tenantId]
        );
        res.json({ users: result.rows, count: result.rows.length });
    } catch (error: any) {
        logger.error('Error listing users:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/v1/admin/users - Criar um novo usuário no tenant do chamador
router.post('/', async (req: Request, res: Response) => {
    try {
        const { email, password, role = 'viewer' } = req.body;

        if (!email || typeof email !== 'string') {
            return res.status(400).json({ error: 'email is required' });
        }
        if (!password || typeof password !== 'string' || password.length < 8) {
            return res.status(400).json({ error: 'password is required and must be at least 8 characters' });
        }
        if (!VALID_ROLES.includes(role)) {
            return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
        }

        const passwordHash = await hashPassword(password);
        // tenant_id always comes from the authenticated caller, never the
        // request body — an admin can only create users in their own tenant.
        const result = await pool.query(
            `INSERT INTO users (tenant_id, email, password_hash, role)
             VALUES ($1, $2, $3, $4)
             RETURNING id, tenant_id, email, role, created_at`,
            [req.user!.tenantId, email, passwordHash, role]
        );

        logger.info(`User created: ${email}`, { tenantId: req.user!.tenantId, role });
        res.status(201).json(result.rows[0]);

    } catch (error: any) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'That email is already registered for this tenant' });
        }
        logger.error('Error creating user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// PUT /api/v1/admin/users/:id/role - Alterar o papel de um usuário
router.put('/:id/role', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;
        const { role } = req.body;

        if (!VALID_ROLES.includes(role)) {
            return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
        }

        const result = await pool.query(
            `UPDATE users SET role = $1 WHERE id = $2 AND tenant_id = $3
             RETURNING id, tenant_id, email, role, created_at`,
            [role, id, req.user!.tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        logger.info(`User role updated: ${id}`, { role });
        res.json(result.rows[0]);

    } catch (error: any) {
        logger.error('Error updating user role:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// DELETE /api/v1/admin/users/:id - Remover um usuário do tenant do chamador
router.delete('/:id', async (req: Request, res: Response) => {
    try {
        const { id } = req.params;

        if (Number(id) === req.user!.userId) {
            return res.status(400).json({ error: 'Cannot delete your own account' });
        }

        const result = await pool.query(
            `DELETE FROM users WHERE id = $1 AND tenant_id = $2 RETURNING id`,
            [id, req.user!.tenantId]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ error: 'User not found' });
        }

        logger.info(`User deleted: ${id}`);
        res.json({ message: 'User deleted', id: result.rows[0].id });

    } catch (error: any) {
        logger.error('Error deleting user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export { router as usersRouter };
