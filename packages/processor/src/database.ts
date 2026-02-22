import { Pool } from 'pg';
import { Logger } from '@hermes/shared';
import { config } from './config';

const logger = new Logger('Database');

// Configuração do pool de conexões com o banco de dados PostgreSQL
export const pool = new Pool({
    host: config.database.host,
    port: config.database.port,
    database: config.database.database,
    user: config.database.user,
    password: config.database.password,
    max: config.database.poolSize
});

// Testa a conexão ao iniciar o serviço
pool.on('error', (err) => {
    logger.error('Erro na conexão com o banco de dados', err);
});

// Função para testar a conexão com o banco de dados
export async function testConnection(): Promise<boolean> {
    try {
        const result = await pool.query('SELECT NOW()');
        logger.info('Conexão com o banco de dados testada com sucesso:', { time: result.rows[0] });
        return true;
    } catch (err) {
        logger.error('Falha ao testar conexão com o banco de dados:', err);
        return false;
    }
}

// Função para fechar o pool de conexões ao encerrar o serviço
export async function closePool(): Promise<void> {
    await pool.end();
    logger.info('Database pool fechado');
}