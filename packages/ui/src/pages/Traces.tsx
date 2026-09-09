import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { tracesApi, applicationsApi, Trace } from '../api/client';
import Card from '../components/Card';
import TimeRangeSelector, { timeRanges } from '../components/TimeRangeSelector';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { format, subHours, subDays } from 'date-fns';

const Traces = () => {
  // Pre-selects the service filter when arriving from a link that names one
  // (e.g. ServiceGraph's node click, /traces?service=payment-service).
  const [searchParams] = useSearchParams();
  const [timeRange, setTimeRange] = useState('1h');
  const [selectedService, setSelectedService] = useState<string>(searchParams.get('service') || '');
  const [services, setServices] = useState<string[]>([]);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadServices();
  }, []);

  useEffect(() => {
    loadTraces();
  }, [timeRange, selectedService]);

  const loadServices = async () => {
    try {
      const apps = await applicationsApi.getApplications();
      setServices(apps.map(app => app.name));
    } catch (err) {
      console.error('Failed to load services:', err);
    }
  };

  const loadTraces = async () => {
    setLoading(true);
    setError(null);
    try {
      const range = timeRanges.find(r => r.value === timeRange);
      if (!range) return;

      const endTime = new Date().toISOString();
      const startTime = range.hours > 48
        ? subDays(new Date(), Math.floor(range.hours / 24)).toISOString()
        : subHours(new Date(), range.hours).toISOString();

      const data = await tracesApi.getTraces({
        serviceName: selectedService || undefined,
        startTime,
        endTime,
        limit: 100
      });

      setTraces(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load traces');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Traces</h1>
        <div className="flex items-center space-x-4">
          <select
            value={selectedService}
            onChange={(e) => setSelectedService(e.target.value)}
            className="border border-gray-300 rounded-md px-4 py-2 focus:ring-primary focus:border-primary"
          >
            <option value="">All Services</option>
            {services.map(service => (
              <option key={service} value={service}>{service}</option>
            ))}
          </select>
          <TimeRangeSelector selected={timeRange} onChange={setTimeRange} />
        </div>
      </div>

      {error && <ErrorMessage message={error} onRetry={loadTraces} />}

      {loading ? (
        <LoadingSpinner message="Loading traces..." />
      ) : traces.length === 0 ? (
        <Card>
          <p className="text-center text-gray-500 py-8">
            No traces found for the selected time range. Instrument a request with
            httpTracingMiddleware() (or startSpan()) from @hermes/agent to see one here.
          </p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trace ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Root Operation</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Start Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Spans</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {traces.map((trace) => (
                  <tr key={trace.traceId} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-primary">
                      <Link to={`/traces/${trace.traceId}`}>{trace.traceId.slice(0, 12)}…</Link>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {trace.rootOperation || '—'}
                      {trace.rootService && (
                        <span className="text-gray-500"> · {trace.rootService}</span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {format(new Date(trace.startTime), 'MMM dd, yyyy HH:mm:ss')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {trace.durationMs.toFixed(1)}ms
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {trace.spanCount}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded ${
                        trace.hasError ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {trace.hasError ? 'Error' : 'OK'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default Traces;
