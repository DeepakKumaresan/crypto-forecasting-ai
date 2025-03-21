/**
 * Market Data WebSocket for real-time crypto trading data
 * Connects to Bitget WebSocket API and filters for top 10 large-cap and 30 mid-cap USDT pairs
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
    
    // Total number of pairs to track
    this.totalPairsCount = 40;
    this.largeCapCount = 10;  // Top 10 large-cap pairs
    this.midCapCount = 30;    // Top 30 mid-cap pairs
    
    // Fallback symbols in case API data retrieval fails
    this.fallbackLargeCapSymbols = ['BTC', 'ETH', 'BNB', 'SOL', 'XRP', 'DOGE', 'ADA', 'AVAX', 'LINK', 'DOT'];
    this.fallbackMidCapSymbols = ['MATIC', 'UNI', 'ATOM', 'LTC', 'ICP', 'SHIB', 'BCH', 'FIL', 'NEAR', 'APT', 
                                 'INJ', 'ARB', 'OP', 'VET', 'AAVE', 'MKR', 'SNX', 'GRT', 'COMP', 'SAND', 
                                 'MANA', 'EGLD', 'RUNE', 'FTM', 'THETA', 'ALGO', 'EOS', 'XTZ', 'OCEAN', 'ONE'];
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
        
        // Use fallback symbols and try to connect anyway
        this._useFallbackSymbols();
        this.connect();
      });
  }

  /**
   * Use fallback symbols when API fails
   * @private
   */
  _useFallbackSymbols() {
    logger.info('Using fallback trading symbols due to API failure');
    this.activeSymbols = new Set([...this.fallbackLargeCapSymbols, ...this.fallbackMidCapSymbols]);
    
    logger.info(`Updated trading pairs: ${this.activeSymbols.size} pairs selected`);
    logger.info(`Large-cap pairs (${this.fallbackLargeCapSymbols.length}): ${this.fallbackLargeCapSymbols.join(', ')}`);
    logger.info(`Mid-cap pairs (${this.fallbackMidCapSymbols.length}): ${this.fallbackMidCapSymbols.join(', ')}`);
  }

  /**
   * Update list of active trading pairs
   * Now filters specifically for top 10 large-cap and 30 mid-cap USDT pairs
   */
  async updateTradingPairs() {
    try {
      const marketData = await bitgetService.getMarketData();
      
      if (!marketData || !Array.isArray(marketData) || marketData.length === 0) {
        throw new Error('No market data received from Bitget');
      }
      
      // Filter for USDT pairs with sufficient volume
      const usdtPairs = marketData
        .filter(pair => {
          // Check if pair is properly formed object
          if (!pair || typeof pair !== 'object') return false;
          
          // Extract base symbol (e.g., BTC from BTC_USDT)
          const symbolParts = pair.symbol ? pair.symbol.split('_') : [];
          const symbol = symbolParts[0];
          return symbol && pair.symbol && pair.symbol.endsWith('_USDT');
        })
        .map(pair => ({
          symbol: pair.symbol.split('_')[0],
          volume: parseFloat(pair.usdtVolume || pair.volume24h || 0),
          marketCap: parseFloat(pair.marketCap || 0)
        }))
        .filter(pair => pair.volume > 0); // Ensure we have volume data
      
      logger.info(`Filtered ${usdtPairs.length} USDT pairs with volume data`);
      
      if (usdtPairs.length === 0) {
        throw new Error('No valid USDT pairs found in market data');
      }
      
      // If we don't have market cap data, estimate it based on volume
      const needToEstimateMarketCap = usdtPairs.some(pair => pair.marketCap === 0);
      
      if (needToEstimateMarketCap) {
        logger.info('Using volume-based estimates for market cap ranking');
        // Sort by volume as a proxy for market cap
        usdtPairs.sort((a, b) => b.volume - a.volume);
      } else {
        // Sort pairs by market cap (descending)
        usdtPairs.sort((a, b) => b.marketCap - a.marketCap);
      }
      
      // Select top 10 large-cap pairs (or fewer if not enough data)
      const largeCapCount = Math.min(this.largeCapCount, usdtPairs.length);
      const largeCapPairs = usdtPairs.slice(0, largeCapCount).map(pair => pair.symbol);
      
      // Select next 30 mid-cap pairs (or fewer if not enough data)
      const remainingPairs = usdtPairs.slice(largeCapCount);
      const midCapCount = Math.min(this.midCapCount, remainingPairs.length);
      const midCapPairs = remainingPairs.slice(0, midCapCount).map(pair => pair.symbol);
      
      // Combine the selected pairs
      const selectedPairs = [...largeCapPairs, ...midCapPairs];
      
      if (selectedPairs.length === 0) {
        throw new Error('No pairs selected after filtering');
      }
      
      // Update active symbols
      this.activeSymbols = new Set(selectedPairs);
      
      logger.info(`Updated trading pairs: ${selectedPairs.length} pairs selected (${largeCapPairs.length} large-cap, ${midCapPairs.length} mid-cap)`);
      logger.info(`Large-cap pairs (${largeCapPairs.length}): ${largeCapPairs.join(', ')}`);
      logger.info(`Mid-cap pairs (${midCapPairs.length}): ${midCapPairs.join(', ')}`);
      
      // Subscribe to channels for the active symbols
      if (this.isConnected) {
        this._subscribeToAllChannels();
      }
      
      return selectedPairs;
    } catch (error) {
      logger.error(`Failed to update trading pairs: ${error.message}`);
      
      // If we already have active symbols, keep using them
      if (this.activeSymbols.size > 0) {
        logger.info(`Keeping ${this.activeSymbols.size} previously active symbols`);
        return Array.from(this.activeSymbols);
      }
      
      // Otherwise use fallback symbols
      this._useFallbackSymbols();
      return Array.from(this.activeSymbols);
    }
  }

  /**
   * Connect to Bitget WebSocket API
   */
  connect() {
    try {
      logger.info('Connecting to Bitget WebSocket API...');
      
      // Ensure we have active symbols to track
      if (this.activeSymbols.size === 0) {
        this._useFallbackSymbols();
      }
      
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
    if (!this.isConnected) {
      logger.warn('Cannot subscribe to channels: WebSocket not connected');
      return;
    }
    
    if (this.activeSymbols.size === 0) {
      logger.warn('Cannot subscribe to channels: No active symbols');
      this._useFallbackSymbols();
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
      logger.warn(`Cannot subscribe to ${channel}: No symbols provided`);
      return;
    }
    
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      logger.warn(`Cannot subscribe to ${channel}: WebSocket not open`);
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
      try {
        this.ws.send(JSON.stringify(subscribeMsg));
        logger.info(`Subscribed to ${channel} for batch of ${batch.length} symbols`);
      } catch (error) {
        logger.error(`Failed to send subscription request: ${error.message}`);
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
      
      const symbol = instId.split('_')[0]; // Extract base symbol
      if (symbol) {
        channelGroups[channel].push(symbol);
      }
    }
    
    // Subscribe to each channel group
    for (const [channel, symbols] of Object.entries(channelGroups)) {
      if (symbols.length > 0) {
        this._subscribeToChannel(channel, symbols);
      }
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
      if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        try {
          const pingMessage = {
            op: 'ping',
            args: [Date.now().toString()]
          };
          this.ws.send(JSON.stringify(pingMessage));
        } catch (error) {
          logger.error(`Failed to send ping: ${error.message}`);
          this._handleClose(); // Force reconnection
        }
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
      
      // Only process data for our targeted trading pairs
      const baseSymbol = instId.split('_')[0];
      if (!this.activeSymbols.has(baseSymbol)) {
        return; // Skip data for symbols we're not tracking
      }
      
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
        try {
          client.send(message);
        } catch (error) {
          logger.error(`Failed to send message to client: ${error.message}`);
          // Don't remove client here, let the error event handler do it
        }
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
    
    // Set timeout to automatically close inactive clients
    client.isAlive = true;
    client.on('pong', () => { client.isAlive = true; });
    
    // Send initial market data if available
    if (Object.keys(this.cachedMarketData).length > 0) {
      try {
        client.send(JSON.stringify({
          type: 'snapshot',
          data: this.cachedMarketData,
          timestamp: this.lastUpdated
        }));
      } catch (error) {
        logger.error(`Failed to send initial data to client: ${error.message}`);
      }
    }
  }

  /**
   * Handle client message
   * @param {WebSocket} client - Client WebSocket
   * @param {Object} message - Client message
   */
  handleClientMessage(client, message) {
    try {
      // Parse message if it's a string
      const parsedMessage = typeof message === 'string' ? JSON.parse(message) : message;
      
      // Handle client subscription requests
      if (parsedMessage && parsedMessage.type === 'subscribe') {
        if (parsedMessage.symbols && Array.isArray(parsedMessage.symbols)) {
          // Filter client's requested symbols to only include our active symbols
          const filteredSymbols = parsedMessage.symbols.filter(symbol => 
            this.activeSymbols.has(symbol.split('_')[0])
          );
          
          logger.info(`Client subscription filtered: ${filteredSymbols.length}/${parsedMessage.symbols.length} symbols allowed`);
          
          // Send current data for the filtered symbols
          if (filteredSymbols.length > 0) {
            const filteredData = {};
            
            for (const symbol of filteredSymbols) {
              if (this.cachedMarketData[symbol]) {
                filteredData[symbol] = this.cachedMarketData[symbol];
              }
            }
            
            client.send(JSON.stringify({
              type: 'subscription_data',
              data: filteredData,
              timestamp: Date.now()
            }));
          }
        }
      }
    } catch (error) {
      logger.error(`Error handling client message: ${error.message}`);
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
      
      if (!marketData || !Array.isArray(marketData) || marketData.length === 0) {
        throw new Error('No market data available');
      }
      
      // Filter for only our active trading pairs
      const activeSymbolsWithUsdt = Array.from(this.activeSymbols).map(s => `${s}_USDT`);
      
      // Format the data for client consumption
      const formattedData = {};
      
      for (const item of marketData) {
        // Only include data for our selected trading pairs
        if (activeSymbolsWithUsdt.includes(item.symbol)) {
          formattedData[item.symbol] = {
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
      }
      
      // If we still don't have any data, generate synthetic data for fallback symbols
      if (Object.keys(formattedData).length === 0) {
        const fallbackData = this._generateSyntheticMarketData();
        
        // Cache the synthetic data
        this.cachedMarketData = fallbackData;
        this.lastUpdated = Date.now();
        
        return {
          status: 'success',
          data: fallbackData,
          timestamp: this.lastUpdated,
          count: Object.keys(fallbackData).length,
          source: 'synthetic_data'
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
      
      // Generate synthetic data if everything fails
      const fallbackData = this._generateSyntheticMarketData();
      
      // Cache the synthetic data
      this.cachedMarketData = fallbackData;
      this.lastUpdated = Date.now();
      
      return {
        status: 'success',
        data: fallbackData,
        timestamp: this.lastUpdated,
        count: Object.keys(fallbackData).length,
        source: 'synthetic_data'
      };
    }
  }
  
  /**
   * Generate synthetic market data for fallback
   * @returns {Object} Synthetic market data
   * @private
   */
  _generateSyntheticMarketData() {
    logger.info('Generating synthetic market data for fallback');
    
    const formattedData = {};
    const baseValues = {
      'BTC': 67000, 'ETH': 3500, 'BNB': 600, 'SOL': 170, 'XRP': 0.55,
      'DOGE': 0.15, 'ADA': 0.45, 'AVAX': 35, 'LINK': 18, 'DOT': 7
    };
    
    // Generate data for all active symbols
    const allSymbols = Array.from(this.activeSymbols);
    
    for (const symbol of allSymbols) {
      const instId = `${symbol}_USDT`;
      const basePrice = baseValues[symbol] || (Math.random() * 10 + 1); // Random price for unknown symbols
      const changePercent = (Math.random() * 10) - 5; // Random change between -5% and +5%
      const last = basePrice * (1 + changePercent / 100);
      
      formattedData[instId] = {
        ticker: {
          data: {
            symbol: instId,
            last: last.toFixed(symbol === 'BTC' ? 1 : 4),
            high24h: (last * (1 + Math.random() * 0.05)).toFixed(symbol === 'BTC' ? 1 : 4),
            low24h: (last * (1 - Math.random() * 0.05)).toFixed(symbol === 'BTC' ? 1 : 4),
            volume24h: (Math.random() * 10000 + 1000).toFixed(2),
            change24h: ((changePercent / 100) * basePrice).toFixed(symbol === 'BTC' ? 1 : 4),
            changePercent24h: changePercent.toFixed(2)
          },
          timestamp: Date.now()
        }
      };
    }
    
    return formattedData;
  }
  
  /**
   * Get the list of active trading pairs
   * @returns {Array} List of active trading pairs
   */
  getActiveTradingPairs() {
    return Array.from(this.activeSymbols).map(symbol => `${symbol}_USDT`);
  }
  
  /**
   * Check connection health
   * @returns {Object} Connection health status
   */
  getHealthStatus() {
    return {
      isConnected: this.isConnected,
      subscribedChannels: this.subscribedChannels.size,
      activeSymbols: this.activeSymbols.size,
      connectedClients: this.clients.size,
      cachedDataEntries: Object.keys(this.cachedMarketData).length,
      lastUpdated: this.lastUpdated,
      reconnectAttempts: this.reconnectAttempts
    };
  }
}

module.exports = new MarketDataSocket();