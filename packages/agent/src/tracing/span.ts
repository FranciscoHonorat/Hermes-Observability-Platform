import * as crypto from 'crypto';
import { Span, SpanStatus } from '@hermes/shared';
import { spanContextStorage, getCurrentSpanContext } from './context';

const completedSpans: Span[] = [];

export interface SpanHandle {
    readonly traceId: string;
    readonly spanId: string;
    setAttribute(key: string, value: string | number | boolean): void;
    end(status?: SpanStatus): void;
}

export function generateTraceId(): string {
    return crypto.randomBytes(16).toString('hex');
}

export function generateSpanId(): string {
    return crypto.randomBytes(8).toString('hex');
}

function createHandle(
    traceId: string,
    spanId: string,
    parentSpanId: string | undefined,
    operationName: string,
    attributes?: Record<string, string | number | boolean>
): SpanHandle {
    const startTime = Date.now();
    const spanAttributes: Record<string, string | number | boolean> = { ...attributes };
    let ended = false;

    // Enters this span into the current async context (not a callback-scoped
    // one) so any nested startSpan() call in the same call chain — no extra
    // wrapping required — automatically parents to it.
    spanContextStorage.enterWith({ traceId, spanId });

    return {
        traceId,
        spanId,
        setAttribute(key, value) {
            spanAttributes[key] = value;
        },
        end(status: SpanStatus = 'ok') {
            if (ended) return;
            ended = true;
            completedSpans.push({
                traceId,
                spanId,
                parentSpanId,
                serviceName: '', // filled in by MetricsCollector.collectAndSend() before sending
                operationName,
                startTime,
                duration: Date.now() - startTime,
                status,
                attributes: Object.keys(spanAttributes).length > 0 ? spanAttributes : undefined
            });
        }
    };
}

/**
 * Starts a new span, parented to whatever span is currently active in this
 * async call chain (if any), or the start of a brand new trace if not.
 */
export function startSpan(
    operationName: string,
    attributes?: Record<string, string | number | boolean>
): SpanHandle {
    const parent = getCurrentSpanContext();
    const traceId = parent?.traceId ?? generateTraceId();
    return createHandle(traceId, generateSpanId(), parent?.spanId, operationName, attributes);
}

/**
 * Starts a span with IDs already resolved by the caller (e.g. continuing a
 * trace from an incoming `traceparent` header). Used by
 * httpTracingMiddleware for the request's root/entry span.
 */
export function startSpanWithIds(
    traceId: string,
    parentSpanId: string | undefined,
    operationName: string,
    attributes?: Record<string, string | number | boolean>
): SpanHandle {
    return createHandle(traceId, generateSpanId(), parentSpanId, operationName, attributes);
}

export function getCompletedSpans(): Span[] {
    const spans = [...completedSpans];
    completedSpans.length = 0;
    return spans;
}
