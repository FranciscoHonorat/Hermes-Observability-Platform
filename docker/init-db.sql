-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Enable trigram matching for fast substring search on log messages
-- (stack traces / error codes rarely match whole-word full-text search)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Metrics table (hypertable for time-series data)
--
-- stream_id is the Redis Stream message ID (e.g. "1725737382123-4") that
-- produced this row. It — not `time` — is what makes a row unique: two
-- distinct events for the same app_name+metric_name can legitimately land
-- in the same millisecond under real load, and `time` alone previously let
-- ON CONFLICT silently overwrite one with the other. stream_id is
-- monotonic and unique per stream, so it both preserves every distinct
-- event AND gives true idempotency if a message is ever redelivered
-- (Redis Streams are at-least-once) — the retry just re-writes the same
-- row instead of colliding with a different one.
CREATE TABLE IF NOT EXISTS metrics (
    time TIMESTAMPTZ NOT NULL,
    app_name VARCHAR(255) NOT NULL,
    metric_name VARCHAR(255) NOT NULL,
    metric_type VARCHAR(50) NOT NULL, -- counter, gauge, histogram
    value DOUBLE PRECISION NOT NULL,
    labels JSONB,
    stream_id TEXT NOT NULL,
    CONSTRAINT metrics_pkey PRIMARY KEY (time, app_name, metric_name, stream_id)
);

