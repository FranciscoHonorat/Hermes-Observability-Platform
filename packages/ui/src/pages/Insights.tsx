import { useState, useEffect } from 'react';
import { anomaliesApi, recommendationsApi, Anomaly, Recommendation } from '../api/client';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { format } from 'date-fns';
import { useIsAdmin } from '../context/AuthContext';

const SEVERITY_BADGE: Record<string, string> = {
  info: 'bg-blue-100 text-blue-800',
  warning: 'bg-yellow-100 text-yellow-800',
  critical: 'bg-red-100 text-red-800'
};

const Insights = () => {
  const isAdmin = useIsAdmin();
  const [anomalies, setAnomalies] = useState<Anomaly[]>([]);
  const [recommendations, setRecommendations] = useState<Recommendation[]>([]);
  const [appFilter, setAppFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [appFilter]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [anomaliesData, recommendationsData] = await Promise.all([
        anomaliesApi.getAnomalies({ appName: appFilter || undefined, limit: 50 }),
        recommendationsApi.getRecommendations({ appName: appFilter || undefined, status: 'open' })
      ]);
      setAnomalies(anomaliesData);
      setRecommendations(recommendationsData);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load insights');
    } finally {
      setLoading(false);
    }
  };

  const handleStatusChange = async (id: number, status: Recommendation['status']) => {
    try {
      await recommendationsApi.updateStatus(id, status);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update recommendation');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Insights</h1>
        <input
          type="text"
          value={appFilter}
          onChange={(e) => setAppFilter(e.target.value)}
          placeholder="Filter by application name"
          className="border border-gray-300 rounded-md px-4 py-2 focus:ring-primary focus:border-primary"
        />
      </div>

      {error && <ErrorMessage message={error} onRetry={loadData} />}

      {loading ? (
        <LoadingSpinner message="Loading insights..." />
      ) : (
        <>
          <Card title="Recommendations">
            {recommendations.length === 0 ? (
              <p className="text-center text-gray-500 py-4">
                No open recommendations. The intelligence sweep runs every few minutes.
              </p>
            ) : (
              <div className="space-y-4">
                {recommendations.map((rec) => (
                  <div
                    key={rec.id}
                    className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h4 className="text-lg font-semibold text-gray-900">{rec.title}</h4>
                          <span className={`px-2 py-1 text-xs font-medium rounded ${SEVERITY_BADGE[rec.severity]}`}>
                            {rec.severity}
                          </span>
                          <span className="px-2 py-1 text-xs font-medium rounded bg-gray-100 text-gray-700">
                            {rec.category}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-600">{rec.description}</p>
                        <p className="mt-1 text-xs text-gray-500">
                          {rec.app_name} &middot; {format(new Date(rec.created_at), 'MMM dd, yyyy HH:mm:ss')}
                        </p>
                      </div>
                      {isAdmin && (
                        <div className="flex space-x-2">
                          <button
                            onClick={() => handleStatusChange(rec.id, 'acknowledged')}
                            className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                          >
                            Acknowledge
                          </button>
                          <button
                            onClick={() => handleStatusChange(rec.id, 'dismissed')}
                            className="px-3 py-1 text-sm text-red-600 border border-red-300 rounded-md hover:bg-red-50 transition-colors"
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Anomalies">
            {anomalies.length === 0 ? (
              <p className="text-center text-gray-500 py-4">No anomalies detected recently.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Time</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">App</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Metric</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Value</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expected</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Severity</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {anomalies.map((anomaly) => (
                      <tr key={anomaly.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {format(new Date(anomaly.time), 'MMM dd, yyyy HH:mm:ss')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{anomaly.app_name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{anomaly.metric_name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{anomaly.value.toFixed(2)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {anomaly.expected_value != null ? anomaly.expected_value.toFixed(2) : '—'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`px-2 py-1 text-xs font-medium rounded ${SEVERITY_BADGE[anomaly.severity]}`}>
                            {anomaly.severity}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
};

export default Insights;
