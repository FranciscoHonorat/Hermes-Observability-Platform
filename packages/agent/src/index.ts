import { MetricsCollector, createAgent } from './collector';
import { httpMiddleware } from './metrics/http';
import { Metric, MetricType, MetricUnit, Span, SpanStatus, LogEntry, LogEntryLevel } from '@hermes/shared';
import { loadConfig } from './config';
import { startSpan } from './tracing/span';
import { httpTracingMiddleware } from './tracing/httpTracingMiddleware';
import { instrumentAxios } from './tracing/instrumentAxios';
import { log, debug, info, warn, error, captureException } from './logging/log';

export { MetricsCollector, createAgent };
export { httpMiddleware };
export { MetricType, MetricUnit };
export type { Metric };

export { startSpan, httpTracingMiddleware, instrumentAxios };
export type { Span, SpanStatus };
export type { SpanHandle } from './tracing/span';

export { log, debug, info, warn, error, captureException };
export type { LogEntry, LogEntryLevel };

export { loadConfig };

let instance: MetricsCollector | null = null;

function getAgent(): MetricsCollector {
    if (!instance) {
        instance = createAgent();
    }
    return instance;
}

export function recordMetric(metric: Metric): void {
    getAgent().recordMetric(metric);
}

export function increment(name: string, value: number = 1, labels?: Record<string, any>): void {
    recordMetric({
        name,
        type: MetricType.COUNTER,
        value,
        unit: MetricUnit.COUNT,
        timestamp: Date.now(),
        labels
    });
}

export function gauge(name: string, value: number, unit: MetricUnit = MetricUnit.COUNT, labels?: Record<string, any>): void {
    recordMetric({
        name,
        type: MetricType.GAUGE,
        value,
        unit,
        timestamp: Date.now(),
        labels
    });
}

export function histogram(name: string, value: number, unit: MetricUnit = MetricUnit.MILLISECONDS, labels?: Record<string, any>): void {
    recordMetric({
        name,
        type: MetricType.HISTOGRAM,
        value,
        unit,
        timestamp: Date.now(),
        labels
    });
}
