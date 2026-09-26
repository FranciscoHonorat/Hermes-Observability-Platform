CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE TABLE IF NOT EXISTS tenants (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) UNIQUE NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO tenants (id, name, slug) VALUES (1, 'Default', 'default') ON CONFLICT (id) DO NOTHING;
SELECT setval('tenants_id_seq', GREATEST((SELECT MAX(id) FROM tenants), 1));

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    email VARCHAR(255) NOT NULL,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'viewer',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT users_tenant_email_unique UNIQUE (tenant_id, email)
);

CREATE TABLE IF NOT EXISTS api_keys (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL REFERENCES tenants(id),
    key_hash TEXT UNIQUE NOT NULL,
    label VARCHAR(255),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    revoked_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS metrics (
    time TIMESTAMPTZ NOT NULL,
    tenant_id INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id),
    app_name VARCHAR(255) NOT NULL,
    metric_name VARCHAR(255) NOT NULL,
    metric_type VARCHAR(50) NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    labels JSONB,
    stream_id TEXT NOT NULL,
    CONSTRAINT metrics_pkey PRIMARY KEY (time, tenant_id, app_name, metric_name, stream_id)
);

SELECT create_hypertable('metrics', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_metrics_app_name ON metrics (tenant_id, app_name, time DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_name ON metrics (tenant_id, metric_name, time DESC);
CREATE INDEX IF NOT EXISTS idx_metrics_labels ON metrics USING GIN (labels);

CREATE TABLE IF NOT EXISTS alert_rules (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    metric_name VARCHAR(255) NOT NULL,
    condition VARCHAR(50) NOT NULL,
    threshold DOUBLE PRECISION NOT NULL,
    app_name VARCHAR(255),
    email_recipients TEXT[] NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_alert_rules_tenant ON alert_rules (tenant_id);

CREATE TABLE IF NOT EXISTS alert_history (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id),
    alert_rule_id INTEGER REFERENCES alert_rules(id),
    app_name VARCHAR(255) NOT NULL,
    triggered_at TIMESTAMPTZ NOT NULL,
    metric_value DOUBLE PRECISION NOT NULL,
    resolved_at TIMESTAMPTZ,
    notification_sent BOOLEAN DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_alert_history_tenant ON alert_history (tenant_id);

CREATE TABLE IF NOT EXISTS applications (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT applications_tenant_name_unique UNIQUE (tenant_id, name)
);

CREATE TABLE IF NOT EXISTS spans (
    trace_id VARCHAR(32) NOT NULL,
    span_id VARCHAR(16) NOT NULL,
    tenant_id INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id),
    parent_span_id VARCHAR(16),
    service_name VARCHAR(255) NOT NULL,
    operation_name VARCHAR(255) NOT NULL,
    start_time TIMESTAMPTZ NOT NULL,
    duration_ms DOUBLE PRECISION NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ok',
    attributes JSONB,
    CONSTRAINT spans_pkey PRIMARY KEY (start_time, tenant_id, trace_id, span_id)
);

SELECT create_hypertable('spans', 'start_time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_spans_trace_id ON spans (tenant_id, trace_id, start_time DESC);
CREATE INDEX IF NOT EXISTS idx_spans_service ON spans (tenant_id, service_name, start_time DESC);

CREATE TABLE IF NOT EXISTS logs (
    time TIMESTAMPTZ NOT NULL,
    tenant_id INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id),
    app_name VARCHAR(255) NOT NULL,
    level VARCHAR(20) NOT NULL,
    message TEXT NOT NULL,
    trace_id VARCHAR(32),
    span_id VARCHAR(16),
    attributes JSONB,
    stream_id TEXT NOT NULL,
    CONSTRAINT logs_pkey PRIMARY KEY (time, tenant_id, app_name, stream_id)
);

SELECT create_hypertable('logs', 'time', if_not_exists => TRUE);

CREATE INDEX IF NOT EXISTS idx_logs_app_name ON logs (tenant_id, app_name, time DESC);
CREATE INDEX IF NOT EXISTS idx_logs_level ON logs (tenant_id, level, time DESC);
CREATE INDEX IF NOT EXISTS idx_logs_trace_id ON logs (trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_logs_message_trgm ON logs USING GIN (message gin_trgm_ops);

CREATE TABLE IF NOT EXISTS anomalies (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id),
    time TIMESTAMPTZ NOT NULL,
    app_name VARCHAR(255) NOT NULL,
    metric_name VARCHAR(255) NOT NULL,
    value DOUBLE PRECISION NOT NULL,
    expected_value DOUBLE PRECISION,
    anomaly_score DOUBLE PRECISION NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'warning',
    algorithm VARCHAR(50) NOT NULL DEFAULT 'isolation_forest',
    detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB,
    CONSTRAINT anomalies_unique UNIQUE (tenant_id, app_name, metric_name, time)
);
CREATE INDEX IF NOT EXISTS idx_anomalies_app_time ON anomalies (tenant_id, app_name, time DESC);
CREATE INDEX IF NOT EXISTS idx_anomalies_metric ON anomalies (tenant_id, metric_name, time DESC);

CREATE TABLE IF NOT EXISTS recommendations (
    id SERIAL PRIMARY KEY,
    tenant_id INTEGER NOT NULL DEFAULT 1 REFERENCES tenants(id),
    app_name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'info',
    title VARCHAR(255) NOT NULL,
    description TEXT NOT NULL,
    related_metric_name VARCHAR(255),
    related_operation_name VARCHAR(255),
    evidence JSONB,
    status VARCHAR(20) NOT NULL DEFAULT 'open',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recommendations_app ON recommendations (tenant_id, app_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_recommendations_status ON recommendations (tenant_id, status, created_at DESC);

SELECT add_retention_policy('metrics', INTERVAL '30 days', if_not_exists => TRUE);
SELECT add_retention_policy('spans', INTERVAL '30 days', if_not_exists => TRUE);
SELECT add_retention_policy('logs', INTERVAL '30 days', if_not_exists => TRUE);

CREATE MATERIALIZED VIEW IF NOT EXISTS metrics_1min
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 minute', time) AS bucket,
    tenant_id,
    app_name,
    metric_name,
    metric_type,
    AVG(value) as avg_value,
    MAX(value) as max_value,
    MIN(value) as min_value,
    COUNT(*) as count
FROM metrics
GROUP BY bucket, tenant_id, app_name, metric_name, metric_type
WITH NO DATA;

SELECT add_continuous_aggregate_policy('metrics_1min',
    start_offset => INTERVAL '1 hour',
    end_offset => INTERVAL '1 minute',
    schedule_interval => INTERVAL '1 minute',
    if_not_exists => TRUE);

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO hermes;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO hermes;
