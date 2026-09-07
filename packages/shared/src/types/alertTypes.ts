/**
 * Alert Types - Alert configuration and notifications
 */

export enum AlertSeverity {
    INFO = 'info',
    WARNING = 'warning',
    ERROR = 'error',
    CRITICAL = 'critical'
}

export enum AlertStatus {
    PENDING = 'pending',
    FIRING = 'firing',
    RESOLVED = 'resolved',
    ACKNOWLEDGED = 'acknowledged'
}

export enum AlertChannel {
  EMAIL = 'email',
  SLACK = 'slack',
  WEBHOOK = 'webhook',
  SMS = 'sms'
}

export interface AlertRule {
  id: string;
  name: string;
  description?: string;
  metric: string;
  condition: {
    operator: '>' | '<' | '>=' | '<=' | '==' | '!=';
    threshold: number;
    duration?: number; // seconds
  };
  severity: AlertSeverity;
  channels: AlertChannel[];
  enabled: boolean;
  labels?: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

export interface Alert {
  id: string;
  ruleId: string;
  ruleName: string;
  severity: AlertSeverity;
  status: AlertStatus;
  message: string;
  metric: {
    name: string;
    value: number;
    threshold: number;
  };
  labels?: Record<string, string>;
  firedAt: number;
  resolvedAt?: number;
  acknowledgedAt?: number;
  acknowledgedBy?: string;
}

export interface AlertNotification {
  alertId: string;
  channel: AlertChannel;
  recipient: string;
  sentAt: number;
  success: boolean;
  error?: string;
}

/**
 * Shape actually persisted in the `alert_rules` table and accepted by the
 * API's /api/v1/alerts routes. Distinct from AlertRule above, which models
 * a richer, not-yet-implemented multi-channel rule.
 */
export type AlertRuleCondition = 'gt' | 'lt' | 'eq';

export interface AlertRuleInput {
  name: string;
  description?: string;
  metric_name: string;
  condition: AlertRuleCondition;
  threshold: number;
  app_name?: string;
  email_recipients: string[];
  enabled?: boolean;
}