const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const dotenv = require('dotenv');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Sentry = require('@sentry/node');
const fs = require('fs');
const path = require('path');
// Removed ProfilingIntegration import as it's causing errors
const routes = require('./routes');
const errorHandler = require('./utils/errorHandler');
const marketDataSocket = require('./websockets/marketDataSocket');
const logger = require('./utils/logger');

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Load environment variables
dotenv.config();

// Initialize express app before using it in Sentry
const app = express();
const server = http.createServer(app);

// Initialize Sentry for error tracking (without ProfilingIntegration)
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    integrations: [
      new Sentry.Integrations.Http({ tracing: true }),
      new Sentry.Integrations.Express({ app }),
      // Removed ProfilingIntegration that was causing the error
    ],
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
    // Removed profilesSampleRate as it's related to the removed ProfilingIntegration
  });

  // Middleware for Sentry
  app.use(Sentry.Handlers.requestHandler());
  app.use(Sentry.Handlers.tracingHandler());
} else {
  logger.warn('Sentry DSN not configured. Error tracking disabled.');
}

// Set up WebSocket server
const wss = new WebSocket.Server({ server });

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev', {
  stream: {
    write: (message) => logger.info(message.trim())
  }
}));
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again after 15 minutes'
});
app.use('/api/', apiLimiter);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'up',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  });
});

// API routes
if (routes) {
  app.use('/api', routes);
} else {
  logger.warn('Routes module not found or invalid');
  
  // Fallback route handler if routes module is missing
  app.use('/api', (req, res) => {
    res.status(503).json({ error: 'API routes not available' });
  });
}

// Fallback API for market data
app.get('/api/market/fallback', async (req, res) => {
  try {
    const fallbackData = await marketDataSocket.getFallbackMarketData();
    res.json(fallbackData);
  } catch (error) {
    logger.error('Error fetching fallback market data:', error);
    res.status(500).json({ error: 'Failed to retrieve fallback market data' });
  }
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  logger.info('WebSocket client connected');
  
  // Handle WebSocket connection with the client
  marketDataSocket.handleConnection(ws);
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      marketDataSocket.handleClientMessage(ws, data);
    } catch (error) {
      logger.error('Error parsing WebSocket message:', error);
    }
  });
  
  ws.on('close', () => {
    logger.info('WebSocket client disconnected');
    marketDataSocket.handleDisconnection(ws);
  });
});

// Error handling middleware
if (process.env.SENTRY_DSN) {
  app.use(Sentry.Handlers.errorHandler());
}

// Custom error handler
if (typeof errorHandler === 'function') {
  app.use(errorHandler);
} else {
  // Fallback error handler if the imported one is not a function
  app.use((err, req, res, next) => {
    logger.error('Server error:', err);
    res.status(500).json({ 
      error: 'Internal Server Error',
      message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : err.message
    });
  });
}

// Catch-all route
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Resource not found' });
});

// Start the server
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  logger.info(`Server is running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Initialize market data WebSocket connection with Bitget
  if (typeof marketDataSocket.initializeBitgetConnection === 'function') {
    marketDataSocket.initializeBitgetConnection();
  } else {
    logger.error('Bitget connection initialization failed - function not available');
  }
});

// Handle unexpected errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error);
  }
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(reason);
  }
});

module.exports = server;