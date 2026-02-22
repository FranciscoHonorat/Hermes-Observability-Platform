"use strict";
/**
 * Alert Types - Alert configuration and notifications
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.AlertChannel = exports.AlertStatus = exports.AlertSeverity = void 0;
var AlertSeverity;
(function (AlertSeverity) {
    AlertSeverity["INFO"] = "info";
    AlertSeverity["WARNING"] = "warning";
    AlertSeverity["ERROR"] = "error";
    AlertSeverity["CRITICAL"] = "critical";
})(AlertSeverity || (exports.AlertSeverity = AlertSeverity = {}));
var AlertStatus;
(function (AlertStatus) {
    AlertStatus["PENDING"] = "pending";
    AlertStatus["FIRING"] = "firing";
    AlertStatus["RESOLVED"] = "resolved";
    AlertStatus["ACKNOWLEDGED"] = "acknowledged";
})(AlertStatus || (exports.AlertStatus = AlertStatus = {}));
var AlertChannel;
(function (AlertChannel) {
    AlertChannel["EMAIL"] = "email";
    AlertChannel["SLACK"] = "slack";
    AlertChannel["WEBHOOK"] = "webhook";
    AlertChannel["SMS"] = "sms";
})(AlertChannel || (exports.AlertChannel = AlertChannel = {}));
//# sourceMappingURL=alertTypes.js.map