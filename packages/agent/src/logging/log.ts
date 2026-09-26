import { LogEntry, LogEntryLevel } from '@hermes/shared';
import { getCurrentSpanContext } from '../tracing/context';

const completedLogs: LogEntry[] = [];

export function log(level: LogEntryLevel, message: string, attributes?: Record<string, string | number | boolean>): void {
    const span = getCurrentSpanContext();

    completedLogs.push({
        serviceName: '',
        level,
        message,
        timestamp: Date.now(),
        traceId: span?.traceId,
        spanId: span?.spanId,
        attributes
    });
}

export const debug = (message: string, attributes?: Record<string, string | number | boolean>) => log('debug', message, attributes);
export const info = (message: string, attributes?: Record<string, string | number | boolean>) => log('info', message, attributes);
export const warn = (message: string, attributes?: Record<string, string | number | boolean>) => log('warn', message, attributes);
export const error = (message: string, attributes?: Record<string, string | number | boolean>) => log('error', message, attributes);

export function captureException(err: Error, attributes?: Record<string, string | number | boolean>): void {
    log('error', err.message, {
        ...attributes,
        'error.name': err.name,
        ...(err.stack ? { 'error.stack': err.stack } : {})
    });
}

export function getCompletedLogs(): LogEntry[] {
    const logs = [...completedLogs];
    completedLogs.length = 0;
    return logs;
}
