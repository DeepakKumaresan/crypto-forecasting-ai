/**
 * Centralized logging utility
 * Configures Winston logger with appropriate transports and log levels
 */

const winston = require('winston');
const { createLogger, format, transports } = winston;
const { combine, timestamp, printf, colorize, json } = format;

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4
};

// Define level based on environment
const level = () => {
  const env = process.env.NODE_ENV || 'development';
  return env === 'development' ? 'debug' : 'info';
};

// Define custom format for console output
const consoleFormat = combine(
  colorize({ all: true }),
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  printf(({ timestamp, level, message, ...metadata }) => {
    let metaStr = '';
    if (Object.keys(metadata).length > 0 && metadata.constructor === Object) {
      metaStr = JSON.stringify(metadata, null, 2);
    }
    return `[${timestamp}] ${level}: ${message} ${metaStr}`;
  })
);

// Define custom format for file and JSON output
const fileFormat = combine(
  timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  json()
);

// Create transports array
const logTransports = [
  // Console transport for all environments
  new transports.Console({
    level: level(),
    format: consoleFormat
  })
];

// Add file transports in production
if (process.env.NODE_ENV === 'production') {
  logTransports.push(
    // File transport for errors and warnings
    new transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    }),
    // File transport for all logs
    new transports.File({
      filename: 'logs/combined.log',
      format: fileFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5
    })
  );
}

// Create the logger instance
const logger = createLogger({
  level: level(),
  levels,
  transports: logTransports,
  exitOnError: false
});

// HTTP request logger
const httpLogger = (req, res, next) => {
  // Log HTTP request
  logger.http(`${req.method} ${req.url}`, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
    referer: req.headers.referer || '',
    query: req.query,
    params: req.params
  });
  next();
};

module.exports = logger;
module.exports.httpLogger = httpLogger;