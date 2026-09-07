import { describe, it, expect } from 'vitest';
import {
  validateMetric,
  validateAlertRule,
  validateAlertRuleUpdate,
  sanitizeMetricName,
  ValidationError
} from './validationUtilities';
import { MetricType, MetricUnit } from '../types/metricTypes';

const validMetric = {
  name: 'http_requests_total',
  type: MetricType.COUNTER,
  value: 1,
  unit: MetricUnit.COUNT,
  timestamp: Date.now()
};

const validAlertRule = {
  name: 'High error rate',
  metric_name: 'http_errors_total',
  condition: 'gt' as const,
  threshold: 100,
  email_recipients: ['ops@example.com']
};

describe('validateMetric', () => {
  it('accepts a well-formed metric', () => {
    expect(validateMetric(validMetric)).toBe(true);
  });

  it('rejects a missing name', () => {
    expect(() => validateMetric({ ...validMetric, name: '' })).toThrow(ValidationError);
  });

  it('rejects an unknown metric type', () => {
    expect(() => validateMetric({ ...validMetric, type: 'not-a-type' })).toThrow(ValidationError);
  });

  it('rejects a non-numeric value', () => {
    expect(() => validateMetric({ ...validMetric, value: 'abc' })).toThrow(ValidationError);
  });

  it('rejects a missing timestamp', () => {
    const { timestamp, ...rest } = validMetric;
    expect(() => validateMetric(rest)).toThrow(ValidationError);
  });
});

describe('validateAlertRule (create)', () => {
  it('accepts a well-formed rule', () => {
    expect(validateAlertRule(validAlertRule)).toBe(true);
  });

  it('rejects an invalid condition', () => {
    expect(() => validateAlertRule({ ...validAlertRule, condition: 'between' })).toThrow(ValidationError);
  });

  it('rejects a non-numeric threshold', () => {
    expect(() => validateAlertRule({ ...validAlertRule, threshold: 'high' })).toThrow(ValidationError);
  });

  it('rejects an empty email_recipients array', () => {
    expect(() => validateAlertRule({ ...validAlertRule, email_recipients: [] })).toThrow(ValidationError);
  });

  it('rejects a malformed email address', () => {
    expect(() => validateAlertRule({ ...validAlertRule, email_recipients: ['not-an-email'] })).toThrow(ValidationError);
  });

  it('rejects a missing metric_name', () => {
    const { metric_name, ...rest } = validAlertRule;
    expect(() => validateAlertRule(rest)).toThrow(ValidationError);
  });
});

describe('validateAlertRuleUpdate (partial)', () => {
  it('accepts an empty update', () => {
    expect(validateAlertRuleUpdate({})).toBe(true);
  });

  it('accepts a partial update with only enabled', () => {
    expect(validateAlertRuleUpdate({ enabled: false })).toBe(true);
  });

  it('rejects an invalid condition when present', () => {
    expect(() => validateAlertRuleUpdate({ condition: 'nope' })).toThrow(ValidationError);
  });

  it('rejects an empty name when present', () => {
    expect(() => validateAlertRuleUpdate({ name: '' })).toThrow(ValidationError);
  });

  it('rejects malformed emails when present', () => {
    expect(() => validateAlertRuleUpdate({ email_recipients: ['bad'] })).toThrow(ValidationError);
  });
});

describe('sanitizeMetricName', () => {
  it('lowercases and replaces invalid characters with underscores', () => {
    expect(sanitizeMetricName('HTTP Requests/Total!')).toBe('http_requests_total');
  });

  it('collapses repeated underscores and trims edges', () => {
    expect(sanitizeMetricName('__cpu--usage__')).toBe('cpu_usage');
  });
});
