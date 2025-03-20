/**
 * Market Data WebSocket for real-time crypto trading data
 * Connects to Bitget WebSocket API and filters for high-value USDT pairs
 */

const WebSocket = require('ws');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const bitgetService = require('../services/bitgetService');
const { logger } = require('../utils/logger');
const { BITGET_API_KEY, BITGET_SECRET_KEY, BITGET_PASSPHRASE } = process.env;

class MarketDataSocket extends EventEmitter {
  constructor() {
    super();
    this.ws = null;
    this.pingInterval = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    this.reconnectDelay = 3000; // Initial delay of 3 seconds
    this.isConnected = false;
    this.subscribedChannels = new Set();
    this.activeSymbols = new Set();
    this.clients = new Set();
    this.cachedMarketData = {}; // Cache for market data
    this.lastUpdated = 0;
  }

  /**
   * Initialize Bitget WebSocket connection
   */
  initializeBitgetConnection() {
    logger.info('Initializing Bitget market data connection');
    this.updateTradingPairs()
      .then(() => {
        this.connect();
        
        // Update trading pairs every 30 minutes
        setInterval(() => this.updateTradingPairs(), 30 * 60 * 1000);
      })
      .catch(error => {
        logger.error(`Failed to initialize Bitget connection: ${error.message}`);
      });
  }

  /**
   * Update list of active trading pairs
   */
  async updateTradingPairs() {
    try {
      const marketData = await bitgetService.getMarketData();
      
      if (!marketData || marketData.length === 0) {
        throw new Error('No market data received from Bitget');
      }
      
      // Filter for USDT pairs with sufficient volume
      const filteredPairs = marketData
        .filter(pair => {
          // Extract base symbol (e.g., BTC from BTC_USDT)
          const symbol = pair.symbol.split('_')[0];
          const volume = parseFloat(pair.usdtVolume);
          
          // Filter for pairs with at least $1M in 24h volume
          return symbol && volume && volume >= 1000000;
        })
        .map(pair => pair.symbol.split('_')[0]); // Extract base symbol
      
      // Update active symbols
      this.activeSymbols = new Set(filteredPairs);
      
      logger.info(`Updated trading pairs: ${filteredPairs.length} pairs match criteria`);
      
      // Subscribe to channels for the active symbols
      if (this.isConnected) {
        this._subscribeToAllChannels();
      }
      
      return filteredPairs;
    } catch (error) {
      logger.error(`Failed to update trading pairs: ${error.message}`);
      throw error;
    }
  }

  /**
   * Connect to Bitget WebSocket API
   */
  connect() {
    try {
      logger.info('Connecting to Bitget WebSocket API...');
      
      this.ws = new WebSocket('wss://ws.bitget.com/spot/v1/stream');
      
      this.ws.on('open', () => this._handleOpen());
      this.ws.on('message', (data) => this._handleMessage(data));
      this.ws.on('error', (error) => this._handleError(error));
      this.ws.on('close', () => this._handleClose());
      
      // Reset reconnect attempts on successful connection
      this.reconnectAttempts = 0;
    } catch (error) {
      logger.error(`WebSocket connection error: ${error.message}`);
      this._reconnect();
    }
  }

  /**
   * Handle WebSocket open event
   */
  _handleOpen() {
    logger.info('Connected to Bitget WebSocket API');
    this.isConnected = true;
    this.emit('connected');
    
    // Setup ping interval to keep connection alive
    this._setupPingInterval();
    
    // Subscribe to channels for all active symbols
    this._subscribeToAllChannels();
  }

  /**
   * Subscribe to all relevant channels for active symbols
   */
  _subscribeToAllChannels() {
    if (!this.isConnected || this.activeSymbols.size === 0) {
      return;
    }
    
    // Clear previous subscriptions
    this.subscribedChannels.clear();
    
    // Subscribe to ticker for all active symbols
    this._subscribeToChannel('ticker', Array.from(this.activeSymbols));
    
    // Subscribe to 15-minute candles for all active symbols
    this._subscribeToChannel('candle15m', Array.from(this.activeSymbols));
    
    // Subscribe to order book depth for all active symbols
    this._subscribeToChannel('depth5', Array.from(this.activeSymbols));
  }

