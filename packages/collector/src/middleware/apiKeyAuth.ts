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
const DEV_DEFAULT_TENANT_ID = 1;

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
