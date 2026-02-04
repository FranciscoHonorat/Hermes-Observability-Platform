import * as os from 'os';
import { Metric, MetricType, MetricUnit } from '@hermes/shared';

export const collectMemoryMetrics = (): Metric[] => {
    const metrics: Metric[] = [];

    //System Memory
    const totalMemory = os.totalmem();
    const freeMemory = os.freemem();
    const usedMemory = totalMemory - freeMemory;

    metrics.push({
        name: 'system.memory.total',
        type: MetricType.GAUGE,
        value: totalMemory,
        unit: MetricUnit.BYTES,
        timestamp: Date.now()
    });

    metrics.push({
        name: 'system.memory.used',
        type: MetricType.GAUGE,
        value: usedMemory,
        unit: MetricUnit.BYTES,
        timestamp: Date.now()
    });

    metrics.push({
        name: 'system.memory.usage',
        type: MetricType.GAUGE,
        value: Math.round(memoryUsagePercent * 100) / 100,
        unit: MetricUnit.PERCENTAGE,
        timestamp: Date.now()
    });

    // Process Memory
    const processMemory = process.memoryUsage();

    metrics.push({
        name: 'process.memory.rss',
        type: MetricType.GAUGE,
        value: processMemory.rss,
        unit: MetricUnit.BYTES,
        timestamp: Date.now()
    });

    metrics.push({
        name: 'process.memory.heapTotal',
        type: MetricType.GAUGE,
        value: processMemory.heapTotal,
        unit: MetricUnit.BYTES,
        timestamp: Date.now()
    });

    metrics.push({
        name: 'process.memory.heapUsed',
        type: MetricType.GAUGE,
        value: processMemory.heapUsed,
        unit: MetricUnit.BYTES,
        timestamp: Date.now()
    });

    return metrics;
};