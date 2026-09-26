
export type LogEntryLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  serviceName: string;
  level: LogEntryLevel;
  message: string;
  timestamp: number;
  tenantId?: number;
  traceId?: string;
  spanId?: string;
  attributes?: Record<string, string | number | boolean>;
}

export interface LogBatch {
  logs: LogEntry[];
  timestamp: number;
}
