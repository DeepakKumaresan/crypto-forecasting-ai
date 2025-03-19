// backend/websockets/wsServer.js
const WebSocket = require('ws');
const logger = require('../utils/logger');
const { v4: uuidv4 } = require('uuid');
const marketDataSocket = require('./marketDataSocket');
const tradingService = require('../services/tradingService');
const aiService = require('../services/aiService');

class WebSocketServer {
  constructor(server) {
    this.wss = new WebSocket.Server({ server });
    this.clients = new Map(); // Map of clients with their subscriptions
    this.initialize();
  }

  initialize() {
    this.wss.on('connection', (ws, req) => {
      const clientId = uuidv4();
      ws.id = clientId;
      
      // Store client info
      this.clients.set(clientId, {
        ws,
        subscriptions: new Set(),
        isAlive: true,
        lastPing: Date.now()
      });
      
      logger.info(`WebSocket client connected: ${clientId}`);
      
      // Send welcome message
      this.sendToClient(ws, {
        type: 'connection',
        status: 'connected',
        message: 'Connected to Crypto Forecasting AI WebSocket'
      });
      
      // Setup ping interval for this client
      const pingInterval = setInterval(() => {
        if (!this.clients.has(clientId)) {
          clearInterval(pingInterval);
          return;
        }
        
        const client = this.clients.get(clientId);
        if (!client.isAlive) {
          clearInterval(pingInterval);
          this.clients.delete(clientId);
          client.ws.terminate();
          logger.info(`WebSocket client terminated (ping timeout): ${clientId}`);
          return;
        }
        
        client.isAlive = false;
        client.ws.ping();
      }, 30000); // 30 seconds
      
      // Handle pong messages
      ws.on('pong', () => {
        if (this.clients.has(clientId)) {
          const client = this.clients.get(clientId);
          client.isAlive = true;
          client.lastPing = Date.now();
        }
      });
      
      // Handle client messages
      ws.on('message', async (message) => {
        try {
          const data = JSON.parse(message);
          await this.handleClientMessage(clientId, data);
        } catch (error) {
          logger.error(`Error handling WebSocket message: ${error.message}`);
          this.sendToClient(ws, {
            type: 'error',
            message: 'Failed to process message',
            error: error.message
          });
        }
      });
      
      // Handle client disconnection
      ws.on('close', () => {
        clearInterval(pingInterval);
        
        if (this.clients.has(clientId)) {
          const client = this.clients.get(clientId);
          // Unsubscribe from all symbols
          this.unsubscribeClientFromAllSymbols(clientId);
          this.clients.delete(clientId);
        }
        
        logger.info(`WebSocket client disconnected: ${clientId}`);
      });
      
      // Handle errors
      ws.on('error', (error) => {
        logger.error(`WebSocket error for client ${clientId}: ${error.message}`);
      });
    });

    // Set up market data handler
    marketDataSocket.on('marketData', (data) => {
      this.broadcastMarketData(data);
    });

    // Set up trade signals handler
    tradingService.on('tradeSignal', (signal) => {
      this.broadcastTradeSignal(signal);
    });

    logger.info('WebSocket server initialized');
  }

  async handleClientMessage(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client) return;

