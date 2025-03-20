const axios = require('axios');
const bitgetService = require('./bitgetService');
const { logger } = require('../utils/logger');

/**
 * Service to handle trading operations, including AI signal filtering and execution
 */
class TradingService {
  constructor() {
    this.isAutoTradingEnabled = false;
    this.activeSignals = new Map();
    this.tradingPairs = [];
    this.mlApiUrl = process.env.ML_API_URL || 'http://localhost:8000';
    this.minProfitMargin = parseFloat(process.env.MIN_PROFIT_MARGIN || '0.005'); // 0.5%
    this.maxPairsToWatch = parseInt(process.env.MAX_PAIRS_TO_WATCH || '20');
    
    // Initialize the service
    this.initialize();
  }

  /**
   * Initialize the trading service
   */
  async initialize() {
    try {
      // Get initial set of trading pairs and start monitoring
      await this.updateTradingPairs();
      
      // Start periodic updates
      setInterval(() => this.updateTradingPairs(), 3600000); // Update every hour
      
      logger.info('Trading service initialized successfully');
    } catch (error) {
      // Fixed error handling to properly use the error object
      logger.error(`Failed to initialize trading service: ${error ? error.message || String(error) : 'Unknown error'}`);
    }
  }

  /**
   * Update the list of trading pairs to monitor
   */
  async updateTradingPairs() {
    try {
      // Check if bitgetService is properly initialized
      if (!bitgetService || typeof bitgetService.getMarketData !== 'function') {
        logger.warn('Bitget service not initialized properly, skipping updateTradingPairs');
        return;
      }

      const marketData = await bitgetService.getMarketData();
      
      // Check if marketData is valid
      if (!marketData || !Array.isArray(marketData)) {
        logger.warn('Invalid market data received, skipping update');
        return;
      }
      
      // Filter for USDT pairs and sort by volume
      const usdtPairs = marketData
        .filter(pair => pair && pair.symbol && pair.symbol.endsWith('_UMCBL') && pair.symbol.includes('USDT'))
        .map(pair => ({
          symbol: pair.symbol.replace('_UMCBL', ''),
          volume24h: parseFloat(pair.volume24h || 0),
          price: parseFloat(pair.last || 0)
        }))
        .sort((a, b) => b.volume24h - a.volume24h);
      
      // Take top N pairs by volume
      this.tradingPairs = usdtPairs.slice(0, this.maxPairsToWatch).map(pair => pair.symbol);
      
      logger.info(`Updated trading pairs: ${this.tradingPairs.length} pairs selected`);
    } catch (error) {
      logger.error(`Failed to update trading pairs: ${error ? error.message || String(error) : 'Unknown error'}`);
    }
  }

  /**
   * Get AI-filtered trade signals
   * @param {string} timeframe Timeframe for signals (e.g. '15m')
   * @returns {Promise<Array>} List of trade signals
   */
  async getTradeSignals(timeframe = '15m') {
    try {
      // Request predictions from ML API
      const response = await axios.post(`${this.mlApiUrl}/predict`, {
        pairs: this.tradingPairs,
        timeframe
      });
      
      const signals = response.data && response.data.predictions;
      
      if (!signals || !Array.isArray(signals)) {
        logger.warn('Invalid signals data received from ML API');
        return [];
      }
      
      // Filter signals based on AI confidence and remove duplicates
      const filteredSignals = this.filterSignals(signals, timeframe);
      
      // Update active signals map
      this.updateActiveSignals(filteredSignals, timeframe);
      
      // If auto-trading is enabled, execute trades
      if (this.isAutoTradingEnabled) {
        await this.executeAutoTrades(filteredSignals);
      }
      
      return filteredSignals;
    } catch (error) {
      logger.error(`Failed to get trade signals: ${error ? error.message || String(error) : 'Unknown error'}`);
      return [];
    }
  }

  /**
   * Filter signals based on AI confidence and remove duplicates
   * @param {Array} signals Raw signals from ML API
   * @param {string} timeframe Timeframe for signals
   * @returns {Array} Filtered signals
   */
  filterSignals(signals, timeframe) {
    if (!signals || !Array.isArray(signals)) return [];
    
    // Filter signals with high confidence
    const highConfidenceSignals = signals.filter(signal => 
      signal && typeof signal === 'object' && 
      signal.confidence >= parseFloat(process.env.MIN_SIGNAL_CONFIDENCE || '0.7')
    );
    
    // Remove duplicate signals (same pair and same direction)
    const uniqueSignals = [];
    const sigKeys = new Set();
    
    for (const signal of highConfidenceSignals) {
      if (!signal || !signal.symbol || !signal.side) continue;
      
      const key = `${signal.symbol}_${signal.side}`;
      
      // Skip if we already have this signal
      if (sigKeys.has(key)) continue;
      
      sigKeys.add(key);
      uniqueSignals.push({
        ...signal,
        timeframe,
        timestamp: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 20000).toISOString() // 20 seconds expiry
      });
    }
    
