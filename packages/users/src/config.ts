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
    port: parseInt(process.env.USERS_PORT || '4001', 10),
    database: {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
        database: process.env.POSTGRES_DB || 'hermes_observability',
        user: process.env.POSTGRES_USER || 'hermes',
        password: requireEnv('POSTGRES_PASSWORD'),
        poolSize: parseInt(process.env.DB_POOL_SIZE || '10', 10)
    },
    cors: {
        origin: process.env.CORS_ORIGIN
            ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
            : (isProduction ? requireEnv('CORS_ORIGIN') : '*'),
        credentials: true
    },
    // JWT_SECRET itself is read by @hermes/shared's authUtilities (kept a
    // pure, config-free utility there); this just enforces it's actually
    // set before this service starts in production.
    jwtSecretRequired: isProduction ? requireEnv('JWT_SECRET') : process.env.JWT_SECRET,
    rateLimit: {
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
        max: parseInt(process.env.RATE_LIMIT_MAX || '60', 10) // auth endpoints: tighter than data APIs
    },
    environment: process.env.NODE_ENV || 'development'
};
