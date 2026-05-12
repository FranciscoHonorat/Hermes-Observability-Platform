-- Enable TimescaleDB extension
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- Metrics table (hypertable for time-series data)
CREATE TABLE IF NOT EXISTS metrics (
    time TIMESTAMPTZ NOT NULL,
    app_name VARCHAR(255) NOT NULL,
    metric_name VARCHAR(255) NOT NULL,
    metric_type VARCHAR(50) NOT NULL, -- counter, gauge, histogram
    value DOUBLE PRECISION NOT NULL,
    labels JSONB,
    CONSTRAINT metrics_pkey PRIMARY KEY (time, app_name, metric_name)
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

-- Retention policy: keep data for 30 days
SELECT add_retention_policy('metrics', INTERVAL '30 days', if_not_exists => TRUE);

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
