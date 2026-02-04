import * as  os from 'os';
import { Metric, MetricType, MetricUnit } from '@hermes/shared';

let previousCpuUsage = process.cpuUsage();
let previousTime = Date.now();

export const collectCpuMetrics = (): Metric[] => {
    const metrics: Metric[] = [];

    //System CPU Usage (%)
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    cpus.forEach(cpu => {
        for (const type in cpu.times) {
            totalIdle += cpu.times[type as keyof typeof cpu.times];
        }
        totalIdle += cpu.times.idle;
    });

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - (100 * idle / total);

    metrics.push({
        name: 'system.cpu.usage',
        type: MetricType.GAUGE,
        value: Math.round(usage * 100) / 100,
        unit: MetricUnit.PERCENT,
        timestamp: Date.now()
    });

    //Process CPU Usage (%)
    const currentCpuUsage = process.cpuUsage(previousCpuUsage);
    const currentTime = Date.now();
    const elapsedTime = currentTime - previousTime;

    const userUsage = currentCpuUsage.user / 1000; // microseconds to milliseconds
    const systemUsage = currentCpuUsage.system / 1000;
    const totalUsage = (userUsage + systemUsage) / elapsedTime * 100;

    metrics.push({
        name: 'process.cpu.usage',
        type: MetricType.GAUGE,
        value: Math.round(totalUsage * 100) / 100,
        unit: MetricUnit.PERCENT,
        timestamp: Date.now()
    });

    previousCpuUsage = process.cpuUsage();
    previousTime = currentTime;

    return metrics;
};