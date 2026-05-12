"use strict";
/**
 * Metric Types - Core metric data structures
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.MetricUnit = exports.MetricType = void 0;
var MetricType;
(function (MetricType) {
    MetricType["COUNTER"] = "counter";
    MetricType["GAUGE"] = "gauge";
    MetricType["HISTOGRAM"] = "histogram";
    MetricType["SUMMARY"] = "summary";
})(MetricType || (exports.MetricType = MetricType = {}));
var MetricUnit;
(function (MetricUnit) {
    MetricUnit["BYTES"] = "bytes";
    MetricUnit["MILLISECONDS"] = "milliseconds";
    MetricUnit["SECONDS"] = "seconds";
    MetricUnit["PERCENT"] = "percent";
    MetricUnit["COUNT"] = "count";
    MetricUnit["REQUESTS_PER_SECOND"] = "rps";
})(MetricUnit || (exports.MetricUnit = MetricUnit = {}));
//# sourceMappingURL=metricTypes.js.map