import { Request, Response, NextFunction } from 'express';
import { Logger } from '@hermes/shared';

const logger = new Logger('ErrorHandler');

export function errorHandler(
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
): void {
    logger.error('Unhandled error:', {
        error: err.message,
        stack: err.stack,
        method: req.method,
        path: req.path
    });

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal server error';

    res.status(statusCode).json({
        error: message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
}
