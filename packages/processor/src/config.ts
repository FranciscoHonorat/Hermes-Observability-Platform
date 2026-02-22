import dotenv from 'dotenv';
import { DatabaseConfig, RedisConfig } from '@hermes/shared';

dotenv.config();

// Configurações para o serviço de processamento 
export const config = {
    // Configurações do banco de dados PostgreSQL
    database: {
        host: process.env.POSTGRES_HOST || 'localhost',
        port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
        database: process.env.POSTGRES_DB || 'hermes_observability',
        user: process.env.POSTGRES_USER || 'hermes',
        password: process.env.POSTGRES_PASSWORD || 'hermes',
        poolSize: 10
    } as DatabaseConfig,

    // Configurações do Redis para filas e cache
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10)
    } as RedisConfig,

    // Configurações do consumidor de mensagens
    processor: {
        consumerGroup: 'processor-group',
        consumerName: 'processor-1',
        batchSize: 10,
        blockTimeout: 5000,
        pollInterval: 5000, // ms
    },

    // Configurações do SMTP para envio de alertas por email
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

    // Configurações para o intervalo de verificação de alertas
    alertCheckInterval: 30000 // 30 segundos
};