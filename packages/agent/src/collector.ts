import { Metric, MetricBatch, Logger } from '@hermes/shared';
import { MetricTransport } from './transport';
import { loadConfig } from './config';
import { collectCpuMetrics } from './metrics/cpu';
import { collectMemoryMetrics } from './metrics/memory';
import { collectEventLoopMetrics, collectUptimeMetric } from './metrics/eventloop';
import { getHttpMetrics } from './metrics/http';

const logger = new Logger('MetricsCollector');

export class MetricsCollector {
    private transport: MetricTransport;
    private config: ReturnType<typeof loadConfig>;
    private intervalId?: NodeJS.Timeout;
    private isRunning: boolean = false;

    constructor(config?: Partial<ReturnType<typeof loadConfig>>) {
        this.config = { ...loadConfig(), ...config };
        this.transport = new MetricTransport(this.config.collectorUrl);
        
        logger.info('Hermes Agent initialized', {
            service: this.config.serviceName,
            environment: this.config.environment,
            collectorUrl: this.config.collectorUrl
        });
    }

    /**
     * Inicia a coleta automática de métricas
     */
    start(): void {
        if (this.isRunning) {
            logger.warn('Metrics collector is already running');
            return;
        }

        logger.info(`Starting metrics collection every ${this.config.collectInterval}ms`);
        this.isRunning = true;

        // Coleta imediata
        this.collectAndSend();

        // Coleta periódica
        this.intervalId = setInterval(() => {
            this.collectAndSend();
        }, this.config.collectInterval);
    }

    /**
     * Para a coleta automática de métricas
     */
    stop(): void {
        if (!this.isRunning) {
            return;
        }

        logger.info('Stopping metrics collection');
        
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = undefined;
        }
        
        this.isRunning = false;
    }

    /**
     * Coleta todas as métricas e envia para o collector
     */
    private async collectAndSend(): Promise<void> {
        try {
            const metrics = await this.collectAllMetrics();
            
            if (metrics.length === 0) {
                logger.debug('No metrics to send');
                return;
            }

            // Adicionar metadata a todas as métricas
            const enrichedMetrics = metrics.map(metric => ({
                ...metric,
                metadata: {
                    service: this.config.serviceName,
                    environment: this.config.environment,
                    host: this.config.host,
                    ...metric.metadata
                },
                labels: {
                    ...this.config.labels,
                    ...metric.labels
                }
            }));

            const batch: MetricBatch = {
                metrics: enrichedMetrics,
                timestamp: Date.now()
            };

            await this.transport.sendMetrics(batch);
        } catch (error: any) {
            logger.error('Failed to collect and send metrics:', error.message);
        }
    }

    /**
     * Coleta todas as métricas do sistema
     */
    private async collectAllMetrics(): Promise<Metric[]> {
        const allMetrics: Metric[] = [];

        try {
            // CPU metrics
            const cpuMetrics = collectCpuMetrics();
            allMetrics.push(...cpuMetrics);

            // Memory metrics
            const memoryMetrics = collectMemoryMetrics();
            allMetrics.push(...memoryMetrics);

            // Event Loop metrics (async)
            const eventLoopMetrics = await collectEventLoopMetrics();
            allMetrics.push(...eventLoopMetrics);

            // Uptime metric
            const uptimeMetrics = collectUptimeMetric();
            allMetrics.push(...uptimeMetrics);

            // HTTP metrics (se houver)
            const httpMetrics = getHttpMetrics();
            allMetrics.push(...httpMetrics);

            logger.debug(`Collected ${allMetrics.length} metrics`);
        } catch (error: any) {
            logger.error('Error collecting metrics:', error.message);
        }

        return allMetrics;
    }

    /**
     * Registra uma métrica customizada
     */
    recordMetric(metric: Metric): void {
        const enrichedMetric = {
            ...metric,
            metadata: {
                service: this.config.serviceName,
                environment: this.config.environment,
                host: this.config.host,
                ...metric.metadata
            },
            labels: {
                ...this.config.labels,
                ...metric.labels
            }
        };

        const batch: MetricBatch = {
            metrics: [enrichedMetric],
            timestamp: Date.now()
        };

        this.transport.sendMetrics(batch).catch(err => {
            logger.error('Failed to send custom metric:', err.message);
        });
    }
}

// Export singleton para facilitar uso
let defaultCollector: MetricsCollector | null = null;

export function createAgent(config?: Partial<ReturnType<typeof loadConfig>>): MetricsCollector {
    if (!defaultCollector) {
        defaultCollector = new MetricsCollector(config);
    }
    return defaultCollector;
}
