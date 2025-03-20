/**
 * Global error handler middleware for Express
 */
const logger = require('./logger');

/**
 * Express error handling middleware
 * @param {Error} err - Error object
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const errorHandler = (err, req, res, next) => {
  // Log the error
  logger.error(`Server error: ${err.message}`, {
    url: req.originalUrl,
    method: req.method,
    statusCode: err.statusCode || 500,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

  // Determine if this is a known API error
  const isApiError = err.statusCode && err.statusCode !== 500;
  
  // Set response status code
  res.status(err.statusCode || 500);
  
  // Send appropriate error response
  res.json({
    error: isApiError ? err.message : 'Internal Server Error',
    message: isApiError 
      ? err.details || err.message 
      : (process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message),
    status: err.statusCode || 500
  });
};

module.exports = errorHandler;