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
    port: parseInt(process.env.API_PORT || '3000', 10),
    database: {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
        database: process.env.POSTGRES_DB || 'hermes_observability',
        user: process.env.POSTGRES_USER || 'hermes',
        password: requireEnv('POSTGRES_PASSWORD'),
        poolSize: parseInt(process.env.DB_POOL_SIZE || '10', 10)
    },
    cors: {
        // In production CORS_ORIGIN must be set explicitly (a comma-separated
        // allow-list); wildcard + credentials is a known misconfiguration, so
        // we refuse to fall back to '*' once NODE_ENV=production.
        origin: process.env.CORS_ORIGIN
            ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
            : (isProduction ? requireEnv('CORS_ORIGIN') : '*'),
        credentials: true
    },
    auth: {
        // Bearer token required on alert-mutating routes (POST/PUT/DELETE).
        // Leave unset only for local development; the API refuses to start
        // without it in production.
        adminToken: isProduction ? requireEnv('API_ADMIN_TOKEN') : process.env.API_ADMIN_TOKEN
    },
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
        max: parseInt(process.env.RATE_LIMIT_MAX || '300', 10)
    },
    environment: process.env.NODE_ENV || 'development'
};
