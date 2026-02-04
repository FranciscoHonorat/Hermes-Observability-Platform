/**
 * Metric Types - Core metric data structures
 */

export enum MetricType {
    COUNTER = 'counter',
    GAUGE = 'gauge',
    HISTOGRAM = 'histogram',
    SUMMARY = 'summary'
}

export enum MetricUnit {
    BYTES = 'bytes',
    MILLISECONDS = 'milliseconds',
    SECONDS = 'seconds',
    PERCENT = 'percent',
    COUNT = 'count',
    REQUESTS_PER_SECOND = 'rps'
}

export interface MetricLabel {
    [key: string]: string | number;
}

export interface Metric {
    name: string;
    type: MetricType;
    value: number;
    unit: MetricUnit;
    timestamp: number;
    labels?: MetricLabel;
    metadata?: {
        source?: string;
        service?: string;
        environment?: string;
        host?: string;
        version?: string;
    };
}

export interface MetricBatch {
    metrics: Metric[];
    batchId?: string;
    timestamp: number;
}

export interface AggregatedMetric extends Metric {
      count: number;
  sum: number;
  min: number;
  max: number;
  avg: number;
  p50?: number;
  p95?: number;
  p99?: number;
}