import axios, { AxiosInstance } from 'axios';
import { MetricBatch, SpanBatch, LogBatch, Logger } from '@hermes/shared';

const logger = new Logger('Transport');

export class MetricTransport {
    private client: AxiosInstance;
    private collectorUrl: string;

    constructor(collectorUrl: string, apiKey?: string) {
        this.collectorUrl = collectorUrl;
        this.client = axios.create({
            baseURL: collectorUrl,
            timeout: 5000,
            headers: {
                'Content-Type': 'application/json',
                ...(apiKey ? { 'x-api-key': apiKey } : {})
            }
        });
    }

    async sendMetrics(batch: MetricBatch): Promise<void> {
        try {
            logger.debug(`Sending ${batch.metrics.length} metrics to collector`);

            await this.client.post('/api/v1/metrics', batch);

            logger.info(`Successfully sent ${batch.metrics.length} metrics to collector`);
        } catch (error: any) {
        if (error.response) {
            logger.error(`Failed to send metrics: ${error.response.status} - ${error.response.data}`);
        } else if (error.request) {
            logger.error(`No response from collector: ${this.collectorUrl}`);
        } else {
            logger.error(`Error sending metrics: ${error.message}`);
        }
        // Não lança erro para não quebrar a aplicação
        }
    }

    async sendSpans(batch: SpanBatch): Promise<void> {
        try {
            logger.debug(`Sending ${batch.spans.length} spans to collector`);

            await this.client.post('/api/v1/traces', batch);

            logger.info(`Successfully sent ${batch.spans.length} spans to collector`);
        } catch (error: any) {
        if (error.response) {
            logger.error(`Failed to send spans: ${error.response.status} - ${error.response.data}`);
        } else if (error.request) {
            logger.error(`No response from collector: ${this.collectorUrl}`);
        } else {
            logger.error(`Error sending spans: ${error.message}`);
        }
        // Não lança erro para não quebrar a aplicação
        }
    }

    async sendLogs(batch: LogBatch): Promise<void> {
        try {
            logger.debug(`Sending ${batch.logs.length} logs to collector`);

            await this.client.post('/api/v1/logs', batch);

            logger.info(`Successfully sent ${batch.logs.length} logs to collector`);
        } catch (error: any) {
        if (error.response) {
            logger.error(`Failed to send logs: ${error.response.status} - ${error.response.data}`);
        } else if (error.request) {
            logger.error(`No response from collector: ${this.collectorUrl}`);
        } else {
            logger.error(`Error sending logs: ${error.message}`);
        }
        // Não lança erro para não quebrar a aplicação
        }
    }
}