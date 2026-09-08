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

    // Security headers
    app.use(helmet());

    // Middleware de parsing
    app.use(cors());
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));

    // Rate limiting per source IP
    app.use(rateLimit({
        windowMs: config.rateLimit.windowMs,
        max: config.rateLimit.max,
        standardHeaders: true,
        legacyHeaders: false,
        message: { error: 'Too many requests' }
    }));

    // Logging middleware
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

    // Health check
    app.get('/health', (req: Request, res: Response) => {
        res.json({ 
            status: 'ok',
            service: 'hermes-collector',
            timestamp: new Date().toISOString()
        });
    });

    // Rota base
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

    // Rotas da API (ingestão requer x-api-key — ver COLLECTOR_API_KEYS)
    app.use('/api/v1/metrics', apiKeyAuth, metricsRouter);
    app.use('/api/v1/traces', apiKeyAuth, tracesRouter);
    app.use('/api/v1/logs', apiKeyAuth, logsRouter);

    // 404 handler
    app.use((req: Request, res: Response) => {
        res.status(404).json({
            error: 'Not found',
            path: req.path
        });
    });

    // Error handling middleware (deve ser o último)
    app.use(errorHandler);

    return app;
}
