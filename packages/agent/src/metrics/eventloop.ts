import { Metric, MetricType, MetricUnit } from '@hermes/shared';

let lastCheck = 0;

export const collectEventLoopMetrics = (): Promise<Metric[]> => {
    return new Promise(resolve => {
        const start = Date.now();

        setImmediate(() => {
            const lag = Date.now() - start;

            const metric: Metric = {
                name: 'nodejs.eventloop.lag',
                type: MetricType.GAUGE,
                value: lag,
                unit: MetricUnit.MILLISECONDS,
                timestamp: Date.now()
            };

            resolve([metric]);
        });
    });
};

export const collectUptimeMetric = (): Metric[] => {
    return [{
        name: 'process.uptime',
        type: MetricType.GAUGE,
        value: Math.floor(process.uptime()),
        unit: MetricUnit.SECONDS,
        timestamp: Date.now()
    }];
};