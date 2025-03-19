const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const dotenv = require('dotenv');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Sentry = require('@sentry/node');
// Removed ProfilingIntegration import as it's causing errors
const routes = require('./routes');
const errorHandler = require('./utils/errorHandler');
const marketDataSocket = require('./websockets/marketDataSocket');

// Load environment variables
dotenv.config();

// Initialize express app before using it in Sentry
const app = express();
const server = http.createServer(app);

// Initialize Sentry for error tracking (without ProfilingIntegration)
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

// Set up WebSocket server
const wss = new WebSocket.Server({ server });

// Middleware
app.use(Sentry.Handlers.requestHandler());
app.use(Sentry.Handlers.tracingHandler());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
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

// API routes
app.use('/api', routes);

// Fallback API for market data
app.get('/api/market/fallback', async (req, res) => {
  try {
    const fallbackData = await marketDataSocket.getFallbackMarketData();
    res.json(fallbackData);
  } catch (error) {
    console.error('Error fetching fallback market data:', error);
    res.status(500).json({ error: 'Failed to retrieve fallback market data' });
  }
});

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('WebSocket client connected');
  
  // Handle WebSocket connection with the client
  marketDataSocket.handleConnection(ws);
  
  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      marketDataSocket.handleClientMessage(ws, data);
    } catch (error) {
      console.error('Error parsing WebSocket message:', error);
    }
  });
  
  ws.on('close', () => {
    console.log('WebSocket client disconnected');
    marketDataSocket.handleDisconnection(ws);
  });
});

// Error handling middleware
app.use(Sentry.Handlers.errorHandler());
// Check if errorHandler is a function before using it
if (typeof errorHandler === 'function') {
  app.use(errorHandler);
} else {
  // Fallback error handler if the imported one is not a function
  app.use((err, req, res, next) => {
    console.error('Server error:', err);
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
  console.log(`Server is running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  
  // Initialize market data WebSocket connection with Bitget
  marketDataSocket.initializeBitgetConnection();
});

// Handle unexpected errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  Sentry.captureException(error);
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  Sentry.captureException(reason);
});

module.exports = server;