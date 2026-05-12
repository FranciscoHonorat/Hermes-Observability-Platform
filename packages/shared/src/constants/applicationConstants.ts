export const DEFAULT_COLLECT_INTERVAL = 10000; // 10 seconds
export const DEFAULT_FLUSH_INTERVAL = 5000; // 5 seconds
export const DEFAULT_BATCH_SIZE = 100;
export const DEFAULT_RETENTION_DAYS = 30;

export const REDIS_ALERTS_KEY = 'hermes:alerts:pending';
export const REDIS_METRICS_STREAM = 'hermes:metrics:stream';

export const METRIC_NAMES = {
  CPU_USAGE: 'system.cpu.usage',
  MEMORY_USAGE: 'system.memory.usage',
  MEMORY_TOTAL: 'system.memory.total',
  HTTP_REQUESTS_TOTAL: 'http.requests.total',
  HTTP_REQUEST_DURATION: 'http.request.duration',
  HTTP_ERRORS_TOTAL: 'http.errors.total',
  PROCESS_UPTIME: 'process.uptime',
  EVENT_LOOP_LAG: 'nodejs.eventloop.lag'
} as const;

export const HTTP_STATUS_CODES = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500,
  SERVICE_UNAVAILABLE: 503
} as const;