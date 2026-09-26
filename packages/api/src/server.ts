import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { metricsRouter } from './routes/metrics';
import { applicationsRouter } from './routes/applications';
import { alertsRouter } from './routes/alerts';
import { tracesRouter } from './routes/traces';
import { logsRouter } from './routes/logs';
import { serviceMapRouter } from './routes/serviceMap';
import { anomaliesRouter } from './routes/anomalies';
import { recommendationsRouter } from './routes/recommendations';
import { errorHandler } from './middleware/errorHandler';
import { config } from './config';
import { Logger, authenticate } from '@hermes/shared';

const logger = new Logger('Server');

export function createServer(): Application {
    const app = express();

    app.set('trust proxy', 1);

    app.use(helmet());

    app.use(cors(config.cors));

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
                duration: `${duration}ms`,
                ip: req.ip
            });
        });
        
        next();
    });

    app.get('/health', (req: Request, res: Response) => {
        res.json({ 
            status: 'ok',
            service: 'hermes-api',
            timestamp: new Date().toISOString(),
            uptime: process.uptime()
        });
    });

    app.get('/', (req: Request, res: Response) => {
        res.json({
            service: 'Hermes API',
            version: '1.0.0',
            endpoints: {
                health: '/health',
                metrics: '/api/v1/metrics',
                applications: '/api/v1/applications',
                alerts: '/api/v1/alerts',
                traces: '/api/v1/traces',
                logs: '/api/v1/logs',
                serviceMap: '/api/v1/service-map',
                anomalies: '/api/v1/anomalies',
                recommendations: '/api/v1/recommendations'
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
                },
                traces: {
                    list: 'GET /api/v1/traces?serviceName=&from=&to=&limit=&offset=',
                    get: 'GET /api/v1/traces/:traceId'
                },
                logs: {
                    list: 'GET /api/v1/logs?appName=&level=&search=&traceId=&from=&to=&limit=&offset='
                },
                serviceMap: {
                    get: 'GET /api/v1/service-map?from=&to='
                },
                anomalies: {
                    list: 'GET /api/v1/anomalies?appName=&metricName=&severity=&from=&to=&limit=',
                    get: 'GET /api/v1/anomalies/:id'
                },
                recommendations: {
                    list: 'GET /api/v1/recommendations?appName=&status=&category=',
                    get: 'GET /api/v1/recommendations/:id',
                    update: 'PUT /api/v1/recommendations/:id'
                }
            }
        });
    });

    app.use('/api/v1', authenticate);

    app.use('/api/v1/metrics', metricsRouter);
    app.use('/api/v1/applications', applicationsRouter);
    app.use('/api/v1/alerts', alertsRouter);
    app.use('/api/v1/traces', tracesRouter);
    app.use('/api/v1/logs', logsRouter);
    app.use('/api/v1/service-map', serviceMapRouter);
    app.use('/api/v1/anomalies', anomaliesRouter);
    app.use('/api/v1/recommendations', recommendationsRouter);

    app.use((req: Request, res: Response) => {
        res.status(404).json({
            error: 'Not found',
            path: req.path,
            method: req.method
        });
    });

    app.use(errorHandler);

    return app;
}
