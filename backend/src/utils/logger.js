// Simple logger utility for the application
// In production, this should be replaced with a proper logging library like winston or pino

const LogLevel = {
  ERROR: 0,
  WARN: 1,
  INFO: 2,
  DEBUG: 3
};

const logLevel = process.env.LOG_LEVEL ? 
  LogLevel[process.env.LOG_LEVEL.toUpperCase()] || LogLevel.INFO : 
  (process.env.NODE_ENV === 'production' ? LogLevel.INFO : LogLevel.DEBUG);

const logger = {
  error: (message, ...args) => {
    if (logLevel >= LogLevel.ERROR) {
      console.error(`[ERROR] ${new Date().toISOString()} - ${message}`, ...args);
    }
  },
  
  warn: (message, ...args) => {
    if (logLevel >= LogLevel.WARN) {
      console.warn(`[WARN] ${new Date().toISOString()} - ${message}`, ...args);
    }
  },
  
  info: (message, ...args) => {
    if (logLevel >= LogLevel.INFO) {
      console.log(`[INFO] ${new Date().toISOString()} - ${message}`, ...args);
    }
  },
  
  debug: (message, ...args) => {
    if (logLevel >= LogLevel.DEBUG) {
      console.log(`[DEBUG] ${new Date().toISOString()} - ${message}`, ...args);
    }
  }
};

export default logger;