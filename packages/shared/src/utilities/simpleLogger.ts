export enum LogLevel {
    DEBUG = 'debug',
    INFO = 'info',
    WARN = 'warn',
    ERROR = 'error'
}

export class Logger {
    private context: string;

    constructor(context: string) {
        this.context = context;
    }

    private log(level: LogLevel, message: string, meta?: any) {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${level.toUpperCase()}] [${this.context}] ${message}`;

        if (meta) {
            console.log(logMessage, meta);
        } else {
            console.log(logMessage);
        }
    }

    debug(message: string, meta?: any) {
        this.log(LogLevel.DEBUG, message, meta);
    }

    info(message: string, meta?: any) {
        this.log(LogLevel.INFO, message, meta);
    }

    warn(message: string, meta?: any) {
        this.log(LogLevel.WARN, message, meta);
    }

    error(message: string, meta?: any) {
        this.log(LogLevel.ERROR, message, meta);
    }
}