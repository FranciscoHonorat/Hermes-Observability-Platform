import { useState, useEffect } from 'react';
import { alertsApi, AlertRule, Alert } from '../api/client';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { format } from 'date-fns';

const Alerts = () => {
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [history, setHistory] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    description: '',
    app_name: '',
    metric_name: '',
    condition: 'gt' as 'gt' | 'lt' | 'eq',
    threshold: 0,
    email_recipients: [''],
    enabled: true
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const rulesData = await alertsApi.getRules();
      setRules(rulesData);
      // Don't load history without a specific alert ID
      setHistory([]);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load alert data');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateRule = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      // Filter out empty email recipients
      const validEmails = formData.email_recipients.filter(email => email.trim() !== '');
      if (validEmails.length === 0) {
        setError('At least one email recipient is required');
        return;
      }
      
      await alertsApi.createRule({
        ...formData,
        email_recipients: validEmails
      });
      setShowCreateForm(false);
      setFormData({
        name: '',
        description: '',
        app_name: '',
        metric_name: '',
        condition: 'gt',
        threshold: 0,
        email_recipients: [''],
        enabled: true
      });
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create alert rule');
    }
  };

  const handleToggleRule = async (id: number, enabled: boolean) => {
    try {
      await alertsApi.updateRule(id, { enabled: !enabled });
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update rule');
    }
  };

  const handleDeleteRule = async (id: number) => {
    if (!confirm('Are you sure you want to delete this alert rule?')) return;
    try {
      await alertsApi.deleteRule(id);
      loadData();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete rule');
    }
  };

  const getConditionLabel = (condition: string) => {
    const labels: Record<string, string> = {
      'gt': '>',
      'lt': '<',
      'eq': '='
    };
    return labels[condition] || condition;
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Alerts</h1>
        <button
          onClick={() => setShowCreateForm(!showCreateForm)}
          className="px-4 py-2 bg-primary text-white rounded-md hover:bg-blue-600 transition-colors"
        >
          {showCreateForm ? 'Cancel' : 'Create Rule'}
        </button>
      </div>

      {error && <ErrorMessage message={error} onRetry={loadData} />}

      {showCreateForm && (
        <Card title="Create Alert Rule">
          <form onSubmit={handleCreateRule} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Rule Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-primary focus:border-primary"
                  placeholder="High CPU Alert"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Application Name (optional)
                </label>
                <input
                  type="text"
                  value={formData.app_name}
                  onChange={(e) => setFormData({ ...formData, app_name: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-primary focus:border-primary"
                  placeholder="my-app"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-primary focus:border-primary"
                  placeholder="Alert when CPU usage is too high"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Metric Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.metric_name}
                  onChange={(e) => setFormData({ ...formData, metric_name: e.target.value })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-primary focus:border-primary"
                  placeholder="cpu_usage_percent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Condition *
                </label>
                <select
                  value={formData.condition}
                  onChange={(e) => setFormData({ ...formData, condition: e.target.value as any })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-primary focus:border-primary"
                >
                  <option value="gt">Greater Than (&gt;)</option>
                  <option value="lt">Less Than (&lt;)</option>
                  <option value="eq">Equal (=)</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Threshold *
                </label>
                <input
                  type="number"
                  required
                  step="0.01"
                  value={formData.threshold}
                  onChange={(e) => setFormData({ ...formData, threshold: parseFloat(e.target.value) })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-primary focus:border-primary"
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Email Recipients * (comma-separated)
                </label>
                <input
                  type="text"
                  required
                  value={formData.email_recipients[0]}
                  onChange={(e) => setFormData({ ...formData, email_recipients: e.target.value.split(',').map(s => s.trim()) })}
                  className="w-full border border-gray-300 rounded-md px-3 py-2 focus:ring-primary focus:border-primary"
                  placeholder="admin@example.com, alerts@example.com"
                />
              </div>
            </div>

            <div className="flex items-center">
              <input
                type="checkbox"
                id="enabled"
                checked={formData.enabled}
                onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                className="h-4 w-4 text-primary focus:ring-primary border-gray-300 rounded"
              />
              <label htmlFor="enabled" className="ml-2 text-sm text-gray-700">
                Enable rule immediately
              </label>
            </div>

            <button
              type="submit"
              className="w-full px-4 py-2 bg-primary text-white rounded-md hover:bg-blue-600 transition-colors"
            >
              Create Rule
            </button>
          </form>
        </Card>
      )}

      {loading ? (
        <LoadingSpinner message="Loading alerts..." />
      ) : (
        <>
          <Card title="Alert Rules">
            {rules.length === 0 ? (
              <p className="text-center text-gray-500 py-4">
                No alert rules configured. Create one to get started.
              </p>
            ) : (
              <div className="space-y-4">
                {rules.map((rule) => (
                  <div
                    key={rule.id}
                    className="border border-gray-200 rounded-lg p-4 hover:border-gray-300 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h4 className="text-lg font-semibold text-gray-900">
                            {rule.name}
                          </h4>
                          <span className={`px-2 py-1 text-xs font-medium rounded ${
                            rule.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                          }`}>
                            {rule.enabled ? 'Enabled' : 'Disabled'}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-gray-600">
                          {rule.app_name && <span className="font-medium">{rule.app_name} /</span>} {rule.metric_name} {getConditionLabel(rule.condition)} {rule.threshold}
                        </p>
                        <p className="mt-1 text-xs text-gray-500">
                          Notify: {rule.email_recipients.join(', ')}
                        </p>
                        {rule.description && (
                          <p className="mt-1 text-xs text-gray-500">{rule.description}</p>
                        )}
                      </div>
                      <div className="flex space-x-2">
                        <button
                          onClick={() => handleToggleRule(rule.id, rule.enabled)}
                          className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 transition-colors"
                        >
                          {rule.enabled ? 'Disable' : 'Enable'}
                        </button>
                        <button
                          onClick={() => handleDeleteRule(rule.id)}
                          className="px-3 py-1 text-sm text-red-600 border border-red-300 rounded-md hover:bg-red-50 transition-colors"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card title="Alert History">
            {history.length === 0 ? (
              <p className="text-center text-gray-500 py-4">
                No alerts triggered yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Triggered At
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Metric Value
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {history.map((alert) => (
                      <tr key={alert.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {format(new Date(alert.triggered_at), 'MMM dd, yyyy HH:mm:ss')}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                          {alert.metric_value.toFixed(2)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          {alert.resolved_at ? (
                            <span className="px-2 py-1 text-xs font-medium rounded bg-green-100 text-green-800">
                              Resolved
                            </span>
                          ) : (
                            <span className="px-2 py-1 text-xs font-medium rounded bg-red-100 text-red-800">
                              Active
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {alert.notification_sent ? (
                            <span className="text-green-600">✓ Notified</span>
                          ) : (
                            <span className="text-gray-400">Pending</span>
                          )}
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

export default Alerts;
