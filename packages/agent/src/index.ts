import { MetricsCollector, createAgent } from './collector';
import { httpMiddleware } from './metrics/http';
import { Metric, MetricType, MetricUnit } from '@hermes/shared';
import { loadConfig } from './config';

// Re-exports principais
export { MetricsCollector, createAgent };
export { httpMiddleware };
export { MetricType, MetricUnit };
export type { Metric };

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
