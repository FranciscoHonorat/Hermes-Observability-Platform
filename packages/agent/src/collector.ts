import { Metric, MetricBatch, Span, SpanBatch, LogEntry, LogBatch, Logger } from '@hermes/shared';
import { MetricTransport } from './transport';
import { loadConfig } from './config';
import { collectCpuMetrics } from './metrics/cpu';
import { collectMemoryMetrics } from './metrics/memory';
import { collectEventLoopMetrics, collectUptimeMetric } from './metrics/eventloop';
import { getHttpMetrics } from './metrics/http';
import { getCompletedSpans } from './tracing/span';
import { getCompletedLogs } from './logging/log';

const logger = new Logger('MetricsCollector');

export class MetricsCollector {
    private transport: MetricTransport;
    private config: ReturnType<typeof loadConfig>;
    private intervalId?: NodeJS.Timeout;
    private isRunning: boolean = false;

    constructor(config?: Partial<ReturnType<typeof loadConfig>>) {
        this.config = { ...loadConfig(), ...config };
        this.transport = new MetricTransport(this.config.collectorUrl, this.config.apiKey);
        
        logger.info('Hermes Agent initialized', {
            service: this.config.serviceName,
            environment: this.config.environment,
            collectorUrl: this.config.collectorUrl
        });
    }

    start(): void {
        if (this.isRunning) {
            logger.warn('Metrics collector is already running');
            return;
        }

        logger.info(`Starting metrics collection every ${this.config.collectInterval}ms`);
        this.isRunning = true;

        this.collectAndSend();

        this.intervalId = setInterval(() => {
            this.collectAndSend();
        }, this.config.collectInterval);
    }

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

    private async collectAndSend(): Promise<void> {
        try {
            const metrics = await this.collectAllMetrics();
            
            if (metrics.length === 0) {
                logger.debug('No metrics to send');
                return;
            }

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

        await this.collectAndSendSpans();
        await this.collectAndSendLogs();
    }

    private async collectAndSendSpans(): Promise<void> {
        try {
            const spans = getCompletedSpans();

            if (spans.length === 0) {
                return;
            }

            const enrichedSpans: Span[] = spans.map(span => ({
                ...span,
                serviceName: this.config.serviceName
            }));

            const batch: SpanBatch = {
                spans: enrichedSpans,
                timestamp: Date.now()
            };

            await this.transport.sendSpans(batch);
        } catch (error: any) {
            logger.error('Failed to collect and send spans:', error.message);
        }
    }

    private async collectAndSendLogs(): Promise<void> {
        try {
            const logs = getCompletedLogs();

            if (logs.length === 0) {
                return;
            }

            const enrichedLogs: LogEntry[] = logs.map(entry => ({
                ...entry,
                serviceName: this.config.serviceName
            }));

            const batch: LogBatch = {
                logs: enrichedLogs,
                timestamp: Date.now()
            };

            await this.transport.sendLogs(batch);
        } catch (error: any) {
            logger.error('Failed to collect and send logs:', error.message);
        }
    }

    private async collectAllMetrics(): Promise<Metric[]> {
        const allMetrics: Metric[] = [];

        try {
            const cpuMetrics = collectCpuMetrics();
            allMetrics.push(...cpuMetrics);

            const memoryMetrics = collectMemoryMetrics();
            allMetrics.push(...memoryMetrics);

            const eventLoopMetrics = await collectEventLoopMetrics();
            allMetrics.push(...eventLoopMetrics);

            const uptimeMetrics = collectUptimeMetric();
            allMetrics.push(...uptimeMetrics);

            const httpMetrics = getHttpMetrics();
            allMetrics.push(...httpMetrics);

            logger.debug(`Collected ${allMetrics.length} metrics`);
        } catch (error: any) {
            logger.error('Error collecting metrics:', error.message);
        }

        return allMetrics;
    }

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

let defaultCollector: MetricsCollector | null = null;

export function createAgent(config?: Partial<ReturnType<typeof loadConfig>>): MetricsCollector {
    if (!defaultCollector) {
        defaultCollector = new MetricsCollector(config);
    }
    return defaultCollector;
}
