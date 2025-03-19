/**
 * Market Data WebSocket for real-time crypto trading data
 * Connects to Bitget WebSocket API and filters for high-value USDT pairs
 */

const WebSocket = require('ws');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const logger = require('../utils/logger');
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
    
    // Re-subscribe to previously subscribed channels
    this._resubscribeChannels();
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
    } catch (error) {
      logger.error(`Error processing market data: ${error.message}`);
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
   * Get fallback market data (used in REST API fallback)
   * @returns {Object} Fallback market data
   */
  async getFallbackMarketData() {
    return { message: 'Fallback market data not yet implemented' };
  }
}

module.exports = new MarketDataSocket();
