import dotenv from 'dotenv';

dotenv.config();

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

const isProduction = process.env.NODE_ENV === 'production';

export const config = {
    port: parseInt(process.env.ADMIN_PORT || '4002', 10),
    database: {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
        database: process.env.POSTGRES_DB || 'hermes_observability',
        user: process.env.POSTGRES_USER || 'hermes',
        password: requireEnv('POSTGRES_PASSWORD'),
        poolSize: parseInt(process.env.DB_POOL_SIZE || '10', 10)
    },
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10)
    },
    cors: {
        origin: process.env.CORS_ORIGIN
            ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
            : (isProduction ? requireEnv('CORS_ORIGIN') : '*'),
        credentials: true
    },
    jwtSecretRequired: isProduction ? requireEnv('JWT_SECRET') : process.env.JWT_SECRET,
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
        max: parseInt(process.env.RATE_LIMIT_MAX || '120', 10)
    },
    environment: process.env.NODE_ENV || 'development'
};
