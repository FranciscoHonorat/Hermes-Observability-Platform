/**
 * Validation utilities
 */
import { Metric, AlertRule } from '../types';
export declare class ValidationError extends Error {
    constructor(message: string);
}
export declare const validateMetric: (metric: any) => metric is Metric;
export declare const validateAlertRule: (rule: any) => rule is AlertRule;
export declare const sanitizeMetricName: (name: string) => string;
//# sourceMappingURL=validationUtilities.d.ts.map