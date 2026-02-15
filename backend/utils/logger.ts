// ============================================
// Logger — Structured Logging with Pino
// ============================================

import pino from 'pino';

const baseLogger = pino({
    level: process.env.DEBUG_MODE === 'true' ? 'debug' : 'info',
    transport: {
        target: 'pino/file',
        options: { destination: 1 }, // stdout
    },
    formatters: {
        level: (label: string) => ({ level: label }),
    },
    timestamp: pino.stdTimeFunctions.isoTime,
});

// ----- Extended logger with convenience helpers -----

interface AppLogger extends pino.Logger {
    incomingMessage: (phoneNumber: string, messageType: string, text?: string) => void;
    jobCreated: (jobId: string, contractorPhone: string, skill: string, location: string) => void;
    workerAssigned: (workerPhone: string, jobId: string) => void;
    broadcastSent: (count: number, jobId: string) => void;
    serviceError: (service: string, error: Error) => void;
}

const logger = baseLogger as AppLogger;

/** Log an incoming WhatsApp message */
logger.incomingMessage = (phoneNumber: string, messageType: string, text?: string): void => {
    logger.info({ event: 'incoming_message', phoneNumber, messageType, text: text?.substring(0, 100) });
};

/** Log a job creation event */
logger.jobCreated = (jobId: string, contractorPhone: string, skill: string, location: string): void => {
    logger.info({ event: 'job_created', jobId, contractorPhone, skill, location });
};

/** Log a worker assignment */
logger.workerAssigned = (workerPhone: string, jobId: string): void => {
    logger.info({ event: 'worker_assigned', workerPhone, jobId });
};

/** Log a broadcast message */
logger.broadcastSent = (count: number, jobId: string): void => {
    logger.info({ event: 'broadcast_sent', recipientCount: count, jobId });
};

/** Log an error with context */
logger.serviceError = (service: string, error: Error): void => {
    logger.error({ event: 'service_error', service, message: error.message, stack: error.stack });
};

export default logger;
