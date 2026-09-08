import { Request, Response, NextFunction } from 'express';
import { generateTraceId, startSpanWithIds } from './span';

const TRACEPARENT_RE = /^[0-9a-f]{2}-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/;

interface IncomingTraceContext {
    traceId: string;
    parentSpanId: string;
}

function parseTraceparent(header: string | undefined): IncomingTraceContext | undefined {
    if (!header) return undefined;
    const match = TRACEPARENT_RE.exec(header.trim());
    if (!match) return undefined;
    return { traceId: match[1], parentSpanId: match[2] };
}

/**
 * Starts (or continues, via the W3C `traceparent` header) a trace for every
 * incoming request. Runs downstream handlers with this span as the current
 * async context, so any `startSpan()` call they make — a DB query, a call
 * wrapped with `instrumentAxios` — automatically nests under it.
 */
export const httpTracingMiddleware = () => {
    return (req: Request, res: Response, next: NextFunction) => {
        const incoming = parseTraceparent(req.header('traceparent'));
        const traceId = incoming?.traceId ?? generateTraceId();

        const span = startSpanWithIds(traceId, incoming?.parentSpanId, `${req.method} ${req.route?.path || req.path}`, {
            'http.method': req.method,
            'http.route': req.route?.path || req.path
        });

        // The span this request created is now visible to any nested
        // startSpan()/instrumentAxios() call for the rest of this async
        // chain — including the response header set here for debuggability.
        res.setHeader('traceparent', `00-${span.traceId}-${span.spanId}-01`);

        res.on('finish', () => {
            span.setAttribute('http.status_code', res.statusCode);
            span.end(res.statusCode >= 400 ? 'error' : 'ok');
        });

        next();
    };
};