  /**
   * Subscribe to a specific channel for multiple symbols
   * @param {string} channel - Channel name
   * @param {Array} symbols - Array of symbols
   */
  _subscribeToChannel(channel, symbols) {
    if (!symbols || symbols.length === 0) {
      return;
    }
    
    // Batch subscriptions to avoid message size limits
    const batchSize = 10;
    for (let i = 0; i < symbols.length; i += batchSize) {
      const batch = symbols.slice(i, i + batchSize);
      
      // Create subscription message
      const args = batch.map(symbol => {
        const instId = `${symbol}_USDT`;
        this.subscribedChannels.add(`${channel}:${instId}`);
        return { channel, instId };
      });
      
      const subscribeMsg = {
        op: 'subscribe',
        args
      };
      
      // Send subscription request
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify(subscribeMsg));
        logger.info(`Subscribed to ${channel} for batch of ${batch.length} symbols`);
      }
    }
  }

  /**
   * Re-subscribe to previously subscribed channels
   */
  _resubscribeChannels() {
    if (this.subscribedChannels.size === 0) {
      this._subscribeToAllChannels();
      return;
    }
    
    // Group subscriptions by channel
    const channelGroups = {};
    
    for (const subscription of this.subscribedChannels) {
      const [channel, instId] = subscription.split(':');
      
      if (!channelGroups[channel]) {
        channelGroups[channel] = [];
      }
      
      channelGroups[channel].push(instId.split('_')[0]); // Extract base symbol
    }
    
    // Subscribe to each channel group
    for (const [channel, symbols] of Object.entries(channelGroups)) {
      this._subscribeToChannel(channel, symbols);
    }
  }

  /**
   * Set up ping interval to keep connection alive
   */
  _setupPingInterval() {
    // Clear any existing interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
    }
    
    // Send ping every 20 seconds to keep connection alive
    this.pingInterval = setInterval(() => {
      if (this.isConnected && this.ws.readyState === WebSocket.OPEN) {
        const pingMessage = {
          op: 'ping',
          args: [Date.now().toString()]
        };
        this.ws.send(JSON.stringify(pingMessage));
      }
    }, 20000);
  }

  /**
   * Handle WebSocket message event
   * @param {Buffer} data - Message data from WebSocket
   */
  _handleMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      
      // Handle ping/pong for connection keepalive
      if (message.op === 'pong') {
        return;
      }

      // Handle subscription response
      if (message.event === 'subscribe') {
        logger.info(`Subscription successful: ${JSON.stringify(message)}`);
        return;
      }

      // Handle errors from WebSocket server
      if (message.event === 'error') {
        logger.error(`WebSocket error from server: ${JSON.stringify(message)}`);
        return;
      }

      // Check if data exists and has expected structure
      if (message.data && Array.isArray(message.data) && message.data.length > 0) {
        // Filter and process market data
        this._processMarketData(message);
      }
    } catch (error) {
      logger.error(`Error processing WebSocket message: ${error.message}`);
    }
  }

  /**
   * Process market data from WebSocket
   * @param {Object} message - Message object from WebSocket
   */
  _processMarketData(message) {
    try {
      // Extract channel info to identify the data type
      const { arg, data } = message;
      
      if (!arg || !data) return;
      
      const { channel, instId } = arg;
      
      // Cache the data
      if (!this.cachedMarketData[instId]) {
        this.cachedMarketData[instId] = {};
      }
      
      this.cachedMarketData[instId][channel] = {
        data: data[0] || data,
        timestamp: Date.now()
      };
      
      this.lastUpdated = Date.now();
      
      // Process different types of market data
      switch (channel) {
        case 'ticker':
          // Process ticker data (price, volume, etc.)
          this.emit('ticker', { symbol: instId, data: data[0] });
          break;
        
        case 'candle15m':
          // Process 15-minute candle data
          this.emit('candle', { 
            symbol: instId, 
            timeframe: '15m', 
            data: data[0] 
          });
          break;
        
        case 'trade':
          // Process real-time trade data
          this.emit('trade', { symbol: instId, data });
          break;
        
        case 'depth5':
        case 'depth15':
          // Process order book data (market depth)
          this.emit('depth', { symbol: instId, level: channel, data: data[0] });
          break;
        
        default:
          // Handle any other data types
          this.emit('data', { channel, symbol: instId, data });
      }
      
      // Broadcast to all connected clients
      this._broadcastToClients({
        type: channel,
        symbol: instId,
        data: data[0] || data
      });
    } catch (error) {
      logger.error(`Error processing market data: ${error.message}`);
    }
  }

  /**
   * Broadcast data to all connected WebSocket clients
   * @param {Object} data - Data to broadcast
   */
  _broadcastToClients(data) {
    const message = JSON.stringify(data);
    
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    }
  }

  /**
   * Handle WebSocket error event
   * @param {Error} error - WebSocket error
   */
  _handleError(error) {
    logger.error(`WebSocket error: ${error.message}`);
    this.emit('error', error);
  }

  /**
   * Handle WebSocket close event
   */
  _handleClose() {
    logger.warn('WebSocket connection closed');
    this.isConnected = false;
    
    // Clear ping interval
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
    
    this.emit('disconnected');
    this._reconnect();
  }

  /**
   * Reconnect to WebSocket
   */
  _reconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Maximum reconnection attempts reached. Giving up.');
      this.emit('reconnect_failed');
      return;
    }
    
    this.reconnectAttempts += 1;
    const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
    
    logger.info(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
    
    setTimeout(() => {
      logger.info('Reconnecting to WebSocket...');
      this.connect();
    }, delay);
  }

  /**
   * Handle client WebSocket connection
   * @param {WebSocket} client - Client WebSocket
   */
  handleConnection(client) {
    this.clients.add(client);
    logger.info(`Client connected. Total clients: ${this.clients.size}`);
    
    // Send initial market data if available
    if (Object.keys(this.cachedMarketData).length > 0) {
      client.send(JSON.stringify({
        type: 'snapshot',
        data: this.cachedMarketData,
        timestamp: this.lastUpdated
      }));
    }
  }

  /**
   * Handle client message
   * @param {WebSocket} client - Client WebSocket
   * @param {Object} message - Client message
   */
  handleClientMessage(client, message) {
    // Handle client subscription requests or commands
    if (message && message.type === 'subscribe' && message.channels) {
      logger.info(`Client subscription request: ${JSON.stringify(message.channels)}`);
      
      // Send filtered data based on client subscription
      // Implementation depends on specific app requirements
    }
  }

  /**
   * Handle client disconnection
   * @param {WebSocket} client - Client WebSocket
   */
  handleDisconnection(client) {
    this.clients.delete(client);
    logger.info(`Client disconnected. Remaining clients: ${this.clients.size}`);
  }

  /**
   * Get fallback market data (used in REST API fallback)
   * @returns {Promise<Object>} Fallback market data
   */
  async getFallbackMarketData() {
    try {
      // If we have cached data, return it
      if (Object.keys(this.cachedMarketData).length > 0) {
        return {
          status: 'success',
          data: this.cachedMarketData,
          timestamp: this.lastUpdated,
          count: Object.keys(this.cachedMarketData).length
        };
      }
      
      // Otherwise, fetch fresh data from REST API
      const marketData = await bitgetService.getMarketData();
      
      if (!marketData || marketData.length === 0) {
        throw new Error('No market data available');
      }
      
      // Format the data for client consumption
      const formattedData = {};
      
      for (const item of marketData) {
        const symbol = item.symbol;
        formattedData[symbol] = {
          ticker: {
            data: {
              symbol: item.symbol,
              last: item.last,
              high24h: item.high24h,
              low24h: item.low24h,
              volume24h: item.volume24h,
              change24h: item.change24h,
              changePercent24h: item.changePercent24h
            },
            timestamp: Date.now()
          }
        };
      }
      
      // Cache the data for future requests
      this.cachedMarketData = formattedData;
      this.lastUpdated = Date.now();
      
      return {
        status: 'success',
        data: formattedData,
        timestamp: this.lastUpdated,
        count: Object.keys(formattedData).length,
        source: 'rest_api'
      };
    } catch (error) {
      logger.error(`Error getting fallback market data: ${error.message}`);
      
      // Return minimal data if everything fails
      return {
        status: 'error',
        message: 'Failed to retrieve market data',
        error: error.message,
        timestamp: Date.now()
      };
    }
  }
}

module.exports = new MarketDataSocket();