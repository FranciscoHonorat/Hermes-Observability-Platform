export declare const DEFAULT_COLLECT_INTERVAL = 10000;
export declare const DEFAULT_FLUSH_INTERVAL = 5000;
export declare const DEFAULT_BATCH_SIZE = 100;
export declare const DEFAULT_RETENTION_DAYS = 30;
export declare const REDIS_ALERTS_KEY = "hermes:alerts:pending";
export declare const REDIS_METRICS_STREAM = "hermes:metrics:stream";
export declare const METRIC_NAMES: {
    readonly CPU_USAGE: "system.cpu.usage";
    readonly MEMORY_USAGE: "system.memory.usage";
    readonly MEMORY_TOTAL: "system.memory.total";
    readonly HTTP_REQUESTS_TOTAL: "http.requests.total";
    readonly HTTP_REQUEST_DURATION: "http.request.duration";
    readonly HTTP_ERRORS_TOTAL: "http.errors.total";
    readonly PROCESS_UPTIME: "process.uptime";
    readonly EVENT_LOOP_LAG: "nodejs.eventloop.lag";
};
export declare const HTTP_STATUS_CODES: {
    readonly OK: 200;
    readonly CREATED: 201;
    readonly BAD_REQUEST: 400;
    readonly UNAUTHORIZED: 401;
    readonly FORBIDDEN: 403;
    readonly NOT_FOUND: 404;
    readonly UNPROCESSABLE_ENTITY: 422;
    readonly INTERNAL_SERVER_ERROR: 500;
    readonly SERVICE_UNAVAILABLE: 503;
};
//# sourceMappingURL=applicationConstants.d.ts.map