import { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { SpanHandle, startSpan } from './span';

const SPAN_SYMBOL = Symbol('hermesSpan');

interface TracedRequestConfig extends InternalAxiosRequestConfig {
    [SPAN_SYMBOL]?: SpanHandle;
}

/**
 * Opt-in instrumentation for an axios instance: injects the current trace's
 * `traceparent` header on every outgoing request and wraps it in a child
 * span, so a call to another Hermes-instrumented service continues the same
 * trace instead of starting a new, disconnected one. This — not the
 * per-request timing httpTracingMiddleware alone provides — is what makes
 * tracing actually *distributed*.
 *
 * Deliberately opt-in rather than a global axios patch: call it on whatever
 * axios instance your app already uses for outgoing calls.
 *   agent.instrumentAxios(myAxiosInstance);
 */
export function instrumentAxios(axiosInstance: AxiosInstance): void {
    axiosInstance.interceptors.request.use((config: TracedRequestConfig) => {
        const method = (config.method || 'get').toUpperCase();
        const span = startSpan(`http.client ${method}`, {
            'http.method': method,
            ...(config.url ? { 'http.url': config.url } : {})
        });

        config.headers = config.headers ?? ({} as any);
        config.headers['traceparent'] = `00-${span.traceId}-${span.spanId}-01`;
        config[SPAN_SYMBOL] = span;

        return config;
    });

    axiosInstance.interceptors.response.use(
        (response) => {
            const span = (response.config as TracedRequestConfig)[SPAN_SYMBOL];
            span?.setAttribute('http.status_code', response.status);
            span?.end(response.status >= 400 ? 'error' : 'ok');
            return response;
        },
        (error) => {
            const span = (error.config as TracedRequestConfig | undefined)?.[SPAN_SYMBOL];
            if (span) {
                if (error.response) {
                    span.setAttribute('http.status_code', error.response.status);
                }
                span.end('error');
            }
            return Promise.reject(error);
        }
    );
}
