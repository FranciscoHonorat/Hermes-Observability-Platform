import { AgentConfig } from '@hermes/shared';

export const loadConfig = (): AgentConfig => {
    const config: AgentConfig = {
        collectorUrl: process.env.HERMES_COLLECTOR_URL || 'http://localhost:4000/collect',
        collectInterval: parseInt(process.env.HERMES_COLLECT_INTERVAL || '10000', 10),
        serviceName: process.env.HERMES_SERVICE_NAME || 'unknown-service',
        environment: process.env.HERMES_ENVIRONMENT || 'development',
        host: process.env.HOSTNAME || require('os').hostname(),
        labels: {}
    };

    // Parse custom labels from env
    const customLabels = process.env.HERMES_LABELS;
    if (customLabels) {
        customLabels.split(',').forEach(pair => {
            const [key, value] = pair.split('=');
            if (key && value && config.labels) {
                config.labels[key.trim()] = value.trim();
            }
        });
    }
    return config;
};