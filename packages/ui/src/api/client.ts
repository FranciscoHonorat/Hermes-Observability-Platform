import axios from 'axios';

const apiClient = axios.create({
  baseURL: '/api',
  timeout: 10000,
  headers: {
    'Content-Type': 'application/json'
  }
});

// Response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    console.error('API Error:', error.response?.data || error.message);
    return Promise.reject(error);
  }
);

export interface Metric {
  id: number;
  app_name: string;
  metric_name: string;
  metric_type: 'counter' | 'gauge' | 'histogram';
  value: number;
  unit?: string;
  tags?: Record<string, string>;
  timestamp: string;
}

export interface TimeseriesData {
  app_name: string;
  metric_name: string;
  bucket: string;
  avg_value: number;
  min_value: number;
  max_value: number;
  count: number;
}

export interface Application {
  name: string;
  description?: string | null;
  created_at: string;
  last_seen: string;
  is_active: boolean;
}

export interface AlertRule {
  id: number;
  name: string;
  description?: string;
  app_name?: string;
  metric_name: string;
  condition: 'gt' | 'lt' | 'eq';
  threshold: number;
  email_recipients: string[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface Alert {
  id: number;
  alert_rule_id: number;
  app_name: string;
  triggered_at: string;
  metric_value: number;
  resolved_at?: string;
  notification_sent: boolean;
}

export interface Trace {
  traceId: string;
  rootService: string | null;
  rootOperation: string | null;
  startTime: number;
  durationMs: number;
  spanCount: number;
  hasError: boolean;
}

export interface Span {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  serviceName: string;
  operationName: string;
  startTime: number;
  durationMs: number;
  status: 'ok' | 'error';
  attributes?: Record<string, string | number | boolean>;
}

export interface LogEntry {
  serviceName: string;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  timestamp: number;
  traceId?: string;
  spanId?: string;
  attributes?: Record<string, string | number | boolean>;
}

export interface ServiceMapNode {
  serviceName: string;
  callCount: number;
  errorCount: number;
  errorRate: number;
}

export interface ServiceMapEdge {
  source: string;
  target: string;
  callCount: number;
  errorCount: number;
  avgDurationMs: number;
}

export interface Anomaly {
  id: number;
  time: string;
  app_name: string;
  metric_name: string;
  value: number;
  expected_value: number | null;
  anomaly_score: number;
  severity: 'warning' | 'critical';
  algorithm: string;
  detected_at: string;
}

export interface Recommendation {
  id: number;
  app_name: string;
  category: 'latency' | 'error_rate' | 'resource';
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  related_metric_name?: string | null;
  related_operation_name?: string | null;
  evidence?: Record<string, unknown> | null;
  status: 'open' | 'acknowledged' | 'dismissed';
  created_at: string;
  updated_at: string;
}

// Metrics API
export const metricsApi = {
  getMetrics: async (params?: {
    appName?: string;
    metricName?: string;
    startTime?: string;
    endTime?: string;
    limit?: number;
  }) => {
    const response = await apiClient.get<Metric[]>('/metrics', { params });
    return response.data;
  },

  getTimeseries: async (params: {
    appName?: string;
    metricName?: string;
    startTime: string;
    endTime: string;
    interval?: string;
  }) => {
    // Convert ISO strings to timestamps and rename parameters to match API
    const queryParams = {
      appName: params.appName || 'unknown',
      metricName: params.metricName,
      from: new Date(params.startTime).getTime(),
      to: new Date(params.endTime).getTime(),
      interval: params.interval || '1 minute'
    };
    
    const response = await apiClient.get<{ timeseries: TimeseriesData[] }>('/metrics/timeseries', { 
      params: queryParams 
    });
    return response.data.timeseries || [];
  }
};

// Applications API
export const applicationsApi = {
  getApplications: async () => {
    const response = await apiClient.get<{ applications: Application[]; count: number }>('/applications');
    return response.data.applications;
  },

  getApplication: async (appName: string) => {
    const response = await apiClient.get<Application>(`/applications/${appName}`);
    return response.data;
  }
};

// Alerts API
export const alertsApi = {
  getRules: async (params?: { appName?: string; enabled?: boolean }) => {
    const response = await apiClient.get<{ alerts: AlertRule[]; count: number }>('/alerts', { params });
    return response.data.alerts;
  },

  createRule: async (rule: Omit<AlertRule, 'id' | 'created_at' | 'updated_at'>) => {
    const response = await apiClient.post<AlertRule>('/alerts', rule);
    return response.data;
  },

  updateRule: async (id: number, rule: Partial<AlertRule>) => {
    const response = await apiClient.put<AlertRule>(`/alerts/${id}`, rule);
    return response.data;
  },

  deleteRule: async (id: number) => {
    await apiClient.delete(`/alerts/${id}`);
  },

  getHistory: async (alertId: number, limit: number = 100) => {
    const response = await apiClient.get<{ alert_id: number; history: Alert[]; count: number }>(`/alerts/${alertId}/history`, { 
      params: { limit } 
    });
    return response.data.history;
  }
};

// Traces API
export const tracesApi = {
  getTraces: async (params?: { serviceName?: string; startTime?: string; endTime?: string; limit?: number }) => {
    const queryParams = {
      serviceName: params?.serviceName || undefined,
      from: params?.startTime ? new Date(params.startTime).getTime() : undefined,
      to: params?.endTime ? new Date(params.endTime).getTime() : undefined,
      limit: params?.limit
    };
    const response = await apiClient.get<{ traces: Trace[]; count: number }>('/traces', { params: queryParams });
    return response.data.traces;
  },

  getTrace: async (traceId: string) => {
    const response = await apiClient.get<{ traceId: string; spans: Span[] }>(`/traces/${traceId}`);
    return response.data.spans;
  }
};

// Logs API
export const logsApi = {
  getLogs: async (params?: {
    appName?: string;
    level?: string;
    search?: string;
    traceId?: string;
    startTime?: string;
    endTime?: string;
    limit?: number;
  }) => {
    const queryParams = {
      appName: params?.appName || undefined,
      level: params?.level || undefined,
      search: params?.search || undefined,
      traceId: params?.traceId || undefined,
      from: params?.startTime ? new Date(params.startTime).getTime() : undefined,
      to: params?.endTime ? new Date(params.endTime).getTime() : undefined,
      limit: params?.limit
    };
    const response = await apiClient.get<{ logs: LogEntry[]; count: number }>('/logs', { params: queryParams });
    return response.data.logs;
  }
};

// Service Map API
export const serviceMapApi = {
  getServiceMap: async (params?: { startTime?: string; endTime?: string }) => {
    const queryParams = {
      from: params?.startTime ? new Date(params.startTime).getTime() : undefined,
      to: params?.endTime ? new Date(params.endTime).getTime() : undefined
    };
    const response = await apiClient.get<{ nodes: ServiceMapNode[]; edges: ServiceMapEdge[] }>('/service-map', { params: queryParams });
    return response.data;
  }
};

// Anomalies API
export const anomaliesApi = {
  getAnomalies: async (params?: { appName?: string; metricName?: string; severity?: string; limit?: number }) => {
    const response = await apiClient.get<{ anomalies: Anomaly[]; count: number }>('/anomalies', { params });
    return response.data.anomalies;
  }
};

// Recommendations API
export const recommendationsApi = {
  getRecommendations: async (params?: { appName?: string; status?: string; category?: string }) => {
    const response = await apiClient.get<{ recommendations: Recommendation[]; count: number }>('/recommendations', { params });
    return response.data.recommendations;
  },

  updateStatus: async (id: number, status: Recommendation['status']) => {
    const response = await apiClient.put<Recommendation>(`/recommendations/${id}`, { status });
    return response.data;
  }
};

export default apiClient;
