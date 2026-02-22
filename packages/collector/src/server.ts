import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { metricsRouter } from './routes/metrics';
import { errorHandler } from './middleware/errorHandler';
import { Logger } from '@hermes/shared';

const logger = new Logger('Server');

export function createServer(): Application {
    const app = express();

    // Middleware de parsing
    app.use(cors());
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));

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
                metrics: '/api/v1/metrics'
            }
        });
    });

    // Rotas da API
    app.use('/api/v1/metrics', metricsRouter);

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
