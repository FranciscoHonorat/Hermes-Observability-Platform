import { Router, Request, Response } from 'express';
import { pool } from '../database';
import { Logger } from '@hermes/shared';

const router = Router();
const logger = new Logger('MetricsAPI');

// GET /api/v1/metrics - Buscar métricas com filtros
router.get('/', async (req: Request, res: Response) => {
    try {
        const { 
            appName, 
            metricName, 
            from, 
            to, 
            limit = '1000',
            offset = '0'
        } = req.query;

        let query = `
            SELECT 
                time,
                app_name,
                metric_name,
                metric_type,
                value,
                labels
            FROM metrics
            WHERE 1=1
        `;
        const params: any[] = [];
        let paramIndex = 1;

        if (appName) {
            query += ` AND app_name = $${paramIndex++}`;
            params.push(appName);
        }

        if (metricName) {
            query += ` AND metric_name = $${paramIndex++}`;
            params.push(metricName);
        }

        if (from) {
            query += ` AND time >= to_timestamp($${paramIndex++})`;
            params.push(Number(from) / 1000);
        }

        if (to) {
            query += ` AND time <= to_timestamp($${paramIndex++})`;
            params.push(Number(to) / 1000);
        }

        query += ` ORDER BY time DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        params.push(Number(limit), Number(offset));

        const result = await pool.query(query, params);

        logger.debug(`Fetched ${result.rows.length} metrics`, {
            appName,
            metricName,
            from,
            to
        });

        res.json({
            metrics: result.rows,
            count: result.rows.length,
            offset: Number(offset),
            limit: Number(limit)
        });

    } catch (error: any) {
        logger.error('Error fetching metrics:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/v1/metrics/timeseries - Dados agregados por tempo
router.get('/timeseries', async (req: Request, res: Response) => {
    try {
        const { 
            appName, 
            metricName, 
            interval = '1 minute', 
            from, 
            to 
        } = req.query;

        if (!appName || !metricName || !from || !to) {
            return res.status(400).json({ 
                error: 'Missing required parameters: appName, metricName, from, to' 
            });
        }

        const query = `
            SELECT 
                time_bucket($1, time) AS bucket,
                app_name,
                metric_name,
                AVG(value) as avg_value,
                MAX(value) as max_value,
                MIN(value) as min_value,
                COUNT(*) as count
            FROM metrics
            WHERE app_name = $2
              AND metric_name = $3
              AND time >= to_timestamp($4)
              AND time <= to_timestamp($5)
            GROUP BY bucket, app_name, metric_name
            ORDER BY bucket ASC
        `;

        const result = await pool.query(query, [
            interval,
            appName,
            metricName,
            Number(from) / 1000,
            Number(to) / 1000
        ]);

        logger.debug(`Fetched ${result.rows.length} timeseries points`, {
            appName,
            metricName,
            interval
        });

        res.json({
            timeseries: result.rows,
            interval,
            count: result.rows.length
        });

    } catch (error: any) {
        logger.error('Error fetching timeseries:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/v1/metrics/names - Listar nomes de métricas disponíveis
router.get('/names', async (req: Request, res: Response) => {
    try {
        const { appName } = req.query;

        let query = `
            SELECT DISTINCT metric_name, metric_type
            FROM metrics
        `;
        const params: any[] = [];

        if (appName) {
            query += ` WHERE app_name = $1`;
            params.push(appName);
        }

        query += ` ORDER BY metric_name`;

        const result = await pool.query(query, params);

        res.json({
            metrics: result.rows,
            count: result.rows.length
        });

    } catch (error: any) {
        logger.error('Error fetching metric names:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// GET /api/v1/metrics/latest - Últimos valores de cada métrica
router.get('/latest', async (req: Request, res: Response) => {
    try {
        const { appName } = req.query;

        let query = `
            SELECT DISTINCT ON (app_name, metric_name)
                time,
                app_name,
                metric_name,
                metric_type,
                value,
                labels
            FROM metrics
        `;
        const params: any[] = [];

        if (appName) {
            query += ` WHERE app_name = $1`;
            params.push(appName);
        }

        query += ` ORDER BY app_name, metric_name, time DESC`;

        const result = await pool.query(query, params);

        res.json({
            metrics: result.rows,
            count: result.rows.length
        });

    } catch (error: any) {
        logger.error('Error fetching latest metrics:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export { router as metricsRouter };
