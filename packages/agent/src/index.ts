import { MetricsCollector, createAgent } from './collector';
import { httpMiddleware } from './metrics/http';
import { Metric, MetricType, MetricUnit, Span, SpanStatus, LogEntry, LogEntryLevel } from '@hermes/shared';
import { loadConfig } from './config';
import { startSpan } from './tracing/span';
import { httpTracingMiddleware } from './tracing/httpTracingMiddleware';
import { instrumentAxios } from './tracing/instrumentAxios';
import { log, debug, info, warn, error, captureException } from './logging/log';

// Re-exports principais
export { MetricsCollector, createAgent };
export { httpMiddleware };
export { MetricType, MetricUnit };
export type { Metric };

// Tracing
export { startSpan, httpTracingMiddleware, instrumentAxios };
export type { Span, SpanStatus };
export type { SpanHandle } from './tracing/span';

// Logging
export { log, debug, info, warn, error, captureException };
export type { LogEntry, LogEntryLevel };

// Export do config loader para usuários avançados
export { loadConfig };

// API simplificada para métricas customizadas
let instance: MetricsCollector | null = null;

/**
 * Obtém ou cria a instância do agent
 */
function getAgent(): MetricsCollector {
    if (!instance) {
        instance = createAgent();
    }
    return instance;
}

/**
 * Registra uma métrica customizada
 */
export function recordMetric(metric: Metric): void {
    getAgent().recordMetric(metric);
}

/**
 * Incrementa um contador
 */
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

/**
 * Define um gauge (valor atual)
 */
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

/**
 * Registra uma medida de histograma (duração, tamanho, etc)
 */
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
