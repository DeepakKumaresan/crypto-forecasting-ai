const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const dotenv = require('dotenv');
const morgan = require('morgan');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const Sentry = require('@sentry/node');
const { ProfilingIntegration } = require('@sentry/profiling-node');
const routes = require('./routes');
const errorHandler = require('./utils/errorHandler');
const marketDataSocket = require('./websockets/marketDataSocket');

// Load environment variables
dotenv.config();

// Initialize Sentry for error tracking
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  integrations: [
    // Enable HTTP calls tracing
    new Sentry.Integrations.Http({ tracing: true }),
    // Enable Express.js middleware tracing
    new Sentry.Integrations.Express({ app }),
    new ProfilingIntegration(),
  ],
  // Set tracesSampleRate to 1.0 for dev, lower in production
  tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  // Profiling sample rate is relative to tracesSampleRate
  profilesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
});

// Initialize express app
const app = express();
const server = http.createServer(app);

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

// ✅ Fallback API for market data
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
app.use(errorHandler);

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
  // Give Sentry time to send the error before shutting down
  setTimeout(() => {
    process.exit(1);
  }, 1000);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  Sentry.captureException(reason);
});

module.exports = server;
