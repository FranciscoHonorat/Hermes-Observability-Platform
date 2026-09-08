import { Request, Response, NextFunction } from 'express';
import { Logger, hashApiKey } from '@hermes/shared';
import { lookupTenantForApiKey } from '../redis';

const logger = new Logger('ApiKeyAuth');

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            tenantId?: number;
        }
    }
}

const isProduction = process.env.NODE_ENV === 'production';
// The fixed "default" tenant seeded by docker/init-db.sql — see
// docs/adr/0002-*.md for why unauthenticated dev traffic is attributed
// here instead of being rejected outright, preserving this project's
// "just works" local dev experience.
const DEV_DEFAULT_TENANT_ID = 1;

/**
 * Requires a valid `x-api-key` header on ingestion routes and resolves it
 * to a tenant. Replaces the old flat COLLECTOR_API_KEYS array check — keys
 * are now per-tenant, minted by packages/admin, and looked up by hash in
 * Redis (packages/admin writes that cache; this stays a single Redis
 * lookup on the hot ingestion path, no new Postgres dependency here).
 */
export async function apiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
    const provided = req.header('x-api-key');

    if (!provided) {
        if (isProduction) {
            logger.warn('Rejected request with no API key', { path: req.path, ip: req.ip });
            res.status(401).json({ error: 'Missing or invalid API key' });
            return;
        }
        req.tenantId = DEV_DEFAULT_TENANT_ID;
        next();
        return;
    }

    try {
        const tenantId = await lookupTenantForApiKey(hashApiKey(provided));

        if (tenantId === null) {
            logger.warn('Rejected request with invalid API key', { path: req.path, ip: req.ip });
            res.status(401).json({ error: 'Missing or invalid API key' });
            return;
        }

        req.tenantId = tenantId;
        next();
    } catch (error) {
        next(error);
    }
}
