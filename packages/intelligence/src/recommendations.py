"""Performance recommendations — rule-based, reads spans + anomalies.
Deliberately not ML: deterministic rules keep this explainable (see
docs/adr/0001-*.md). The rule-evaluation functions are pure and unit-tested
independently of Postgres (see tests/test_recommendations.py).
"""
import json
import logging

from .config import config
from .db import execute, query

logger = logging.getLogger("intelligence.recommendations")

LATENCY_REGRESSION_FACTOR = 2.0
LATENCY_MIN_SAMPLES = 20
ERROR_RATE_THRESHOLD = 0.05
ERROR_RATE_MIN_SAMPLES = 10
RESOURCE_METRIC_PREFIXES = (
    "process.memory.",
    "go.gc.",
    "system.memory.usage",
    "system.cpu.usage",
)


def evaluate_latency_rule(
    current_p95: float,
    baseline_p95: float,
    samples: int,
    factor: float = LATENCY_REGRESSION_FACTOR,
    min_samples: int = LATENCY_MIN_SAMPLES,
) -> bool:
    if samples < min_samples or baseline_p95 <= 0:
        return False
    return current_p95 > baseline_p95 * factor


def evaluate_error_rate_rule(
    error_ratio: float,
    samples: int,
    threshold: float = ERROR_RATE_THRESHOLD,
    min_samples: int = ERROR_RATE_MIN_SAMPLES,
) -> bool:
    if samples < min_samples:
        return False
    return error_ratio > threshold


def is_resource_metric(metric_name: str) -> bool:
    return metric_name.startswith(RESOURCE_METRIC_PREFIXES)


def _has_open_recent(
    conn,
    tenant_id: int,
    app_name: str,
    category: str,
    related_metric_name: str | None = None,
    related_operation_name: str | None = None,
) -> bool:
    conditions = [
        "tenant_id = %s",
        "app_name = %s",
        "category = %s",
        "status = 'open'",
        "created_at >= NOW() - (%s::text || ' hours')::interval",
    ]
    params: list = [tenant_id, app_name, category, config.recommendation_cooldown_hours]
    if related_metric_name is not None:
        conditions.append("related_metric_name = %s")
        params.append(related_metric_name)
    if related_operation_name is not None:
        conditions.append("related_operation_name = %s")
        params.append(related_operation_name)
    sql = f"SELECT 1 FROM recommendations WHERE {' AND '.join(conditions)} LIMIT 1"
    return len(query(conn, sql, tuple(params))) > 0


def _insert_recommendation(
    conn,
    tenant_id: int,
    app_name: str,
    category: str,
    severity: str,
    title: str,
    description: str,
    related_metric_name: str | None = None,
    related_operation_name: str | None = None,
    evidence: dict | None = None,
) -> None:
    execute(
        conn,
        """
        INSERT INTO recommendations
            (tenant_id, app_name, category, severity, title, description, related_metric_name, related_operation_name, evidence)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        """,
        (
            tenant_id,
            app_name,
            category,
            severity,
            title,
            description,
            related_metric_name,
            related_operation_name,
            json.dumps(evidence) if evidence is not None else None,
        ),
    )


