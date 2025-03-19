/**
 * Error handling utility for the application
 * Provides centralized error handling and logging
 */

const Sentry = require('@sentry/node');
const logger = require('./logger');

// Custom error classes
class APIError extends Error {
  constructor(message, statusCode, details = {}) {
    super(message);
    this.name = 'APIError';
    this.statusCode = statusCode;
    this.details = details;
  }
}

class ValidationError extends Error {
  constructor(message, fields = {}) {
    super(message);
    this.name = 'ValidationError';
    this.statusCode = 400;
    this.fields = fields;
  }
}

class AuthenticationError extends Error {
  constructor(message) {
    super(message || 'Authentication failed');
    this.name = 'AuthenticationError';
    this.statusCode = 401;
  }
}

class NotFoundError extends Error {
  constructor(resource) {
    super(`Resource not found: ${resource}`);
    this.name = 'NotFoundError';
    this.statusCode = 404;
    this.resource = resource;
  }
}

/**
 * Global error handler middleware for Express
 */
const errorMiddleware = (err, req, res, next) => {
  // Log the error
  logger.error(`${err.name}: ${err.message}`, {
    stack: err.stack,
    path: req.path,
    method: req.method,
    ...(err.details || {}),
    ...(err.fields || {})
  });

  // Report error to Sentry if it's serious
  if (!err.statusCode || err.statusCode >= 500) {
    Sentry.captureException(err);
  }

  // Determine status code
  const statusCode = err.statusCode || 500;

  // Prepare error response
  const errorResponse = {
    error: {
      message: err.message || 'Internal Server Error',
      type: err.name || 'ServerError'
    }
  };

  // Add additional details for specific error types
  if (err instanceof ValidationError) {
    errorResponse.error.fields = err.fields;
  }

  if (err instanceof NotFoundError) {
    errorResponse.error.resource = err.resource;
  }

  if (err.details) {
    errorResponse.error.details = err.details;
  }

  // Don't send stack traces in production
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.error.stack = err.stack;
  }

  // Send error response
  res.status(statusCode).json(errorResponse);
};

/**
 * Async handler to avoid try-catch blocks in routes
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Express middleware function
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Handle unhandled promise rejections
 */
const setupUnhandledRejectionHandler = () => {
  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection:', reason);
    Sentry.captureException(reason);
    
    // In production, we want to keep the server running
    // In development, we might want to crash to highlight the issue
    if (process.env.NODE_ENV !== 'production') {
      throw reason;
    }
  });
};

/**
 * Handle uncaught exceptions
 */
const setupUncaughtExceptionHandler = () => {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    Sentry.captureException(error);
    
    // For uncaught exceptions, we should exit the process
    // But first, give time for logging to complete
    setTimeout(() => {
      process.exit(1);
    }, 1000);
  });
};

module.exports = {
  APIError,
  ValidationError,
  AuthenticationError,
  NotFoundError,
  errorMiddleware,
  asyncHandler,
  setupUnhandledRejectionHandler,
  setupUncaughtExceptionHandler
};