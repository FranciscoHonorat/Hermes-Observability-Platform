import dotenv from 'dotenv';
import { DatabaseConfig, RedisConfig } from '@hermes/shared';

dotenv.config();

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

export const config = {
    database: {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
        database: process.env.POSTGRES_DB || 'hermes_observability',
        user: process.env.POSTGRES_USER || 'hermes',
        password: requireEnv('POSTGRES_PASSWORD'),
        poolSize: 10
    } as DatabaseConfig,

    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10)
    } as RedisConfig,

    processor: {
        consumerGroup: 'processor-group',
        tracesConsumerGroup: 'traces-processor-group',
        logsConsumerGroup: 'logs-processor-group',
        consumerName: 'processor-1',
        batchSize: 10,
        blockTimeout: 5000,
        pollInterval: 5000,
    },

    smtp: {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.SMTP_PORT || '587', 10),
        secure: false,
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASSWORD
        },
        from: process.env.SMTP_FROM || 'alerts@hermes.io'
    },

    alertCheckInterval: 30000
};