/**
 * Validation utilities
 */

import { Metric, MetricType, AlertRule } from '../types';

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

export const validateAlertRule = (rule: any): rule is AlertRule => {
  if (!rule || typeof rule !== 'object') {
    throw new ValidationError('Alert rule must be an object');
  }

  if (!rule.name || typeof rule.name !== 'string') {
    throw new ValidationError('Alert rule name is required');
  }

  if (!rule.metric || typeof rule.metric !== 'string') {
    throw new ValidationError('Alert rule metric is required');
  }

  if (!rule.condition || typeof rule.condition !== 'object') {
    throw new ValidationError('Alert rule condition is required');
  }

  if (typeof rule.condition.threshold !== 'number') {
    throw new ValidationError('Alert rule threshold must be a number');
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