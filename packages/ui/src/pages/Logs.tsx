import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { logsApi, applicationsApi, LogEntry } from '../api/client';
import Card from '../components/Card';
import TimeRangeSelector, { timeRanges } from '../components/TimeRangeSelector';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { format, subHours, subDays } from 'date-fns';

const LEVEL_STYLES: Record<string, string> = {
  debug: 'bg-gray-100 text-gray-700',
  info: 'bg-blue-100 text-blue-800',
  warn: 'bg-yellow-100 text-yellow-800',
  error: 'bg-red-100 text-red-800'
};

const Logs = () => {
  const [timeRange, setTimeRange] = useState('1h');
  const [selectedService, setSelectedService] = useState<string>('');
  const [selectedLevel, setSelectedLevel] = useState<string>('');
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [services, setServices] = useState<string[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadServices();
  }, []);

  useEffect(() => {
    loadLogs();
  }, [timeRange, selectedService, selectedLevel, search]);

  const loadServices = async () => {
    try {
      const apps = await applicationsApi.getApplications();
      setServices(apps.map(app => app.name));
    } catch (err) {
      console.error('Failed to load services:', err);
    }
  };

  const loadLogs = async () => {
    setLoading(true);
    setError(null);
    try {
      const range = timeRanges.find(r => r.value === timeRange);
      if (!range) return;

      const endTime = new Date().toISOString();
      const startTime = range.hours > 48
        ? subDays(new Date(), Math.floor(range.hours / 24)).toISOString()
        : subHours(new Date(), range.hours).toISOString();

      const data = await logsApi.getLogs({
        appName: selectedService || undefined,
        level: selectedLevel || undefined,
        search: search || undefined,
        startTime,
        endTime,
        limit: 200
      });

      setLogs(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput.trim());
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center flex-wrap gap-4">
        <h1 className="text-3xl font-bold text-gray-900">Logs</h1>
        <div className="flex items-center space-x-4 flex-wrap gap-2">
          <form onSubmit={handleSearchSubmit}>
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search message…"
              className="border border-gray-300 rounded-md px-4 py-2 focus:ring-primary focus:border-primary w-56"
            />
          </form>
          <select
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value)}
            className="border border-gray-300 rounded-md px-4 py-2 focus:ring-primary focus:border-primary"
          >
            <option value="">All Levels</option>
            <option value="debug">Debug</option>
            <option value="info">Info</option>
            <option value="warn">Warn</option>
            <option value="error">Error</option>
          </select>
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

      {error && <ErrorMessage message={error} onRetry={loadLogs} />}

      {loading ? (
        <LoadingSpinner message="Loading logs..." />
      ) : logs.length === 0 ? (
        <Card>
          <p className="text-center text-gray-500 py-8">
            No logs found for the selected filters. Use log()/info()/warn()/error()
            from @hermes/agent to send some.
          </p>
        </Card>
      ) : (
        <Card>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Level</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Message</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Trace</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {logs.map((entry, i) => (
                  <tr key={i} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono">
                      {format(new Date(entry.timestamp), 'MMM dd HH:mm:ss.SSS')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs font-medium rounded uppercase ${LEVEL_STYLES[entry.level] || LEVEL_STYLES.info}`}>
                        {entry.level}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {entry.serviceName}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900 font-mono max-w-xl truncate" title={entry.message}>
                      {entry.message}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {entry.traceId ? (
                        <Link to={`/traces/${entry.traceId}`} className="text-primary font-mono hover:underline">
                          {entry.traceId.slice(0, 8)}…
                        </Link>
                      ) : (
                        <span className="text-gray-300">—</span>
                      )}
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

export default Logs;
