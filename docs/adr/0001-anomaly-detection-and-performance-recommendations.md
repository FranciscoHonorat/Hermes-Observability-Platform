# ADR 0001: Anomaly Detection and Performance Recommendations

- **Status:** Implemented
- **Date:** 2026-09-08
- **Scope:** `packages/intelligence` (new), `docker/init-db.sql`, `packages/shared`, `packages/api`, `packages/ui`, `docker-compose.yml`

This is the first ADR committed to this repo — the earlier project-wide audit (v1.0/v2.0) was delivered as a standalone Artifact rather than files here. Starting the convention now, matching the format used in `re-api-books`' `docs/adr/`.

## Context

`docs/MVP.md`'s v3.0 "Intelligence" section lists four items: anomaly detection (ML), predictive alerts, automated root cause analysis, and performance recommendations. This ADR covers the first and last of those — anomaly detection and performance recommendations — scoped down deliberately, since predictive alerts and automated RCA both naturally build on top of anomaly detection and are better designed once it exists and has real data flowing through it.

Today the only "smart" behavior in this system is `packages/processor/src/alertEngine.ts`: a periodic sweep that checks user-configured static thresholds (the `alert_rules` table — `metric_name`, `condition: gt|lt|eq`, `threshold`) and records a firing into `alert_history`. This requires a human to already know what threshold is abnormal for a given metric on a given app — there's no learned baseline, nothing multivariate, and no natural-language guidance on what to actually do about it. This ADR replaces "you set the threshold" with "the system learns the normal range per metric per app" for anomalies, and turns already-collected spans and anomalies into concrete recommended actions instead of raw numbers a human has to interpret themselves.

## Decision

### 1. A new Python service — the project's first non-JS/Go runtime

`packages/intelligence` is a standalone Python service (scikit-learn, numpy, psycopg2), not a library folded into `packages/processor`. Every other stack decision in this repo has stayed within Node/TypeScript (services) and Go (the `agent-go` client) specifically to keep operational surface small; introducing Python here is a deliberate, isolated exception because real anomaly detection needs a real ML library, and Node's ecosystem has nothing comparable to scikit-learn's maturity. It's kept as its own deployable unit — same `packages/` convention as `agent-go` (which also isn't an npm workspace) — so this exception stays contained rather than spreading into other services.

### 2. `IsolationForest`, fit on a baseline window and scored against a separate recent window

Unsupervised anomaly detection was the only option — there's no labeled "this was actually an incident" dataset to train against. `sklearn.ensemble.IsolationForest` was chosen over a hand-rolled statistical baseline (z-score/EWMA) because the user explicitly wanted a real ML library rather than a heuristic dressed up as one.

The scoring function (`packages/intelligence/src/anomaly_detector.py::detect_anomalies`) deliberately fits the model on a `baseline` window and scores a *separate* `recent` window against that already-fitted model, rather than fitting on the combined series and reading off `predict()` for the recent portion. Fitting on the combined series would let an anomalous point influence the very baseline it's being judged against — with `IsolationForest`'s `contamination` parameter setting a fixed percentile threshold, a big enough burst can drag its own decision boundary along with it. Scoring against a frozen, already-fit baseline avoids that, and is also what makes the detector properly unit-testable with synthetic data (inject an outlier into a *separate* recent array, assert it's flagged — see `tests/test_anomaly_detector.py`).

### 3. Performance recommendations are rule-based, not ML

`packages/intelligence/src/recommendations.py` is deliberately deterministic: fixed thresholds (p95 latency > 2x its 24h baseline, error rate > 5%, a critical anomaly on a resource-shaped metric) compared against `spans` and the `anomalies` table just written. This was a conscious choice against feeding recommendations through an ML/LLM step — the inputs are already well-understood numeric signals, a fixed rule is fully explainable (a user can read the code and know exactly why a recommendation fired), and it avoids introducing a second, harder-to-test kind of non-determinism on top of the one anomaly detection already introduces.

### 4. Direct Postgres access, not an HTTP call to `packages/api`

Mirrors `packages/processor`'s existing convention exactly: connect directly to Postgres with the same `POSTGRES_*` env vars the other services use, rather than authenticating against the Node API. `packages/processor` already established that internal services read/write Postgres directly and only `packages/api` is the externally-facing HTTP surface; `packages/intelligence` follows that same seam.

### 5. Table design: `anomalies` and `recommendations` as plain tables, not hypertables

Both are event-volume tables (one row per detected anomaly / per synthesized recommendation), not raw-signal volume like `metrics`/`spans`/`logs` — closer in shape to `alert_history` than to the hypertables. `anomalies` has a `UNIQUE (app_name, metric_name, time)` constraint with `ON CONFLICT DO NOTHING` so the same bucket, re-evaluated across sweeps while it's still within the "recent" window, doesn't produce duplicate rows. `recommendations` has a `status` (`open`/`acknowledged`/`dismissed`) and a cooldown check (`RECOMMENDATION_COOLDOWN_HOURS`, default 6) before inserting a new row for the same `(app_name, category, related_metric_name/related_operation_name)`, so the same underlying problem isn't re-flagged every sweep interval.

### 6. Metric names reused, not reinvented

`packages/intelligence`'s resource-anomaly rule matches on `process.memory.*`, `go.gc.*`, `system.memory.usage`, `system.cpu.usage` — the exact metric names already emitted by `packages/agent` (Node) and `packages/agent-go` (Go). No new naming convention was introduced for this feature.

## Consequences

- A second runtime (Python) now needs to be operated, built, and kept dependency-current alongside Node and Go — a real increase in operational surface, accepted deliberately per Decision 1.
- `IsolationForest`'s `contamination` parameter is a global assumption ("~5% of points are anomalous") applied per-metric; a metric with genuinely stable behavior may still occasionally get a false positive purely from this parameter, and a metric with truly bursty-but-normal behavior may get under-flagged. This is a known tradeoff of the algorithm, not a bug — revisit if false-positive rate turns out to be a problem in practice.
- Predictive alerts and automated root cause analysis (the other two v3.0 items) are explicitly deferred. The `anomalies` table this ADR introduces is designed to be a natural input to both: predictive alerts could watch anomaly *trend/velocity* rather than point-in-time detections, and automated RCA could correlate anomalies across services using the same window logic already built here.
