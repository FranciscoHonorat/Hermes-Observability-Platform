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
                serviceName: '',
                operationName,
                startTime,
                duration: Date.now() - startTime,
                status,
                attributes: Object.keys(spanAttributes).length > 0 ? spanAttributes : undefined
            });
        }
    };
}

export function startSpan(
    operationName: string,
    attributes?: Record<string, string | number | boolean>
): SpanHandle {
    const parent = getCurrentSpanContext();
    const traceId = parent?.traceId ?? generateTraceId();
    return createHandle(traceId, generateSpanId(), parent?.spanId, operationName, attributes);
}

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
