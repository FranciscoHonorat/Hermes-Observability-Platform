import { Request, Response, NextFunction } from 'express';
import { Metric, MetricType, MetricUnit } from '@hermes/shared';

const httpMetrics: Metric[] = [];

export const httpMiddleware = () => {
    return (req: Request, res: Response, next: NextFunction) => {
        const start = Date.now();

        //Captura quando a resposta terminar
        res.on('finish', () => {
            const duration = Date.now() - start;
            const statusCode = res.statusCode;

            //Métrica de duração da request
            httpMetrics.push({
                name: 'http.request.duration',
                type: MetricType.HISTOGRAM,
                value: duration,
                unit: MetricUnit.MILLISECONDS,
                timestamp: Date.now(),
                labels: {
                    method: req.method,
                    route: req.route?.path || req.path,
                    status: statusCode
                }
            });

            //Contador de requests
            httpMetrics.push({
                name: 'http.request.total',
                type: MetricType.COUNTER,
                value: 1,
                unit: MetricUnit.COUNT,
                timestamp: Date.now(),
                labels: {
                    method: req.method,
                    route: req.route?.path || req.path,
                    status: statusCode
                }
            });

            //Contador de erros (status >= 400)
            if (statusCode >= 400) {
                httpMetrics.push({
                    name: 'http.request.errors',
                    type: MetricType.COUNTER,
                    value: 1,
                    unit: MetricUnit.COUNT,
                    timestamp: Date.now(),
                    labels: {
                        method: req.method,
                        route: req.route?.path || req.path,
                        status: statusCode
                    }
                });
            }
        });

        next();
    };
};

export const getHttpMetrics = (): Metric[] => {
    const metrics = [...httpMetrics];
    httpMetrics.length = 0; // Limpa as métricas após retorná-las
    return metrics;
};