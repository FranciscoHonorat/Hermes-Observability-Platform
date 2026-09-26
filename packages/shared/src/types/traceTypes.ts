
export type SpanStatus = 'ok' | 'error';

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  serviceName: string;
  operationName: string;
  startTime: number;
  duration: number;
  status: SpanStatus;
  tenantId?: number;
  attributes?: Record<string, string | number | boolean>;
}

export interface SpanBatch {
  spans: Span[];
  timestamp: number;
}
