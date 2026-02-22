"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.HTTP_STATUS_CODES = exports.METRIC_NAMES = exports.REDIS_METRICS_STREAM = exports.REDIS_ALERTS_KEY = exports.DEFAULT_RETENTION_DAYS = exports.DEFAULT_BATCH_SIZE = exports.DEFAULT_FLUSH_INTERVAL = exports.DEFAULT_COLLECT_INTERVAL = void 0;
exports.DEFAULT_COLLECT_INTERVAL = 10000; // 10 seconds
exports.DEFAULT_FLUSH_INTERVAL = 5000; // 5 seconds
exports.DEFAULT_BATCH_SIZE = 100;
exports.DEFAULT_RETENTION_DAYS = 30;
exports.REDIS_ALERTS_KEY = 'hermes:alerts:pending';
exports.REDIS_METRICS_STREAM = 'hermes:metrics:stream';
exports.METRIC_NAMES = {
    CPU_USAGE: 'system.cpu.usage',
    MEMORY_USAGE: 'system.memory.usage',
    MEMORY_TOTAL: 'system.memory.total',
    HTTP_REQUESTS_TOTAL: 'http.requests.total',
    HTTP_REQUEST_DURATION: 'http.request.duration',
    HTTP_ERRORS_TOTAL: 'http.errors.total',
    PROCESS_UPTIME: 'process.uptime',
    EVENT_LOOP_LAG: 'nodejs.eventloop.lag'
};
exports.HTTP_STATUS_CODES = {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    UNPROCESSABLE_ENTITY: 422,
    INTERNAL_SERVER_ERROR: 500,
    SERVICE_UNAVAILABLE: 503
};
//# sourceMappingURL=applicationConstants.js.map