    switch (data.type) {
      case 'subscribe':
        await this.handleSubscribe(clientId, data);
        break;
        
      case 'unsubscribe':
        await this.handleUnsubscribe(clientId, data);
        break;
        
      case 'executeTrade':
        await this.handleExecuteTrade(clientId, data);
        break;
        
      case 'cancelTrade':
        await this.handleCancelTrade(clientId, data);
        break;
      
      default:
        this.sendToClient(client.ws, {
          type: 'error',
          message: 'Unknown message type',
          receivedType: data.type
        });
    }
  }

  async handleSubscribe(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    const { symbols, timeframe = '15m' } = data;
    if (!symbols || !Array.isArray(symbols)) {
      return this.sendToClient(client.ws, {
        type: 'error',
        message: 'Invalid symbols format',
        details: 'Symbols must be provided as an array'
      });
    }
    
    // Subscribe client to each symbol
    const validSymbols = [];
    for (const symbol of symbols) {
      // Validate symbol (must end with USDT)
      if (!symbol.endsWith('USDT')) {
        this.sendToClient(client.ws, {
          type: 'error',
          message: 'Invalid symbol',
          symbol,
          details: 'Only USDT pairs are supported'
        });
        continue;
      }
      
      client.subscriptions.add(symbol);
      validSymbols.push(symbol);
    }
    
    // Subscribe to market data
    if (validSymbols.length > 0) {
      await marketDataSocket.subscribe(validSymbols, timeframe);
      
      this.sendToClient(client.ws, {
        type: 'subscribed',
        symbols: validSymbols,
        timeframe
      });
      
      logger.info(`Client ${clientId} subscribed to symbols: ${validSymbols.join(', ')}`);
    }
  }

  async handleUnsubscribe(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    const { symbols } = data;
    if (!symbols) {
      // Unsubscribe from all
      this.unsubscribeClientFromAllSymbols(clientId);
      return;
    }
    
    if (!Array.isArray(symbols)) {
      return this.sendToClient(client.ws, {
        type: 'error',
        message: 'Invalid symbols format',
        details: 'Symbols must be provided as an array'
      });
    }
    
    // Unsubscribe from each symbol
    for (const symbol of symbols) {
      client.subscriptions.delete(symbol);
    }
    
    // Check if any other clients are subscribed to these symbols
    const symbolsToUnsubscribe = [];
    for (const symbol of symbols) {
      let isSubscribedByOthers = false;
      for (const [otherId, otherClient] of this.clients.entries()) {
        if (otherId !== clientId && otherClient.subscriptions.has(symbol)) {
          isSubscribedByOthers = true;
          break;
        }
      }
      
      if (!isSubscribedByOthers) {
        symbolsToUnsubscribe.push(symbol);
      }
    }
    
    // Unsubscribe from market data if no other clients are subscribed
    if (symbolsToUnsubscribe.length > 0) {
      await marketDataSocket.unsubscribe(symbolsToUnsubscribe);
    }
    
    this.sendToClient(client.ws, {
      type: 'unsubscribed',
      symbols
    });
    
    logger.info(`Client ${clientId} unsubscribed from symbols: ${symbols.join(', ')}`);
  }

  unsubscribeClientFromAllSymbols(clientId) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    const symbols = Array.from(client.subscriptions);
    client.subscriptions.clear();
    
    // Check if any other clients are subscribed to these symbols
    const symbolsToUnsubscribe = [];
    for (const symbol of symbols) {
      let isSubscribedByOthers = false;
      for (const [otherId, otherClient] of this.clients.entries()) {
        if (otherId !== clientId && otherClient.subscriptions.has(symbol)) {
          isSubscribedByOthers = true;
          break;
        }
      }
      
      if (!isSubscribedByOthers) {
        symbolsToUnsubscribe.push(symbol);
      }
    }
    
    // Unsubscribe from market data if no other clients are subscribed
    if (symbolsToUnsubscribe.length > 0) {
      marketDataSocket.unsubscribe(symbolsToUnsubscribe)
        .catch(err => logger.error(`Error unsubscribing: ${err.message}`));
    }
    
    if (symbols.length > 0) {
      logger.info(`Client ${clientId} unsubscribed from all symbols: ${symbols.join(', ')}`);
    }
  }

  async handleExecuteTrade(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    const { symbol, direction, amount, autoTrade = false } = data;
    
    if (!symbol || !direction || !amount) {
      return this.sendToClient(client.ws, {
        type: 'error',
        message: 'Missing required trade parameters',
        details: 'Symbol, direction, and amount are required'
      });
    }
    
    try {
      // Execute trade
      const tradeResult = await tradingService.executeTrade(symbol, direction, amount, autoTrade);
      
      this.sendToClient(client.ws, {
        type: 'tradeExecuted',
        trade: tradeResult
      });
      
      logger.info(`Trade executed for client ${clientId}: ${direction} ${amount} ${symbol}`);
    } catch (error) {
      logger.error(`Trade execution error: ${error.message}`);
      
      this.sendToClient(client.ws, {
        type: 'tradeError',
        message: 'Failed to execute trade',
        error: error.message
      });
    }
  }

  async handleCancelTrade(clientId, data) {
    const client = this.clients.get(clientId);
    if (!client) return;
    
    const { orderId } = data;
    
    if (!orderId) {
      return this.sendToClient(client.ws, {
        type: 'error',
        message: 'Missing orderId parameter'
      });
    }
    
    try {
      // Cancel trade
      const result = await tradingService.cancelTrade(orderId);
      
      this.sendToClient(client.ws, {
        type: 'tradeCancelled',
        orderId,
        success: result
      });
      
      logger.info(`Trade cancelled for client ${clientId}: ${orderId}`);
    } catch (error) {
      logger.error(`Trade cancellation error: ${error.message}`);
      
      this.sendToClient(client.ws, {
        type: 'tradeError',
        message: 'Failed to cancel trade',
        error: error.message
      });
    }
  }

  broadcastMarketData(data) {
    const { symbol } = data;
    
    // Find clients subscribed to this symbol
    for (const [clientId, client] of this.clients.entries()) {
      if (client.subscriptions.has(symbol)) {
        this.sendToClient(client.ws, {
          type: 'marketData',
          data
        });
      }
    }
  }

  broadcastTradeSignal(signal) {
    const { symbol } = signal;
    
    // Find clients subscribed to this symbol
    for (const [clientId, client] of this.clients.entries()) {
      if (client.subscriptions.has(symbol)) {
        this.sendToClient(client.ws, {
          type: 'tradeSignal',
          signal
        });
      }
    }
  }

  sendToClient(ws, data) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(data));
    }
  }

  broadcastToAll(data) {
    for (const [clientId, client] of this.clients.entries()) {
      this.sendToClient(client.ws, data);
    }
  }
}

module.exports = WebSocketServer;