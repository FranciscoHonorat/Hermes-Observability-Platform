import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { tracesApi, Span } from '../api/client';
import Card from '../components/Card';
import TraceWaterfall from '../components/TraceWaterfall';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { format } from 'date-fns';

const TraceDetail = () => {
  const { traceId } = useParams<{ traceId: string }>();
  const [spans, setSpans] = useState<Span[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (traceId) {
      loadTrace(traceId);
    }
  }, [traceId]);

  const loadTrace = async (id: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await tracesApi.getTrace(id);
      setSpans(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load trace');
    } finally {
      setLoading(false);
    }
  };

  const root = spans.find(s => !s.parentSpanId) || spans[0];
  const traceStart = spans.length > 0 ? Math.min(...spans.map(s => s.startTime)) : 0;
  const traceEnd = spans.length > 0 ? Math.max(...spans.map(s => s.startTime + s.durationMs)) : 0;
  const hasError = spans.some(s => s.status === 'error');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link to="/traces" className="text-sm text-primary hover:underline">← Back to Traces</Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-1 font-mono">{traceId}</h1>
        </div>
      </div>

      {error && <ErrorMessage message={error} onRetry={() => traceId && loadTrace(traceId)} />}

      {loading ? (
        <LoadingSpinner message="Loading trace..." />
      ) : spans.length === 0 ? (
        <Card>
          <p className="text-center text-gray-500 py-8">Trace not found.</p>
        </Card>
      ) : (
        <>
          <Card>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase">Root Operation</div>
                <div className="text-sm font-semibold text-gray-900 mt-1">{root?.operationName || '—'}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase">Service</div>
                <div className="text-sm font-semibold text-gray-900 mt-1">{root?.serviceName || '—'}</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase">Duration</div>
                <div className="text-sm font-semibold text-gray-900 mt-1">{(traceEnd - traceStart).toFixed(1)}ms</div>
              </div>
              <div>
                <div className="text-xs font-medium text-gray-500 uppercase">Status</div>
                <span className={`inline-block mt-1 px-2 py-1 text-xs font-medium rounded ${
                  hasError ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                }`}>
                  {hasError ? 'Error' : 'OK'}
                </span>
              </div>
            </div>
            <div className="text-xs text-gray-500 mt-3">
              {format(new Date(traceStart), 'MMM dd, yyyy HH:mm:ss.SSS')} · {spans.length} span{spans.length === 1 ? '' : 's'}
            </div>
          </Card>

          <Card title="Waterfall">
            <TraceWaterfall spans={spans} />
          </Card>
        </>
      )}
    </div>
  );
};

export default TraceDetail;
