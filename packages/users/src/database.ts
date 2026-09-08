import { Pool } from 'pg';
import { Logger } from '@hermes/shared';
import { config } from './config';

const logger = new Logger('Database');

export const pool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    user: config.database.user,
    password: config.database.password,
    max: config.database.poolSize
});

pool.on('error', (err) => {
    logger.error('Database pool error:', err);
});

export async function testConnection(): Promise<boolean> {
    try {
        await pool.query('SELECT NOW()');
        return true;
    } catch (error: any) {
        logger.error('Database connection test failed:', error);
        return false;
    }
}

export async function closePool(): Promise<void> {
    await pool.end();
}
