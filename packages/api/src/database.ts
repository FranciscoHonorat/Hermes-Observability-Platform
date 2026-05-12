import { Pool } from 'pg';
import { Logger } from '@hermes/shared';
import { config } from './config';

const logger = new Logger('Database');

// Criar pool de conexões
export const pool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    user: config.database.user,
    password: config.database.password,
    max: config.database.poolSize
});

// Event handlers
pool.on('connect', () => {
    logger.debug('New database connection established');
});

pool.on('error', (err) => {
    logger.error('Database pool error:', err);
});

// Testar conexão
export async function testConnection(): Promise<boolean> {
    try {
        const result = await pool.query('SELECT NOW()');
        logger.info('Database connection test successful', {
            timestamp: result.rows[0].now
        });
        return true;
    } catch (error: any) {
        logger.error('Database connection test failed:', error);
        return false;
    }
}

// Fechar pool
export async function closePool(): Promise<void> {
    await pool.end();
    logger.info('Database pool closed');
}
