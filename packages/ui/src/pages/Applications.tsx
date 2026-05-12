import { useState, useEffect } from 'react';
import { applicationsApi, Application } from '../api/client';
import Card from '../components/Card';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { format } from 'date-fns';

const Applications = () => {
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadApplications();
  }, []);

  const loadApplications = async () => {
    setLoading(true);
    setError(null);
    try {
      const apps = await applicationsApi.getApplications();
      setApplications(apps);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load applications');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Applications</h1>
        <button
          onClick={loadApplications}
          className="px-4 py-2 bg-primary text-white rounded-md hover:bg-blue-600 transition-colors"
        >
          Refresh
        </button>
      </div>

      {error && <ErrorMessage message={error} onRetry={loadApplications} />}

      {loading ? (
        <LoadingSpinner message="Loading applications..." />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {applications.map((app) => (
            <Card key={app.name}>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xl font-semibold text-gray-900">{app.name}</h3>
                  <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                    app.is_active 
                      ? 'bg-green-100 text-green-800' 
                      : 'bg-gray-100 text-gray-800'
                  }`}>
                    {app.is_active ? 'Active' : 'Inactive'}
                  </span>
                </div>
                
                {app.description && (
                  <p className="text-sm text-gray-600">{app.description}</p>
                )}
                
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex justify-between">
                    <span>Created:</span>
                    <span className="font-medium">
                      {format(new Date(app.created_at), 'MMM dd, yyyy HH:mm')}
                    </span>
                  </div>
                  
                  <div className="flex justify-between">
                    <span>Last Seen:</span>
                    <span className="font-medium">
                      {format(new Date(app.last_seen), 'MMM dd, yyyy HH:mm')}
                    </span>
                  </div>
                </div>

                <div className="pt-3 border-t border-gray-200">
                  <button className="w-full px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors text-sm font-medium">
                    View Details
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {!loading && applications.length === 0 && (
        <Card>
          <p className="text-center text-gray-500 py-8">
            No applications found. Start sending metrics to see them here.
          </p>
        </Card>
      )}
    </div>
  );
};

export default Applications;
