import { Router, Request, Response } from 'express';
import { Logger, signToken, hashPassword, comparePassword, authenticate, COOKIE_NAME } from '@hermes/shared';
import { pool } from '../database';

const router = Router();
const logger = new Logger('AuthAPI');

const isProduction = process.env.NODE_ENV === 'production';
const COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days, matches signToken's TTL

function setSessionCookie(res: Response, token: string): void {
    res.cookie(COOKIE_NAME, token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: isProduction,
        path: '/',
        maxAge: COOKIE_MAX_AGE_MS
    });
}

function slugify(name: string): string {
    return name
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '') || 'tenant';
}

// POST /api/v1/auth/signup - Cria um tenant + seu primeiro usuário (admin)
router.post('/signup', async (req: Request, res: Response) => {
    try {
        const { tenantName, email, password } = req.body;

        if (!tenantName || typeof tenantName !== 'string') {
            return res.status(400).json({ error: 'tenantName is required' });
        }
        if (!email || typeof email !== 'string') {
            return res.status(400).json({ error: 'email is required' });
        }
        if (!password || typeof password !== 'string' || password.length < 8) {
            return res.status(400).json({ error: 'password is required and must be at least 8 characters' });
        }

        const baseSlug = slugify(tenantName);
        const passwordHash = await hashPassword(password);

        let tenant;
        for (let attempt = 0; attempt < 5; attempt++) {
            const slug = attempt === 0 ? baseSlug : `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`;
            try {
                const tenantResult = await pool.query(
                    `INSERT INTO tenants (name, slug) VALUES ($1, $2) RETURNING id, name, slug, created_at`,
                    [tenantName, slug]
                );
                tenant = tenantResult.rows[0];
                break;
            } catch (error: any) {
                if (error.code === '23505') continue; // slug collision, retry with a suffix
                throw error;
            }
        }
        if (!tenant) {
            return res.status(500).json({ error: 'Could not allocate a unique tenant slug, try a different name' });
        }

        const userResult = await pool.query(
            `INSERT INTO users (tenant_id, email, password_hash, role)
             VALUES ($1, $2, $3, 'admin')
             RETURNING id, tenant_id, email, role, created_at`,
            [tenant.id, email, passwordHash]
        );
        const user = userResult.rows[0];

        const token = signToken({ userId: user.id, tenantId: tenant.id, role: 'admin' });
        setSessionCookie(res, token);

        logger.info(`Tenant signed up: ${tenant.slug}`, { userId: user.id });
        res.status(201).json({ user, tenant });

    } catch (error: any) {
        if (error.code === '23505') {
            return res.status(409).json({ error: 'That email is already registered for this tenant' });
        }
        logger.error('Error during signup:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/v1/auth/login
router.post('/login', async (req: Request, res: Response) => {
    try {
        const { tenantSlug, email, password } = req.body;

        if (!tenantSlug || !email || !password) {
            return res.status(400).json({ error: 'tenantSlug, email and password are required' });
        }

        const result = await pool.query(
            `SELECT u.id, u.tenant_id, u.email, u.password_hash, u.role
             FROM users u
             JOIN tenants t ON t.id = u.tenant_id
             WHERE t.slug = $1 AND u.email = $2`,
            [tenantSlug, email]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const user = result.rows[0];
        const valid = await comparePassword(password, user.password_hash);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid credentials' });
        }

        const token = signToken({ userId: user.id, tenantId: user.tenant_id, role: user.role });
        setSessionCookie(res, token);

        logger.info(`User logged in: ${user.email}`, { tenantId: user.tenant_id });
        res.json({ id: user.id, tenant_id: user.tenant_id, email: user.email, role: user.role });

    } catch (error: any) {
        logger.error('Error during login:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// POST /api/v1/auth/logout
router.post('/logout', (req: Request, res: Response) => {
    res.clearCookie(COOKIE_NAME, { path: '/' });
    res.json({ message: 'Logged out' });
});

// GET /api/v1/auth/me
router.get('/me', authenticate, async (req: Request, res: Response) => {
    try {
        const result = await pool.query(
            `SELECT u.id, u.tenant_id, u.email, u.role, u.created_at, t.name AS tenant_name, t.slug AS tenant_slug
             FROM users u
             JOIN tenants t ON t.id = u.tenant_id
             WHERE u.id = $1`,
            [req.user!.userId]
        );

        if (result.rows.length === 0) {
            return res.status(401).json({ error: 'User no longer exists' });
        }

        res.json(result.rows[0]);

    } catch (error: any) {
        logger.error('Error fetching current user:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export { router as authRouter };
