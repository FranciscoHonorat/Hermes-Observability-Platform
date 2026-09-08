/**
 * Trace Types - Distributed tracing spans
 */

export type SpanStatus = 'ok' | 'error';

export interface Span {
  traceId: string;        // 32 hex chars (W3C trace-context format)
  spanId: string;         // 16 hex chars
  parentSpanId?: string;  // 16 hex chars, absent for the root span
  serviceName: string;
  operationName: string;
  startTime: number;      // epoch ms
  duration: number;       // ms
  status: SpanStatus;
  // Set server-side by the Collector's apiKeyAuth — see docs/adr/0002-*.md.
  tenantId?: number;
  attributes?: Record<string, string | number | boolean>;
}

export interface SpanBatch {
  spans: Span[];
  timestamp: number;
}
