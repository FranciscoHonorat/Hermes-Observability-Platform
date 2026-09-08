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

# |value - baseline_mean| / baseline_std beyond this is 'critical' rather
# than 'warning'. Severity is graded this way, not from IsolationForest's
# own decision_function score, because that score saturates for a single
# (univariate) feature: once a point falls outside the range the model was
# trained on, every split in every tree routes it the same way regardless
# of *how far* outside it is, so a barely-outlying point and a wildly-
# outlying point end up with the same score. The z-score against the
# baseline's own distribution doesn't have that ceiling.
CRITICAL_ZSCORE_THRESHOLD = 5.0


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

    baseline_arr_flat = np.array(baseline_values, dtype=float)
    expected_value = float(baseline_arr_flat.mean())
    baseline_std = float(baseline_arr_flat.std())

    baseline_arr = baseline_arr_flat.reshape(-1, 1)
    model = IsolationForest(contamination=contamination, random_state=42)
    model.fit(baseline_arr)

    recent_arr = np.array(recent_values, dtype=float).reshape(-1, 1)
    predictions = model.predict(recent_arr)
    scores = model.decision_function(recent_arr)

    results: list[AnomalyResult] = []
    for i, (pred, score, value) in enumerate(zip(predictions, scores, recent_values)):
        if pred == -1:
            zscore = abs(value - expected_value) / baseline_std if baseline_std > 0 else float("inf")
            severity = "critical" if zscore > CRITICAL_ZSCORE_THRESHOLD else "warning"
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