-- Convert to hypertable for time-series optimization
SELECT create_hypertable('metrics', 'time', if_not_exists => TRUE);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_metrics_app_name ON metrics (app_name, time DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics (metric_name, time DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_labels ON metrics USING GIN (labels);

-- Alerts configuration table
CREATE TABLE IF NOT EXISTS alert_rules (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    metric_name VARCHAR(255) NOT NULL,
    condition VARCHAR(50) NOT NULL, -- gt, lt, eq (greater than, less than, equal)
    threshold DOUBLE PRECISION NOT NULL,
    app_name VARCHAR(255),
    email_recipients TEXT[] NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Alert history table
CREATE TABLE IF NOT EXISTS alert_history (
    id SERIAL PRIMARY KEY,
    alert_rule_id INTEGER REFERENCES alert_rules(id),
    app_name VARCHAR(255) NOT NULL,
    triggered_at TIMESTAMPTZ NOT NULL,
    metric_value DOUBLE PRECISION NOT NULL,
    resolved_at TIMESTAMPTZ,
    notification_sent BOOLEAN DEFAULT TRUE
);

-- Application registry
CREATE TABLE IF NOT EXISTS applications (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) UNIQUE NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen TIMESTAMPTZ DEFAULT NOW()
);

-- Spans table (hypertable for distributed tracing)
--
-- Unlike metrics, span_id is a randomly generated 8-byte value (not a coarse
-- client timestamp), so (trace_id, span_id) can never legitimately collide
-- between two distinct spans — no stream_id needed in the key here.
CREATE TABLE IF NOT EXISTS spans (
    trace_id VARCHAR(32) NOT NULL,
    span_id VARCHAR(16) NOT NULL,
    parent_span_id VARCHAR(16),
    service_name VARCHAR(255) NOT NULL,
    operation_name VARCHAR(255) NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    duration_ms DOUBLE PRECISION NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ok',
    attributes JSONB,
    CONSTRAINT spans_pkey PRIMARY KEY (start_time, trace_id, span_id)
);

-- Convert to hypertable for time-series optimization
SELECT create_hypertable('spans', 'start_time', if_not_exists => TRUE);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_spans_trace_id ON spans (trace_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_spans_service ON spans (service_name, start_time DESC);

-- Logs table (hypertable for log aggregation)
--
-- stream_id in the PK for the same reason as metrics: `time` alone collides
-- at millisecond resolution under real load, and unlike spans (unique by a
-- random span_id), a log line has no equivalent natural key.
CREATE TABLE IF NOT EXISTS logs (
    time TIMESTAMPTZ NOT NULL,
    app_name VARCHAR(255) NOT NULL,
    level VARCHAR(20) NOT NULL, -- debug, info, warn, error
    message TEXT NOT NULL,
    trace_id VARCHAR(32),
    span_id VARCHAR(16),
    attributes JSONB,
    stream_id TEXT NOT NULL,
    CONSTRAINT logs_pkey PRIMARY KEY (time, app_name, stream_id)
);

-- Convert to hypertable for time-series optimization
SELECT create_hypertable('logs', 'time', if_not_exists => TRUE);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_logs_app_name ON logs (app_name, time DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level ON logs (level, time DESC);
CREATE INDEX IF NOT EXISTS idx_logs_trace_id ON logs (trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_logs_message_trgm ON logs USING GIN (message gin_trgm_ops);

-- Anomalies detected by packages/intelligence's periodic sweep. One row per
-- distinct anomalous (app_name, metric_name, time) data point — event
-- volume, not raw-signal volume, so a plain table (like alert_history)
-- rather than a hypertable.
CREATE TABLE IF NOT EXISTS anomalies (
    id SERIAL PRIMARY KEY,
    time TIMESTAMPTZ NOT NULL,           -- timestamp of the anomalous bucket
    app_name VARCHAR(255) NOT NULL,
    metric_name VARCHAR(255) NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    expected_value DOUBLE PRECISION,     -- rolling baseline mean at that point
    anomaly_score DOUBLE PRECISION NOT NULL, -- IsolationForest decision_function; more negative = more anomalous
    severity VARCHAR(20) NOT NULL DEFAULT 'warning', -- warning, critical
    algorithm VARCHAR(50) NOT NULL DEFAULT 'isolation_forest',
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB,
    CONSTRAINT anomalies_unique UNIQUE (app_name, metric_name, time)
);
CREATE INDEX IF NOT EXISTS idx_anomalies_app_time ON anomalies (app_name, time DESC);
CREATE INDEX IF NOT EXISTS idx_anomalies_metric ON anomalies (metric_name, time DESC);

-- Performance recommendations synthesized from anomalies + span aggregates
-- (packages/intelligence/src/recommendations.py). Rule-based, not ML —
-- deliberately explainable, see docs/adr/0001-*.md.
CREATE TABLE IF NOT EXISTS recommendations (
    id SERIAL PRIMARY KEY,
    app_name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,        -- latency, error_rate, resource
    severity VARCHAR(20) NOT NULL DEFAULT 'info', -- info, warning, critical
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    related_metric_name VARCHAR(255),
    related_operation_name VARCHAR(255),
    evidence JSONB,                       -- numbers backing the recommendation (p95s, anomaly ids, etc.)
    status VARCHAR(20) NOT NULL DEFAULT 'open', -- open, acknowledged, dismissed
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recommendations_app ON recommendations (app_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendations_status ON recommendations (status, created_at DESC);

-- Retention policy: keep data for 30 days
SELECT add_retention_policy('metrics', INTERVAL '30 days', if_not_exists => TRUE);
SELECT add_retention_policy('spans', INTERVAL '30 days', if_not_exists => TRUE);
SELECT add_retention_policy('logs', INTERVAL '30 days', if_not_exists => TRUE);

-- Create continuous aggregates for performance
CREATE MATERIALIZED VIEW IF NOT EXISTS metrics_1min
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 minute', time) AS bucket,
    app_name,
    metric_name,
    metric_type,
    AVG(value) as avg_value,
    MAX(value) as max_value,
    MIN(value) as min_value,
    COUNT(*) as count
FROM metrics
GROUP BY bucket, app_name, metric_name, metric_type
WITH NO DATA;

SELECT add_continuous_aggregate_policy('metrics_1min',
    start_offset => INTERVAL '1 hour',
    end_offset => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute',
    if_not_exists => TRUE);

-- Grant permissions
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO hermes;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO hermes;
