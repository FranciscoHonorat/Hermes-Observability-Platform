import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { authRouter } from './routes/auth';
import { config } from './config';
import { Logger } from '@hermes/shared';

const logger = new Logger('Server');

export function createServer(): Application {
    const app = express();

    // Behind nginx (docker/nginx.conf) in every deployment — trust its
    // X-Forwarded-For so express-rate-limit keys by the real client IP
    // instead of throwing ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
    app.set('trust proxy', 1);

    app.use(helmet());
    app.use(cors(config.cors));
    app.use(express.json({ limit: '1mb' }));

    app.use(rateLimit({
        windowMs: config.rateLimit.windowMs,
        max: config.rateLimit.max,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Too many requests' }
    }));

    app.use((req: Request, res: Response, next: NextFunction) => {
        const start = Date.now();
        res.on('finish', () => {
            logger.debug(`${req.method} ${req.path}`, {
                status: res.statusCode,
                duration: `${Date.now() - start}ms`
            });
        });
        next();
    });

    app.get('/health', (req: Request, res: Response) => {
        res.json({ status: 'ok', service: 'hermes-users', timestamp: new Date().toISOString() });
    });

    app.use('/api/v1/auth', authRouter);

    app.use((req: Request, res: Response) => {
        res.status(404).json({ error: 'Not found', path: req.path });
    });

    app.use((err: any, req: Request, res: Response, next: NextFunction) => {
        logger.error('Users API Error:', { error: err.message, stack: err.stack });
        res.status(err.statusCode || 500).json({ error: err.message || 'Internal server error' });
    });

    return app;
}
