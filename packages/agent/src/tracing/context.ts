import { AsyncLocalStorage } from 'async_hooks';

export interface SpanContext {
    traceId: string;
    spanId: string;
}

export const spanContextStorage = new AsyncLocalStorage<SpanContext>();

export function getCurrentSpanContext(): SpanContext | undefined {
    return spanContextStorage.getStore();
}
