/**
 * Configuration Types
 */

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  poolSize?: number;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  streamKey?: string;
}

export interface CollectorConfig {
  port: number;
  host?: string;
  maxBatchSize?: number;
  flushInterval?: number;
}

export interface AgentConfig {
  collectorUrl: string;
  collectInterval: number;
  serviceName: string;
  environment: string;
  host?: string;
  labels?: Record<string, string>;
}

export interface ProcessorConfig {
  redisConfig: RedisConfig;
  databaseConfig: DatabaseConfig;
  batchSize?: number;
  processingInterval?: number;
}

export interface ApiConfig {
  port: number;
  host?: string;
  corsOrigins?: string[];
  jwtSecret?: string;
  rateLimitWindow?: number;
  rateLimitMax?: number;
}