"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = exports.LogLevel = void 0;
var LogLevel;
(function (LogLevel) {
    LogLevel["DEBUG"] = "debug";
    LogLevel["INFO"] = "info";
    LogLevel["WARN"] = "warn";
    LogLevel["ERROR"] = "error";
})(LogLevel || (exports.LogLevel = LogLevel = {}));
class Logger {
    constructor(context) {
        this.context = context;
    }
    log(level, message, meta) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${level.toUpperCase()}] [${this.context}] ${message}`;
        if (meta) {
            console.log(logMessage, meta);
        }
        else {
            console.log(logMessage);
        }
    }
    debug(message, meta) {
        this.log(LogLevel.DEBUG, message, meta);
    }
    info(message, meta) {
        this.log(LogLevel.INFO, message, meta);
    }
    warn(message, meta) {
        this.log(LogLevel.WARN, message, meta);
    }
    error(message, meta) {
        this.log(LogLevel.ERROR, message, meta);
    }
}
exports.Logger = Logger;
//# sourceMappingURL=simpleLogger.js.map