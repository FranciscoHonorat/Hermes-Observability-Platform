import { Logger } from '@hermes/shared';
import { pool } from './database';
import { sendAlertEmail } from './emailService';
import { config } from './config';

const logger = new Logger('AlertEngine');

interface AlertRule {
    id: number;
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

// Mapa para controlar estado dos alertas (evita spam)
const alertStates = new Map<number, AlertState>();

export async function startAlertEngine(): Promise<void> {
    logger.info('Alert Engine iniciado');

    // Loop infinito para verificar alertas periodicamente
    while (true) {
        try {
            await checkAlerts();
            await new Promise(resolve => 
                setTimeout(resolve, config.alertCheckInterval)
            );
        } catch (error) {
            logger.error('Erro ao verificar alertas:', error);
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}

async function checkAlerts(): Promise<void> {
    try {
        // Buscar todas as regras de alerta ativas
        const rulesResult = await pool.query<AlertRule>(
            `SELECT id, name, description, metric_name, condition, 
                    threshold, app_name, email_recipients, enabled
             FROM alert_rules
             WHERE enabled = true`
        );

        const rules = rulesResult.rows;
        logger.info(`Verificando ${rules.length} regras de alerta`);

        for (const rule of rules) {
            await evaluateRule(rule);
        }
    } catch (error) {
        logger.error('Erro ao buscar regras de alerta:', error);
        throw error;
    }
}

async function evaluateRule(rule: AlertRule): Promise<void> {
    try {
        // Buscar o valor mais recente da métrica
        const query = rule.app_name
            ? `SELECT value, time, app_name FROM metrics
               WHERE metric_name = $1 AND app_name = $2
               ORDER BY time DESC LIMIT 1`
            : `SELECT value, time, app_name FROM metrics
               WHERE metric_name = $1
               ORDER BY time DESC LIMIT 1`;

        const params = rule.app_name 
            ? [rule.metric_name, rule.app_name]
            : [rule.metric_name];

        const result = await pool.query(query, params);

        if (result.rows.length === 0) {
            return; // Métrica não encontrada
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

        // Se o alerta foi disparado e não estava disparado antes
        if (triggered && !state.isTriggered) {
            logger.warn(`🚨 Alerta disparado: ${rule.name}`, {
                metric: rule.metric_name,
                value: currentValue,
                threshold: rule.threshold,
                condition: rule.condition
            });

            // Enviar notificação
            await sendNotification(rule, metric, currentValue);

            // Registrar alerta no banco
            await recordAlert(rule.id, metric.app_name, currentValue);

            // Atualizar estado
            alertStates.set(rule.id, {
                ruleId: rule.id,
                isTriggered: true,
                lastNotificationTime: new Date()
            });
        } 
        // Se não está mais disparado mas estava antes
        else if (!triggered && state.isTriggered) {
            logger.info(`✅ Alerta resolvido: ${rule.name}`);
            
            alertStates.set(rule.id, {
                ruleId: rule.id,
                isTriggered: false
            });
        }

    } catch (error) {
        logger.error(`Erro ao avaliar regra ${rule.name}:`, error);
    }
}

function evaluateCondition(
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
            logger.warn(`Condição desconhecida: ${condition}`);
            return false;
    }
}

async function sendNotification(
    rule: AlertRule, 
    metric: any, 
    currentValue: number
): Promise<void> {
    try {
        const subject = `🚨 Alerta: ${rule.name}`;
        const body = `
            <h2>Alerta Disparado</h2>
            <p><strong>Regra:</strong> ${rule.name}</p>
            <p><strong>Descrição:</strong> ${rule.description}</p>
            <p><strong>Aplicação:</strong> ${metric.app_name}</p>
            <p><strong>Métrica:</strong> ${rule.metric_name}</p>
            <p><strong>Valor Atual:</strong> ${currentValue}</p>
            <p><strong>Condição:</strong> ${rule.condition} ${rule.threshold}</p>
            <p><strong>Data/Hora:</strong> ${new Date().toISOString()}</p>
        `;

        for (const recipient of rule.email_recipients) {
            await sendAlertEmail(recipient, subject, body);
        }

        logger.info(`Notificações enviadas para: ${rule.email_recipients.join(', ')}`);
    } catch (error) {
        logger.error('Erro ao enviar notificação:', error);
    }
}

async function recordAlert(
    ruleId: number, 
    appName: string, 
    value: number
): Promise<void> {
    try {
        await pool.query(
            `INSERT INTO alert_history (alert_rule_id, app_name, triggered_at, metric_value)
             VALUES ($1, $2, NOW(), $3)`,
            [ruleId, appName, value]
        );
    } catch (error) {
        logger.error('Erro ao registrar histórico de alerta:', error);
    }
}