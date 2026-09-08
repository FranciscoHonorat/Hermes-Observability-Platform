import { AsyncLocalStorage } from 'async_hooks';

export interface SpanContext {
    traceId: string;
    spanId: string;
}

// Holds the "current span" for whatever async call chain is executing, so a
// child span started deeper in the call stack (a DB query, an outgoing HTTP
// call) automatically picks up the right parent without the caller
// threading IDs through every function signature by hand.
export const spanContextStorage = new AsyncLocalStorage<SpanContext>();

export function getCurrentSpanContext(): SpanContext | undefined {
    return spanContextStorage.getStore();
}
