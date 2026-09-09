/**
 * Anomaly Types - detections produced by packages/intelligence's periodic
 * sweep. Read-only from the API's perspective — there is no POST/PUT here,
 * only what packages/intelligence writes directly to Postgres.
 */

export type AnomalySeverity = 'warning' | 'critical';

/** Mirrors the `anomalies` table 1:1 (see docker/init-db.sql). */
export interface Anomaly {
  id: number;
  time: string; // TIMESTAMPTZ, ISO 8601
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