    return uniqueSignals;
  }

  /**
   * Update active signals map
   * @param {Array} signals New signals
   * @param {string} timeframe Timeframe for signals
   */
  updateActiveSignals(signals, timeframe) {
    if (!signals || !Array.isArray(signals)) return;
    
    // Remove expired signals
    const now = Date.now();
    for (const [key, signal] of this.activeSignals.entries()) {
      if (new Date(signal.expiresAt).getTime() < now) {
        this.activeSignals.delete(key);
      }
    }
    
    // Add new signals
    for (const signal of signals) {
      if (!signal || !signal.symbol || !signal.side) continue;
      
      const key = `${signal.symbol}_${signal.side}_${timeframe}`;
      this.activeSignals.set(key, signal);
    }
  }

  /**
   * Execute trades automatically based on signals
   * @param {Array} signals Trade signals
   */
  async executeAutoTrades(signals) {
    if (!signals || !Array.isArray(signals) || signals.length === 0) return;
    
    try {
      // Check if bitgetService is properly initialized
      if (!bitgetService || typeof bitgetService.getAccountBalance !== 'function') {
        logger.warn('Bitget service not initialized properly, skipping auto-trades');
        return;
      }
      
      // Get account balance
      const accountInfo = await bitgetService.getAccountBalance();
      
      if (!accountInfo || !Array.isArray(accountInfo)) {
        logger.warn('Invalid account info received, skipping auto-trades');
        return;
      }
      
      const usdtAccount = accountInfo.find(acc => acc && acc.marginCoin === 'USDT');
      const availableBalance = usdtAccount ? parseFloat(usdtAccount.available || 0) : 0;
      
      if (availableBalance <= 0) {
        logger.warn('Insufficient balance for auto-trading');
        return;
      }
      
      // Calculate trade size per signal
      const maxSignals = Math.min(signals.length, 5); // Max 5 concurrent trades
      const tradeSize = (availableBalance * 0.9) / maxSignals; // Use 90% of available balance
      
      // Execute trades for each signal
      for (const signal of signals) {
        if (!signal || !signal.symbol || !signal.side) continue;
        
        try {
          // Execute the trade
          await this.executeTrade(
            signal.symbol,
            signal.side,
            tradeSize,
            null, // Use market price
            signal.stopLoss,
            signal.takeProfit
          );
          
          logger.info(`Auto-executed trade: ${signal.side} ${signal.symbol}`);
        } catch (error) {
          logger.error(`Failed to auto-execute trade for ${signal.symbol}: ${error ? error.message || String(error) : 'Unknown error'}`);
        }
      }
    } catch (error) {
      logger.error(`Error in auto-trading execution: ${error ? error.message || String(error) : 'Unknown error'}`);
    }
  }

  /**
   * Execute a single trade
   * @param {string} symbol Trading symbol
   * @param {string} side 'buy' or 'sell'
   * @param {number} quantity Trade quantity
   * @param {number} price Trade price (optional)
   * @param {number} stopLoss Stop loss price (optional)
   * @param {number} takeProfit Take profit price (optional)
   * @returns {Promise<Object>} Trade result
   */
  async executeTrade(symbol, side, quantity, price = null, stopLoss = null, takeProfit = null) {
    if (!symbol || !side || !quantity) {
      throw new Error('Missing required parameters for executeTrade');
    }
    
    try {
      // If stopLoss or takeProfit are not provided, calculate them
      const currentPrice = price || await this.getCurrentPrice(symbol);
      
      if (!stopLoss) {
        stopLoss = this.calculateStopLoss(currentPrice, side);
      }
      
      if (!takeProfit) {
        takeProfit = this.calculateTakeProfit(currentPrice, side);
      }
      
      // Check if bitgetService is properly initialized
      if (!bitgetService || typeof bitgetService.placeOrder !== 'function') {
        throw new Error('Bitget service not initialized properly');
      }
      
      // Execute the trade
      const result = await bitgetService.placeOrder(
        symbol,
        side,
        quantity,
        price,
        'market',
        stopLoss,
        takeProfit
      );
      
      if (!result) {
        throw new Error('No result received from placeOrder');
      }
      
      return {
        orderId: result.orderId,
        symbol,
        side,
        quantity,
        price: currentPrice,
        stopLoss,
        takeProfit,
        status: result.status || 'executed',
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Failed to execute trade: ${error ? error.message || String(error) : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Get current price for a symbol
   * @param {string} symbol Trading symbol
   * @returns {Promise<number>} Current price
   */
  async getCurrentPrice(symbol) {
    if (!symbol) {
      throw new Error('Symbol is required for getCurrentPrice');
    }
    
    try {
      // Check if bitgetService is properly initialized
      if (!bitgetService || typeof bitgetService.getMarketData !== 'function') {
        throw new Error('Bitget service not initialized properly');
      }
      
      const marketData = await bitgetService.getMarketData();
      
      if (!marketData || !Array.isArray(marketData)) {
        throw new Error('Invalid market data received');
      }
      
      const pair = marketData.find(p => p && p.symbol === `${symbol}_UMCBL`);
      
      if (!pair) {
        throw new Error(`Symbol ${symbol} not found in market data`);
      }
      
      return parseFloat(pair.last);
    } catch (error) {
      logger.error(`Failed to get current price for ${symbol}: ${error ? error.message || String(error) : 'Unknown error'}`);
      throw error;
    }
  }

  /**
   * Calculate stop loss price
   * @param {number} price Current price
   * @param {string} side 'buy' or 'sell'
   * @returns {number} Stop loss price
   */
  calculateStopLoss(price, side) {
    if (!price || typeof price !== 'number' || !side) {
      logger.warn('Invalid parameters for calculateStopLoss');
      return null;
    }
    
    const stopLossPercentage = parseFloat(process.env.STOP_LOSS_PERCENTAGE || '0.02'); // 2%
    return side.toLowerCase() === 'buy' 
      ? price * (1 - stopLossPercentage)
      : price * (1 + stopLossPercentage);
  }

  /**
   * Calculate take profit price
   * @param {number} price Current price
   * @param {string} side 'buy' or 'sell'
   * @returns {number} Take profit price
   */
  calculateTakeProfit(price, side) {
    if (!price || typeof price !== 'number' || !side) {
      logger.warn('Invalid parameters for calculateTakeProfit');
      return null;
    }
    
    const takeProfitPercentage = parseFloat(process.env.TAKE_PROFIT_PERCENTAGE || '0.05'); // 5%
    return side.toLowerCase() === 'buy' 
      ? price * (1 + takeProfitPercentage)
      : price * (1 - takeProfitPercentage);
  }

  /**
   * Toggle auto-trading
   * @param {boolean} enabled Whether to enable auto-trading
   * @returns {Object} Current trading status
   */
  async toggleAutoTrading(enabled) {
    this.isAutoTradingEnabled = !!enabled;
    
    logger.info(`Auto-trading ${this.isAutoTradingEnabled ? 'enabled' : 'disabled'}`);
    
    return {
      autoTradingEnabled: this.isAutoTradingEnabled,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Get current trading status
   * @returns {Promise<Object>} Trading status
   */
  async getTradingStatus() {
    try {
      // Check if bitgetService is properly initialized
      if (!bitgetService || typeof bitgetService.getAccountBalance !== 'function' || typeof bitgetService.getPositions !== 'function') {
        return {
          autoTradingEnabled: this.isAutoTradingEnabled,
          accountBalance: 0,
          activePositionsCount: 0,
          activeTradingPairs: this.tradingPairs.length,
          serviceFunctional: false,
          timestamp: new Date().toISOString()
        };
      }
      
      const accountInfo = await bitgetService.getAccountBalance();
      const activePositions = await bitgetService.getPositions();
      
      const usdtAccount = accountInfo && Array.isArray(accountInfo) ? 
        accountInfo.find(acc => acc && acc.marginCoin === 'USDT') : null;
      
      return {
        autoTradingEnabled: this.isAutoTradingEnabled,
        accountBalance: usdtAccount ? parseFloat(usdtAccount.available || 0) : 0,
        activePositionsCount: activePositions && Array.isArray(activePositions) ? activePositions.length : 0,
        activeTradingPairs: this.tradingPairs.length,
        serviceFunctional: true,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Failed to get trading status: ${error ? error.message || String(error) : 'Unknown error'}`);
      
      return {
        autoTradingEnabled: this.isAutoTradingEnabled,
        accountBalance: 0,
        activePositionsCount: 0,
        activeTradingPairs: this.tradingPairs.length,
        serviceFunctional: false,
        error: error ? error.message || String(error) : 'Unknown error',
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get trade history
   * @param {number} limit Max number of records
   * @param {number} page Page number
   * @returns {Promise<Object>} Trade history with pagination
   */
  async getTradeHistory(limit = 20, page = 1) {
    try {
      // Check if bitgetService is properly initialized
      if (!bitgetService || typeof bitgetService.getTradeHistory !== 'function') {
        return {
          trades: [],
          pagination: {
            total: 0,
            page,
            limit,
            pages: 0
          },
          serviceFunctional: false
        };
      }
      
      const offset = (page - 1) * limit;
      const history = await bitgetService.getTradeHistory(limit * page);
      
      if (!history || !Array.isArray(history)) {
        return {
          trades: [],
          pagination: {
            total: 0,
            page,
            limit,
            pages: 0
          },
          serviceFunctional: true
        };
      }
      
      // Apply pagination
      const paginatedHistory = history.slice(offset, offset + limit);
      
      return {
        trades: paginatedHistory,
        pagination: {
          total: history.length,
          page,
          limit,
          pages: Math.ceil(history.length / limit)
        },
        serviceFunctional: true
      };
    } catch (error) {
      logger.error(`Failed to get trade history: ${error ? error.message || String(error) : 'Unknown error'}`);
      
      return {
        trades: [],
        pagination: {
          total: 0,
          page,
          limit,
          pages: 0
        },
        serviceFunctional: false,
        error: error ? error.message || String(error) : 'Unknown error'
      };
    }
  }
}

module.exports = new TradingService();