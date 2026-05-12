import dotenv from 'dotenv';

dotenv.config();

export const config = {
    port: parseInt(process.env.API_PORT || '3000', 10),
    database: {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
        database: process.env.POSTGRES_DB || 'hermes_observability',
        user: process.env.POSTGRES_USER || 'hermes',
        password: process.env.POSTGRES_PASSWORD || 'hermes',
        poolSize: parseInt(process.env.DB_POOL_SIZE || '10', 10)
    },
    cors: {
        origin: process.env.CORS_ORIGIN || '*',
        credentials: true
    },
    environment: process.env.NODE_ENV || 'development'
};
