import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { metricsRouter } from './routes/metrics';
import { tracesRouter } from './routes/traces';
import { logsRouter } from './routes/logs';
import { errorHandler } from './middleware/errorHandler';
import { apiKeyAuth } from './middleware/apiKeyAuth';
import { config } from './config';
import { Logger } from '@hermes/shared';

const logger = new Logger('Server');

export function createServer(): Application {
    const app = express();

    app.set('trust proxy', 1);

    app.use(helmet());

    app.use(cors());
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));

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
            const duration = Date.now() - start;
            logger.debug(`${req.method} ${req.path}`, {
                status: res.statusCode,
                duration: `${duration}ms`
            });
        });
        
        next();
    });

    app.get('/health', (req: Request, res: Response) => {
        res.json({ 
            status: 'ok',
            service: 'hermes-collector',
            timestamp: new Date().toISOString()
        });
    });

    app.get('/', (req: Request, res: Response) => {
        res.json({
            service: 'Hermes Collector',
            version: '1.0.0',
            endpoints: {
                health: '/health',
                metrics: '/api/v1/metrics',
                traces: '/api/v1/traces',
                logs: '/api/v1/logs'
            }
        });
    });

    app.use('/api/v1/metrics', apiKeyAuth, metricsRouter);
    app.use('/api/v1/traces', apiKeyAuth, tracesRouter);
    app.use('/api/v1/logs', apiKeyAuth, logsRouter);

    app.use((req: Request, res: Response) => {
        res.status(404).json({
            error: 'Not found',
            path: req.path
        });
    });

    app.use(errorHandler);

    return app;
}
