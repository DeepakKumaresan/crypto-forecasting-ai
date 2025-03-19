/**
 * Sentry error tracking configuration
 * Centralizes Sentry setup for both frontend and backend
 */

const initSentry = (Sentry, options = {}) => {
    const { dsn, environment, release, debug } = options;
    
    const defaultOptions = {
      dsn: dsn || process.env.SENTRY_DSN,
      environment: environment || process.env.NODE_ENV || 'development',
      release: release || process.env.npm_package_version,
      debug: debug || process.env.NODE_ENV === 'development',
      tracesSampleRate: 0.2, // Sample 20% of transactions for performance monitoring
      attachStacktrace: true,
      maxBreadcrumbs: 50,
      autoSessionTracking: true
    };
  
    // Initialize Sentry with provided options
    Sentry.init(defaultOptions);
  
    // Return a wrapper for logging events separately from errors
    return {
      logEvent: (name, data) => {
        Sentry.captureMessage(`Event: ${name}`, {
          level: 'info',
          extra: data
        });
      },
      logError: (error, context = {}) => {
        Sentry.captureException(error, {
          extra: context
        });
      }
    };
  };
  
  module.exports = {
    initSentry
  };