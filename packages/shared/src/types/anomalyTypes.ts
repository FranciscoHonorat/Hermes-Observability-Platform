
export type AnomalySeverity = 'warning' | 'critical';

export interface Anomaly {
  id: number;
  time: string;
  app_name: string;
  metric_name: string;
  value: number;
  expected_value: number | null;
  anomaly_score: number;
  severity: AnomalySeverity;
  algorithm: string;
  detected_at: string;
  metadata: Record<string, unknown> | null;
}
