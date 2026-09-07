import { Request, Response, NextFunction } from 'express';
import { Logger } from '@hermes/shared';
import { config } from '../config';

const logger = new Logger('AdminAuth');

/**
 * Requires `Authorization: Bearer <token>` on state-changing alert routes.
 *
 * If no token is configured (API_ADMIN_TOKEN unset), requests are let
 * through unauthenticated — config.ts already refuses to start this way in
 * production, so this only ever happens in local development.
 */
export function adminAuth(req: Request, res: Response, next: NextFunction): void {
    if (!config.auth.adminToken) {
        return next();
    }

    const header = req.header('authorization') || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || token !== config.auth.adminToken) {
        logger.warn('Rejected admin request with missing/invalid token', {
            path: req.path,
            method: req.method,
            ip: req.ip
        });
        res.status(401).json({ error: 'Missing or invalid authorization token' });
        return;
    }

    next();
}