def run_latency_sweep(conn) -> int:
    rows = query(
        conn,
        """
        WITH current_window AS (
            SELECT tenant_id, service_name, operation_name,
                   percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95,
                   COUNT(*) AS samples
            FROM spans
            WHERE start_time >= NOW() - INTERVAL '1 hour'
            GROUP BY tenant_id, service_name, operation_name
        ),
        baseline_window AS (
            SELECT tenant_id, service_name, operation_name,
                   percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_ms) AS p95
            FROM spans
            WHERE start_time >= NOW() - INTERVAL '24 hours' AND start_time < NOW() - INTERVAL '1 hour'
            GROUP BY tenant_id, service_name, operation_name
        )
        SELECT c.tenant_id, c.service_name, c.operation_name, c.p95 AS current_p95, c.samples, b.p95 AS baseline_p95
        FROM current_window c
        JOIN baseline_window b
            ON b.tenant_id = c.tenant_id
           AND b.service_name = c.service_name
           AND b.operation_name = c.operation_name
        """,
    )

    written = 0
    for row in rows:
        current_p95, baseline_p95, samples = float(row["current_p95"]), float(row["baseline_p95"]), int(row["samples"])
        if not evaluate_latency_rule(current_p95, baseline_p95, samples):
            continue
        tenant_id, app_name, operation = row["tenant_id"], row["service_name"], row["operation_name"]
        if _has_open_recent(conn, tenant_id, app_name, "latency", related_operation_name=operation):
            continue
        _insert_recommendation(
            conn,
            tenant_id,
            app_name,
            "latency",
            "warning",
            title=f"Latency regression on {operation}",
            description=(
                f"p95 latency for {operation} is {current_p95:.1f}ms in the last hour, "
                f"more than {LATENCY_REGRESSION_FACTOR}x its 24h baseline of {baseline_p95:.1f}ms."
            ),
            related_operation_name=operation,
            evidence={"current_p95_ms": current_p95, "baseline_p95_ms": baseline_p95, "samples": samples},
        )
        written += 1
    return written


def run_error_rate_sweep(conn) -> int:
    rows = query(
        conn,
        """
        SELECT tenant_id, service_name, operation_name,
               COUNT(*) FILTER (WHERE status = 'error') AS error_count,
               COUNT(*) AS samples
        FROM spans
        WHERE start_time >= NOW() - INTERVAL '1 hour'
        GROUP BY tenant_id, service_name, operation_name
        """,
    )

    written = 0
    for row in rows:
        samples = int(row["samples"])
        error_count = int(row["error_count"])
        error_ratio = (error_count / samples) if samples else 0.0
        if not evaluate_error_rate_rule(error_ratio, samples):
            continue
        tenant_id, app_name, operation = row["tenant_id"], row["service_name"], row["operation_name"]
        if _has_open_recent(conn, tenant_id, app_name, "error_rate", related_operation_name=operation):
            continue
        _insert_recommendation(
            conn,
            tenant_id,
            app_name,
            "error_rate",
            "critical" if error_ratio > 0.2 else "warning",
            title=f"Elevated error rate on {operation}",
            description=(
                f"{operation} has a {error_ratio * 100:.1f}% error rate over the last hour "
                f"({error_count}/{samples} spans)."
            ),
            related_operation_name=operation,
            evidence={"error_ratio": error_ratio, "error_count": error_count, "samples": samples},
        )
        written += 1
    return written


def run_resource_sweep(conn) -> int:
    rows = query(
        conn,
        """
        SELECT id, tenant_id, app_name, metric_name, value, detected_at
        FROM anomalies
        WHERE severity = 'critical' AND detected_at >= NOW() - INTERVAL '1 hour'
        """,
    )

    written = 0
    for row in rows:
        metric_name = row["metric_name"]
        if not is_resource_metric(metric_name):
            continue
        tenant_id, app_name = row["tenant_id"], row["app_name"]
        if _has_open_recent(conn, tenant_id, app_name, "resource", related_metric_name=metric_name):
            continue
        _insert_recommendation(
            conn,
            tenant_id,
            app_name,
            "resource",
            "critical",
            title=f"Resource anomaly on {metric_name}",
            description=(
                f"{app_name} has a critical anomaly on {metric_name} (value {row['value']}), "
                "consider investigating for a leak or runaway process."
            ),
            related_metric_name=metric_name,
            evidence={"anomaly_id": int(row["id"]), "value": float(row["value"])},
        )
        written += 1
    return written


def run_recommendation_sweep(conn) -> int:
    total = run_latency_sweep(conn) + run_error_rate_sweep(conn) + run_resource_sweep(conn)
    logger.info("Recommendation sweep complete: %d new recommendations", total)
    return total
