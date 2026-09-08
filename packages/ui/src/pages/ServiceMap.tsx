import { useState, useEffect } from 'react';
import { serviceMapApi, ServiceMapNode, ServiceMapEdge } from '../api/client';
import Card from '../components/Card';
import ServiceGraph from '../components/ServiceGraph';
import TimeRangeSelector, { timeRanges } from '../components/TimeRangeSelector';
import LoadingSpinner from '../components/LoadingSpinner';
import ErrorMessage from '../components/ErrorMessage';
import { subHours, subDays } from 'date-fns';

const ServiceMap = () => {
  const [timeRange, setTimeRange] = useState('1h');
  const [nodes, setNodes] = useState<ServiceMapNode[]>([]);
  const [edges, setEdges] = useState<ServiceMapEdge[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadServiceMap();
  }, [timeRange]);

  const loadServiceMap = async () => {
    setLoading(true);
    setError(null);
    try {
      const range = timeRanges.find(r => r.value === timeRange);
      if (!range) return;

      const endTime = new Date().toISOString();
      const startTime = range.hours > 48
        ? subDays(new Date(), Math.floor(range.hours / 24)).toISOString()
        : subHours(new Date(), range.hours).toISOString();

      const data = await serviceMapApi.getServiceMap({ startTime, endTime });
      setNodes(data.nodes);
      setEdges(data.edges);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to load service map');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-gray-900">Service Map</h1>
        <TimeRangeSelector selected={timeRange} onChange={setTimeRange} />
      </div>

      {error && <ErrorMessage message={error} onRetry={loadServiceMap} />}

      {loading ? (
        <LoadingSpinner message="Loading service map..." />
      ) : (
        <Card>
          <ServiceGraph nodes={nodes} edges={edges} />
        </Card>
      )}

      {!loading && nodes.length > 0 && (
        <p className="text-sm text-gray-500 text-center">
          Node size and color reflect calls received and error rate. Click a service to see its traces.
        </p>
      )}
    </div>
  );
};

export default ServiceMap;
