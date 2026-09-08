/**
 * Validation utilities
 */

import { Metric, MetricType, AlertRuleInput, AlertRuleCondition, Span, SpanStatus, LogEntry, LogEntryLevel } from '../types';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALERT_CONDITIONS: AlertRuleCondition[] = ['gt', 'lt', 'eq'];
const TRACE_ID_RE = /^[0-9a-f]{32}$/;
const SPAN_ID_RE = /^[0-9a-f]{16}$/;
const SPAN_STATUSES: SpanStatus[] = ['ok', 'error'];
const LOG_LEVELS: LogEntryLevel[] = ['debug', 'info', 'warn', 'error'];

export class ValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ValidationError';
    }
}

export const validateMetric = (metric: any): metric is Metric => {
    if (!metric || typeof metric !== 'object') {
        throw new ValidationError('Metric must be an object');
    }

    if (!metric.name || typeof metric.name !== 'string') {
        throw new ValidationError('Metric name must be a string');
    }

    if (!Object.values(MetricType).includes(metric.type)) {
        throw new ValidationError(`Metric type must be one of: ${Object.values(MetricType).join(', ')}`);
    }

    if (typeof metric.value !== 'number' || isNaN(metric.value)) {
        throw new ValidationError('Metric value must be a valid number');
    }
 
    if (!metric.timestamp || typeof metric.timestamp !== 'number') { 
        throw new ValidationError('Metric timestamp must be a valid number');
    }

    return true;
}

export const validateSpan = (span: any): span is Span => {
    if (!span || typeof span !== 'object') {
        throw new ValidationError('Span must be an object');
    }

    if (!TRACE_ID_RE.test(span.traceId)) {
        throw new ValidationError('Span traceId must be a 32-char hex string');
    }

    if (!SPAN_ID_RE.test(span.spanId)) {
        throw new ValidationError('Span spanId must be a 16-char hex string');
    }

    if (span.parentSpanId !== undefined && !SPAN_ID_RE.test(span.parentSpanId)) {
        throw new ValidationError('Span parentSpanId must be a 16-char hex string');
    }

    if (!span.serviceName || typeof span.serviceName !== 'string') {
        throw new ValidationError('Span serviceName must be a string');
    }

    if (!span.operationName || typeof span.operationName !== 'string') {
        throw new ValidationError('Span operationName must be a string');
    }

    if (!span.startTime || typeof span.startTime !== 'number') {
        throw new ValidationError('Span startTime must be a valid number');
    }

    if (typeof span.duration !== 'number' || isNaN(span.duration) || span.duration < 0) {
        throw new ValidationError('Span duration must be a non-negative number');
    }

    if (!SPAN_STATUSES.includes(span.status)) {
        throw new ValidationError(`Span status must be one of: ${SPAN_STATUSES.join(', ')}`);
    }

    return true;
};

export const validateLogEntry = (log: any): log is LogEntry => {
    if (!log || typeof log !== 'object') {
        throw new ValidationError('Log entry must be an object');
    }

    if (!log.serviceName || typeof log.serviceName !== 'string') {
        throw new ValidationError('Log entry serviceName must be a string');
    }

    if (!LOG_LEVELS.includes(log.level)) {
        throw new ValidationError(`Log entry level must be one of: ${LOG_LEVELS.join(', ')}`);
    }

    if (!log.message || typeof log.message !== 'string') {
        throw new ValidationError('Log entry message must be a string');
    }

    if (!log.timestamp || typeof log.timestamp !== 'number') {
        throw new ValidationError('Log entry timestamp must be a valid number');
    }

    if (log.traceId !== undefined && !TRACE_ID_RE.test(log.traceId)) {
        throw new ValidationError('Log entry traceId must be a 32-char hex string');
    }

    if (log.spanId !== undefined && !SPAN_ID_RE.test(log.spanId)) {
        throw new ValidationError('Log entry spanId must be a 16-char hex string');
    }

    return true;
};

function validateEmailRecipients(value: any): asserts value is string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError('email_recipients must be a non-empty array');
  }
  for (const recipient of value) {
    if (typeof recipient !== 'string' || !EMAIL_RE.test(recipient)) {
      throw new ValidationError(`email_recipients contains an invalid address: ${recipient}`);
    }
  }
}

/** Full validation for creating a new alert rule (POST). */
export const validateAlertRule = (rule: any): rule is AlertRuleInput => {
  if (!rule || typeof rule !== 'object') {
    throw new ValidationError('Alert rule must be an object');
  }

  if (!rule.name || typeof rule.name !== 'string') {
    throw new ValidationError('Alert rule name is required');
  }

  if (!rule.metric_name || typeof rule.metric_name !== 'string') {
    throw new ValidationError('Alert rule metric_name is required');
  }

  if (!ALERT_CONDITIONS.includes(rule.condition)) {
    throw new ValidationError(`Alert rule condition must be one of: ${ALERT_CONDITIONS.join(', ')}`);
  }

  if (typeof rule.threshold !== 'number' || isNaN(rule.threshold)) {
    throw new ValidationError('Alert rule threshold must be a number');
  }

  if (rule.app_name !== undefined && rule.app_name !== null && typeof rule.app_name !== 'string') {
    throw new ValidationError('Alert rule app_name must be a string');
  }

  validateEmailRecipients(rule.email_recipients);

  if (rule.enabled !== undefined && typeof rule.enabled !== 'boolean') {
    throw new ValidationError('Alert rule enabled must be a boolean');
  }

  return true;
};

/**
 * Partial validation for updating an existing alert rule (PUT), where any
 * field may be omitted (left unchanged via COALESCE) but present fields
 * must still be well-formed.
 */
export const validateAlertRuleUpdate = (rule: any): rule is Partial<AlertRuleInput> => {
  if (!rule || typeof rule !== 'object') {
    throw new ValidationError('Alert rule update must be an object');
  }

  if (rule.name !== undefined && (typeof rule.name !== 'string' || !rule.name)) {
    throw new ValidationError('Alert rule name must be a non-empty string');
  }

  if (rule.metric_name !== undefined && (typeof rule.metric_name !== 'string' || !rule.metric_name)) {
    throw new ValidationError('Alert rule metric_name must be a non-empty string');
  }

  if (rule.condition !== undefined && !ALERT_CONDITIONS.includes(rule.condition)) {
    throw new ValidationError(`Alert rule condition must be one of: ${ALERT_CONDITIONS.join(', ')}`);
  }

  if (rule.threshold !== undefined && (typeof rule.threshold !== 'number' || isNaN(rule.threshold))) {
    throw new ValidationError('Alert rule threshold must be a number');
  }

  if (rule.app_name !== undefined && rule.app_name !== null && typeof rule.app_name !== 'string') {
    throw new ValidationError('Alert rule app_name must be a string');
  }

  if (rule.email_recipients !== undefined) {
    validateEmailRecipients(rule.email_recipients);
  }

  if (rule.enabled !== undefined && typeof rule.enabled !== 'boolean') {
    throw new ValidationError('Alert rule enabled must be a boolean');
  }

  return true;
};

export const sanitizeMetricName = (name: string): string => {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
};