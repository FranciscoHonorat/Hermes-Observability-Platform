/**
 * Recommendation Types - performance recommendations synthesized by
 * packages/intelligence/src/recommendations.py from spans + anomalies.
 * Rule-based, not ML — see docs/adr/0001-*.md.
 */

export type RecommendationCategory = 'latency' | 'error_rate' | 'resource';
export type RecommendationSeverity = 'info' | 'warning' | 'critical';
export type RecommendationStatus = 'open' | 'acknowledged' | 'dismissed';

/** Mirrors the `recommendations` table 1:1 (see docker/init-db.sql). */
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

/** The only user-mutable shape (PUT /api/v1/recommendations/:id) — status only. */
export interface RecommendationStatusUpdate {
  status: RecommendationStatus;
}
