import axios, { AxiosInstance } from 'axios';
import { MetricBatch, Logger } from '@hermes/shared';

const logger = new Logger('Transport');

export class MetricTransport {
    private client: AxiosInstance;
    private collectorUrl: string;

    constructor(collectorUrl: string) {
        this.collectorUrl = collectorUrl;
        this.client = axios.create({
            baseURL: collectorUrl,
            timeout: 5000,
            headers: {
                'Content-Type': 'application/json'
            }
        });
    }

    async sendMetrics(batch: MetricBatch): Promise<void> {
        try {
            logger.debug(`Sending ${batch.metrics.length} metrics to collector`);

            await this.client.post('/api/v1/metrics', batch);

            logger.info(`Sucessfully sent ${batch.metrics.length} metrics to collector`);
        } catch (error) {
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
}