/**
 * Log Types - Log aggregation entries
 */

// Named LogEntryLevel (not LogLevel) to avoid colliding with the
// LogLevel enum in utilities/simpleLogger.ts, the unrelated internal
// service logger used throughout this codebase for stdout logging.
export type LogEntryLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  serviceName: string;
  level: LogEntryLevel;
  message: string;
  timestamp: number;      // epoch ms
  traceId?: string;       // correlates with a Span, if logged inside one
  spanId?: string;
  attributes?: Record<string, string | number | boolean>;
}

export interface LogBatch {
  logs: LogEntry[];
  timestamp: number;
}
