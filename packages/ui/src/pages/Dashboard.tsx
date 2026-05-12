import { useState, useEffect } from 'react';
import { metricsApi, applicationsApi, TimeseriesData } from '../api/client';
import Card from '../components/Card';
import MetricChart from '../components/MetricChart';
import TimeRangeSelector, { timeRanges } from '../components/TimeRangeSelector';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { subHours, subDays } from 'date-fns';

const Dashboard = () => {
  const [timeRange, setTimeRange] = useState('1h');
  const [selectedApp, setSelectedApp] = useState<string>('');
  const [applications, setApplications] = useState<string[]>([]);
  const [metricsData, setMetricsData] = useState<Record<string, TimeseriesData[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadApplications();
  }, []);

  useEffect(() => {
    if (timeRange) {
      loadMetrics();
    }
  }, [timeRange, selectedApp]);

  const loadApplications = async () => {
    try {
      const apps = await applicationsApi.getApplications();
      setApplications(apps.map(app => app.name));
    } catch (err) {
      console.error('Failed to load applications:', err);
    }
  };

  const loadMetrics = async () => {
    setLoading(true);
    setError(null);
    try {
      const range = timeRanges.find(r => r.value === timeRange);
      if (!range) return;

      const endTime = new Date().toISOString();
      const startTime = range.hours > 48 
        ? subDays(new Date(), Math.floor(range.hours / 24)).toISOString()
        : subHours(new Date(), range.hours).toISOString();

      // Determine interval based on time range
      let interval = '1 minute';
      if (range.hours > 24) interval = '1 hour';
      if (range.hours > 168) interval = '1 day';

      const metricNames = [
        'cpu_usage_percent',
        'memory_usage_percent',
        'event_loop_lag_ms',
        'http_requests_total',
        'http_request_duration_ms'
      ];

      const dataPromises = metricNames.map(async (metricName) => {
        const data = await metricsApi.getTimeseries({
          appName: selectedApp || undefined,
          metricName,
          startTime,
          endTime,
          interval
        });
        return { metricName, data };
      });

      const results = await Promise.all(dataPromises);
      const newMetricsData: Record<string, TimeseriesData[]> = {};
      results.forEach(({ metricName, data }) => {
        newMetricsData[metricName] = data;
      });

      setMetricsData(newMetricsData);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load metrics');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Dashboard</h1>
        <div className="flex items-center space-x-4">
          <select
            value={selectedApp}
            onChange={(e) => setSelectedApp(e.target.value)}
            className="border border-gray-300 rounded-md px-4 py-2 focus:ring-primary focus:border-primary"
          >
            <option value="">All Applications</option>
            {applications.map(app => (
              <option key={app} value={app}>{app}</option>
            ))}
          </select>
          <TimeRangeSelector selected={timeRange} onChange={setTimeRange} />
        </div>
      </div>

      {error && <ErrorMessage message={error} onRetry={loadMetrics} />}

      {loading ? (
        <LoadingSpinner message="Loading metrics..." />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <MetricChart
              data={metricsData['cpu_usage_percent'] || []}
              title="CPU Usage"
              unit="%"
              color="rgb(59, 130, 246)"
            />
          </Card>

          <Card>
            <MetricChart
              data={metricsData['memory_usage_percent'] || []}
              title="Memory Usage"
              unit="%"
              color="rgb(139, 92, 246)"
            />
          </Card>

          <Card>
            <MetricChart
              data={metricsData['event_loop_lag_ms'] || []}
              title="Event Loop Lag"
              unit="ms"
              color="rgb(245, 158, 11)"
            />
          </Card>

          <Card>
            <MetricChart
              data={metricsData['http_requests_total'] || []}
              title="HTTP Requests"
              unit="req/s"
              color="rgb(16, 185, 129)"
            />
          </Card>

          <Card className="lg:col-span-2">
            <MetricChart
              data={metricsData['http_request_duration_ms'] || []}
              title="HTTP Request Duration"
              unit="ms"
              color="rgb(239, 68, 68)"
            />
          </Card>
        </div>
      )}

      {!loading && Object.keys(metricsData).length === 0 && (
        <Card>
          <p className="text-center text-gray-500 py-8">
            No metrics data available for the selected time range.
          </p>
        </Card>
      )}
    </div>
  );
};

export default Dashboard;
