import dotenv from 'dotenv';

dotenv.config();

export const config = {
    port: parseInt(process.env.COLLECTOR_PORT || '4318', 10),
    redis: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379', 10)
    },
    maxBatchSize: parseInt(process.env.MAX_BATCH_SIZE || '1000', 10),
    environment: process.env.NODE_ENV || 'development'
};
