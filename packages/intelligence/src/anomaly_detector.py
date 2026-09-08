"""Anomaly detection — IsolationForest per (app_name, metric_name) series.

The scoring logic (`detect_anomalies`) is a pure function, independent of
Postgres, so it's unit-testable with synthetic arrays (see
tests/test_anomaly_detector.py). It fits on a `baseline` window only and
scores a separate `recent` window against that fitted model — never scoring
a point against a baseline that includes itself, which would let one
outlier both define and pass its own threshold.
"""
import logging
from dataclasses import dataclass

import numpy as np
from sklearn.ensemble import IsolationForest

from .config import config
from .db import execute, query

logger = logging.getLogger("intelligence.anomaly_detector")

# decision_function score below this is 'critical' rather than 'warning'.
# More negative = more anomalous (see sklearn's IsolationForest docs).
CRITICAL_SCORE_THRESHOLD = -0.15


@dataclass
class AnomalyResult:
    index: int
    value: float
    expected_value: float
    score: float
    severity: str  # 'warning' | 'critical'


def detect_anomalies(
    baseline_values: list[float],
    recent_values: list[float],
    min_samples: int = 30,
    contamination: float = 0.05,
) -> list[AnomalyResult]:
    """Fit IsolationForest on `baseline_values`, score `recent_values`
    against it. Returns one AnomalyResult per recent point flagged as an
    outlier (index refers to position within recent_values)."""
    if len(baseline_values) < min_samples or not recent_values:
        return []

    expected_value = float(np.mean(baseline_values))

    baseline_arr = np.array(baseline_values, dtype=float).reshape(-1, 1)
    model = IsolationForest(contamination=contamination, random_state=42)
    model.fit(baseline_arr)

    recent_arr = np.array(recent_values, dtype=float).reshape(-1, 1)
    predictions = model.predict(recent_arr)
    scores = model.decision_function(recent_arr)

    results: list[AnomalyResult] = []
    for i, (pred, score, value) in enumerate(zip(predictions, scores, recent_values)):
        if pred == -1:
            severity = "critical" if score < CRITICAL_SCORE_THRESHOLD else "warning"
            results.append(
                AnomalyResult(
                    index=i,
                    value=float(value),
                    expected_value=expected_value,
                    score=float(score),
                    severity=severity,
                )
            )
    return results


def _series_pairs(conn) -> list[dict]:
    return query(
        conn,
        """
        SELECT DISTINCT app_name, metric_name
        FROM metrics_1min
        WHERE bucket >= NOW() - (%s::text || ' hours')::interval
        """,
        (config.anomaly_lookback_hours,),
    )


def _series(conn, app_name: str, metric_name: str) -> list[dict]:
    return query(
        conn,
        """
        SELECT bucket, avg_value
        FROM metrics_1min
        WHERE app_name = %s AND metric_name = %s
          AND bucket >= NOW() - (%s::text || ' hours')::interval
        ORDER BY bucket ASC
        """,
        (app_name, metric_name, config.anomaly_lookback_hours),
    )


def run_anomaly_sweep(conn) -> int:
    """Runs one detection pass across every (app_name, metric_name) pair
    with recent data. Returns the number of new anomalies written."""
    written = 0
    for pair in _series_pairs(conn):
        app_name, metric_name = pair["app_name"], pair["metric_name"]
        rows = _series(conn, app_name, metric_name)
        if len(rows) < config.anomaly_min_samples:
            continue

        window_minutes = config.anomaly_window_minutes
        recent_rows = [r for r in rows if _minutes_ago(r["bucket"]) <= window_minutes]
        baseline_rows = rows[: len(rows) - len(recent_rows)]
        if not recent_rows:
            continue

        baseline_values = [float(r["avg_value"]) for r in baseline_rows]
        recent_values = [float(r["avg_value"]) for r in recent_rows]

        anomalies = detect_anomalies(
            baseline_values, recent_values, min_samples=config.anomaly_min_samples
        )

        for anomaly in anomalies:
            bucket_time = recent_rows[anomaly.index]["bucket"]
            try:
                execute(
                    conn,
                    """
                    INSERT INTO anomalies
                        (time, app_name, metric_name, value, expected_value, anomaly_score, severity, algorithm)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, 'isolation_forest')
                    ON CONFLICT (app_name, metric_name, time) DO NOTHING
                    """,
                    (
                        bucket_time,
                        app_name,
                        metric_name,
                        anomaly.value,
                        anomaly.expected_value,
                        anomaly.score,
                        anomaly.severity,
                    ),
                )
                written += 1
            except Exception:
                logger.exception(
                    "Failed to write anomaly for %s/%s at %s", app_name, metric_name, bucket_time
                )

    logger.info("Anomaly sweep complete: %d new anomalies", written)
    return written


def _minutes_ago(timestamp) -> float:
    import datetime

    now = datetime.datetime.now(datetime.timezone.utc)
    return (now - timestamp).total_seconds() / 60.0
