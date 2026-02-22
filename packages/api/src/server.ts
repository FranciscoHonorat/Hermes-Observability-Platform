import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { metricsRouter } from './routes/metrics';
import { applicationsRouter } from './routes/applications';
import { alertsRouter } from './routes/alerts';
import { errorHandler } from './middleware/errorHandler';
import { config } from './config';
import { Logger } from '@hermes/shared';

const logger = new Logger('Server');

export function createServer(): Application {
    const app = express();

    // CORS
    app.use(cors(config.cors));

    // Body parsing
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true }));

    // Request logging
    app.use((req: Request, res: Response, next: NextFunction) => {
        const start = Date.now();
        
        res.on('finish', () => {
            const duration = Date.now() - start;
            logger.debug(`${req.method} ${req.path}`, {
                status: res.statusCode,
                duration: `${duration}ms`,
                ip: req.ip
            });
        });
        
        next();
    });

    // Health check
    app.get('/health', (req: Request, res: Response) => {
        res.json({ 
            status: 'ok',
            service: 'hermes-api',
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });
    });

    // Root endpoint
    app.get('/', (req: Request, res: Response) => {
        res.json({
            service: 'Hermes API',
            version: '1.0.0',
            endpoints: {
                health: '/health',
                metrics: '/api/v1/metrics',
                applications: '/api/v1/applications',
                alerts: '/api/v1/alerts'
            },
            documentation: {
                metrics: {
                    list: 'GET /api/v1/metrics?appName=&metricName=&from=&to=&limit=',
                    timeseries: 'GET /api/v1/metrics/timeseries?appName=&metricName=&interval=&from=&to=',
                    names: 'GET /api/v1/metrics/names?appName=',
                    latest: 'GET /api/v1/metrics/latest?appName='
                },
                applications: {
                    list: 'GET /api/v1/applications',
                    details: 'GET /api/v1/applications/:name',
                    metrics: 'GET /api/v1/applications/:name/metrics'
                },
                alerts: {
                    list: 'GET /api/v1/alerts?enabled=',
                    get: 'GET /api/v1/alerts/:id',
                    create: 'POST /api/v1/alerts',
                    update: 'PUT /api/v1/alerts/:id',
                    delete: 'DELETE /api/v1/alerts/:id',
                    history: 'GET /api/v1/alerts/:id/history'
                }
            }
        });
    });

    // API Routes
    app.use('/api/v1/metrics', metricsRouter);
    app.use('/api/v1/applications', applicationsRouter);
    app.use('/api/v1/alerts', alertsRouter);

    // 404 handler
    app.use((req: Request, res: Response) => {
        res.status(404).json({
            error: 'Not found',
            path: req.path,
            method: req.method
        });
    });

    // Error handler (deve ser o último)
    app.use(errorHandler);

    return app;
}
