# hermes-intelligence

Anomaly detection + performance recommendations. The only non-JS/Go runtime
in this repo — see `docs/adr/0001-anomaly-detection-and-performance-recommendations.md`
for why.

Runs as a standalone periodic sweep (`src/main.py`), the same shape as
`packages/processor/src/alertEngine.ts`: connect directly to Postgres (no
call to `packages/api`), loop forever, sleep `ANOMALY_CHECK_INTERVAL_SECONDS`
(default 300) between sweeps.

## What it does

1. **Anomaly detection** (`src/anomaly_detector.py`) — for every
   `(app_name, metric_name)` pair with enough recent history in the
   `metrics_1min` continuous aggregate, fits `sklearn.ensemble.IsolationForest`
   on a baseline window and scores a separate recent window against it.
   Flagged points are written to the `anomalies` table.
2. **Performance recommendations** (`src/recommendations.py`) — rule-based,
   not ML: latency regressions and elevated error rates from `spans`, plus
   resource-metric anomalies from step 1, become rows in the
   `recommendations` table. Deduplicated with a cooldown so the same issue
   isn't re-flagged every sweep.

## Environment variables

| Var | Default |
|---|---|
| `POSTGRES_HOST` | `localhost` |
| `POSTGRES_PORT` | `5432` |
| `POSTGRES_DB` | `hermes_observability` |
| `POSTGRES_USER` | `hermes` |
| `POSTGRES_PASSWORD` | *(required)* |
| `ANOMALY_CHECK_INTERVAL_SECONDS` | `300` |
| `ANOMALY_LOOKBACK_HOURS` | `6` |
| `ANOMALY_WINDOW_MINUTES` | `15` |
| `ANOMALY_MIN_SAMPLES` | `30` |
| `RECOMMENDATION_COOLDOWN_HOURS` | `6` |

## Local development

```
pip install -r requirements-dev.txt
pytest
```

Unit tests don't need Postgres — `anomaly_detector.detect_anomalies` and
`recommendations`'s rule functions are pure and tested with synthetic data.
