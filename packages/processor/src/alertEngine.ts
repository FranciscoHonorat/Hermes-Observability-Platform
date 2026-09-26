import { Logger } from '@hermes/shared';
import { pool } from './database';
import { sendAlertEmail } from './emailService';
import { config } from './config';

const logger = new Logger('AlertEngine');

const HTML_ESCAPES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
};

function escapeHtml(value: unknown): string {
    return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

interface AlertRule {
    id: number;
    tenant_id: number;
    name: string;
    description: string;
    metric_name: string;
    condition: 'gt' | 'lt' | 'eq';
    threshold: number;
    app_name?: string;
    email_recipients: string[];
    enabled: boolean;
}

interface AlertState {
    ruleId: number;
    isTriggered: boolean;
    lastNotificationTime?: Date;
}

const alertStates = new Map<number, AlertState>();

export async function startAlertEngine(): Promise<void> {
    logger.info('Alert Engine started');

    while (true) {
        try {
            await checkAlerts();
            await new Promise(resolve => 
                setTimeout(resolve, config.alertCheckInterval)
            );
        } catch (error) {
            logger.error('Error checking alerts:', error);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

async function checkAlerts(): Promise<void> {
    try {
        const rulesResult = await pool.query<AlertRule>(
            `SELECT id, tenant_id, name, description, metric_name, condition,
                    threshold, app_name, email_recipients, enabled
             FROM alert_rules
             WHERE enabled = true`
        );

        const rules = rulesResult.rows;
        logger.info(`Checking ${rules.length} alert rules`);

        for (const rule of rules) {
            await evaluateRule(rule);
        }
    } catch (error) {
        logger.error('Error fetching alert rules:', error);
        throw error;
    }
}

async function evaluateRule(rule: AlertRule): Promise<void> {
    try {
        const query = rule.app_name
            ? `SELECT value, time, app_name FROM metrics
               WHERE tenant_id = $1 AND metric_name = $2 AND app_name = $3
               ORDER BY time DESC LIMIT 1`
            : `SELECT value, time, app_name FROM metrics
               WHERE tenant_id = $1 AND metric_name = $2
               ORDER BY time DESC LIMIT 1`;

        const params = rule.app_name
            ? [rule.tenant_id, rule.metric_name, rule.app_name]
            : [rule.tenant_id, rule.metric_name];

        const result = await pool.query(query, params);

        if (result.rows.length === 0) {
            return;
        }

        const metric = result.rows[0];
        const currentValue = parseFloat(metric.value);
        const triggered = evaluateCondition(
            currentValue, 
            rule.condition, 
            rule.threshold
        );

        const state = alertStates.get(rule.id) || {
            ruleId: rule.id,
            isTriggered: false
        };

        if (triggered && !state.isTriggered) {
            logger.warn(`Alert triggered: ${rule.name}`, {
                metric: rule.metric_name,
                value: currentValue,
                threshold: rule.threshold,
                condition: rule.condition
            });

            await sendNotification(rule, metric, currentValue);

            await recordAlert(rule.tenant_id, rule.id, metric.app_name, currentValue);

            alertStates.set(rule.id, {
                ruleId: rule.id,
                isTriggered: true,
                lastNotificationTime: new Date()
            });
        } 
        else if (!triggered && state.isTriggered) {
            logger.info(`Alert resolved: ${rule.name}`);
            
            alertStates.set(rule.id, {
                ruleId: rule.id,
                isTriggered: false
            });
        }

    } catch (error) {
        logger.error(`Error evaluating rule ${rule.name}:`, error);
    }
}

export function evaluateCondition(
    value: number,
    condition: string,
    threshold: number
): boolean {
    switch (condition) {
        case 'gt':
            return value > threshold;
        case 'lt':
            return value < threshold;
        case 'eq':
            return value === threshold;
        default:
            logger.warn(`Unknown condition: ${condition}`);
            return false;
    }
}

async function sendNotification(
    rule: AlertRule, 
    metric: any, 
    currentValue: number
): Promise<void> {
    try {
        const subject = `Alert: ${rule.name}`;
        const body = `
            <h2>Alert Triggered</h2>
            <p><strong>Rule:</strong> ${escapeHtml(rule.name)}</p>
            <p><strong>Description:</strong> ${escapeHtml(rule.description)}</p>
            <p><strong>Application:</strong> ${escapeHtml(metric.app_name)}</p>
            <p><strong>Metric:</strong> ${escapeHtml(rule.metric_name)}</p>
            <p><strong>Current Value:</strong> ${escapeHtml(currentValue)}</p>
            <p><strong>Condition:</strong> ${escapeHtml(rule.condition)} ${escapeHtml(rule.threshold)}</p>
            <p><strong>Date/Time:</strong> ${new Date().toISOString()}</p>
        `;

        for (const recipient of rule.email_recipients) {
            await sendAlertEmail(recipient, subject, body);
        }

        logger.info(`Notifications sent to: ${rule.email_recipients.join(', ')}`);
    } catch (error) {
        logger.error('Error sending notification:', error);
    }
}

async function recordAlert(
    tenantId: number,
    ruleId: number,
    appName: string,
    value: number
): Promise<void> {
    try {
        await pool.query(
            `INSERT INTO alert_history (tenant_id, alert_rule_id, app_name, triggered_at, metric_value)
             VALUES ($1, $2, $3, NOW(), $4)`,
            [tenantId, ruleId, appName, value]
        );
    } catch (error) {
        logger.error('Error recording alert history:', error);
    }
}