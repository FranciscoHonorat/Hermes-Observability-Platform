
export type RecommendationCategory = 'latency' | 'error_rate' | 'resource';
export type RecommendationSeverity = 'info' | 'warning' | 'critical';
export type RecommendationStatus = 'open' | 'acknowledged' | 'dismissed';

export interface Recommendation {
  id: number;
  app_name: string;
  category: RecommendationCategory;
  severity: RecommendationSeverity;
  title: string;
  description: string;
  related_metric_name: string | null;
  related_operation_name: string | null;
  evidence: Record<string, unknown> | null;
  status: RecommendationStatus;
  created_at: string;
  updated_at: string;
}

export interface RecommendationStatusUpdate {
  status: RecommendationStatus;
}
