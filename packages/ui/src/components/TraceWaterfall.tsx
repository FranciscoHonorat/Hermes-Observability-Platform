import { Span } from '../api/client';

interface TraceWaterfallProps {
  spans: Span[];
}

function computeDepths(spans: Span[]): Map<string, number> {
  const bySpanId = new Map(spans.map(s => [s.spanId, s]));
  const depths = new Map<string, number>();

  const depthOf = (spanId: string, seen: Set<string> = new Set()): number => {
    if (depths.has(spanId)) return depths.get(spanId)!;
    if (seen.has(spanId)) return 0; // defensive: guards against a malformed parent cycle
    seen.add(spanId);

    const span = bySpanId.get(spanId);
    const parentId = span?.parentSpanId;
    const depth = parentId && bySpanId.has(parentId) ? depthOf(parentId, seen) + 1 : 0;

    depths.set(spanId, depth);
    return depth;
  };

  spans.forEach(s => depthOf(s.spanId));
  return depths;
}

const TraceWaterfall: React.FC<TraceWaterfallProps> = ({ spans }) => {
  if (spans.length === 0) {
    return <p className="text-center text-gray-500 py-8">No spans in this trace.</p>;
  }

  const traceStart = Math.min(...spans.map(s => s.startTime));
  const traceEnd = Math.max(...spans.map(s => s.startTime + s.durationMs));
  const totalDuration = Math.max(traceEnd - traceStart, 1);
  const depths = computeDepths(spans);

  return (
    <div className="space-y-1">
      {spans.map((span) => {
        const depth = depths.get(span.spanId) ?? 0;
        const leftPct = ((span.startTime - traceStart) / totalDuration) * 100;
        const widthPct = Math.max((span.durationMs / totalDuration) * 100, 0.5);
        const isError = span.status === 'error';

        return (
          <div key={span.spanId} className="flex items-center gap-3">
            <div
              className="w-72 flex-shrink-0 truncate text-sm"
              style={{ paddingLeft: `${depth * 16}px` }}
              title={`${span.serviceName} — ${span.operationName}`}
            >
              <span className="font-medium text-gray-900">{span.operationName}</span>
              <span className="text-gray-500"> · {span.serviceName}</span>
            </div>
            <div className="relative flex-1 h-5 bg-gray-100 rounded">
              <div
                className={`absolute h-5 rounded ${isError ? 'bg-danger' : 'bg-primary'}`}
                style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
                title={`${span.operationName} — ${span.durationMs.toFixed(1)}ms${isError ? ' (error)' : ''}`}
              />
            </div>
            <div className="w-20 flex-shrink-0 text-right text-sm text-gray-600">
              {span.durationMs.toFixed(1)}ms
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default TraceWaterfall;
