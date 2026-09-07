import { Request, Response, NextFunction } from 'express';
import { Logger } from '@hermes/shared';
import { config } from '../config';

const logger = new Logger('ApiKeyAuth');

/**
 * Requires a valid `x-api-key` header on ingestion routes.
 *
 * If no keys are configured (COLLECTOR_API_KEYS unset), requests are let
 * through unauthenticated — config.ts already refuses to start this way in
 * production, so this only ever happens in local development.
 */
export function apiKeyAuth(req: Request, res: Response, next: NextFunction): void {
    if (config.auth.apiKeys.length === 0) {
        return next();
    }

    const provided = req.header('x-api-key');

    if (!provided || !config.auth.apiKeys.includes(provided)) {
        logger.warn('Rejected request with missing/invalid API key', {
            path: req.path,
            ip: req.ip
        });
        res.status(401).json({ error: 'Missing or invalid API key' });
        return;
    }

    next();
}
