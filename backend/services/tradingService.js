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
      logger.error(`Failed to initialize trading service: ${error.message}`);
    }
  }

  /**
   * Update the list of trading pairs to monitor
   */
  async updateTradingPairs() {
    try {
      const marketData = await bitgetService.getMarketData();
      
      // Filter for USDT pairs and sort by volume
      const usdtPairs = marketData
        .filter(pair => pair.symbol.endsWith('_UMCBL') && pair.symbol.includes('USDT'))
        .map(pair => ({
          symbol: pair.symbol.replace('_UMCBL', ''),
          volume24h: parseFloat(pair.volume24h),
          price: parseFloat(pair.last)
        }))
        .sort((a, b) => b.volume24h - a.volume24h);
      
      // Take top N pairs by volume
      this.tradingPairs = usdtPairs.slice(0, this.maxPairsToWatch).map(pair => pair.symbol);
      
      logger.info(`Updated trading pairs: ${this.tradingPairs.length} pairs selected`);
    } catch (error) {
      logger.error(`Failed to update trading pairs: ${error.message}`);
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
      
      const signals = response.data.predictions;
      
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
      logger.error(`Failed to get trade signals: ${error.message}`);
      throw error;
    }
  }

  /**
   * Filter signals based on AI confidence and remove duplicates
   * @param {Array} signals Raw signals from ML API
   * @param {string} timeframe Timeframe for signals
   * @returns {Array} Filtered signals
   */
  filterSignals(signals, timeframe) {
    // Filter signals with high confidence
    const highConfidenceSignals = signals.filter(signal => 
      signal.confidence >= parseFloat(process.env.MIN_SIGNAL_CONFIDENCE || '0.7')
    );
    
    // Remove duplicate signals (same pair and same direction)
    const uniqueSignals = [];
    const sigKeys = new Set();
    
    for (const signal of highConfidenceSignals) {
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
    // Remove expired signals
    const now = Date.now();
    for (const [key, signal] of this.activeSignals.entries()) {
      if (new Date(signal.expiresAt).getTime() < now) {
        this.activeSignals.delete(key);
      }
    }
    
    // Add new signals
    for (const signal of signals) {
      const key = `${signal.symbol}_${signal.side}_${timeframe}`;
      this.activeSignals.set(key, signal);
    }
  }

  /**
   * Execute trades automatically based on signals
   * @param {Array} signals Trade signals
   */
  async executeAutoTrades(signals) {
    try {
      // Get account balance
      const accountInfo = await bitgetService.getAccountBalance();
      const availableBalance = accountInfo.find(acc => acc.marginCoin === 'USDT')?.available || 0;
      
      if (availableBalance <= 0) {
        logger.warn('Insufficient balance for auto-trading');
        return;
      }
      
      // Calculate trade size per signal
      const maxSignals = Math.min(signals.length, 5); // Max 5 concurrent trades
      const tradeSize = (availableBalance * 0.9) / maxSignals; // Use 90% of available balance
      
      // Execute trades for each signal
      for (const signal of signals) {
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
          logger.error(`Failed to auto-execute trade for ${signal.symbol}: ${error.message}`);
        }
      }
    } catch (error) {
      logger.error(`Error in auto-trading execution: ${error.message}`);
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
    try {
      // If stopLoss or takeProfit are not provided, calculate them
      const currentPrice = price || await this.getCurrentPrice(symbol);
      
      if (!stopLoss) {
        stopLoss = this.calculateStopLoss(currentPrice, side);
      }
      
      if (!takeProfit) {
        takeProfit = this.calculateTakeProfit(currentPrice, side);
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
      logger.error(`Failed to execute trade: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get current price for a symbol
   * @param {string} symbol Trading symbol
   * @returns {Promise<number>} Current price
   */
  async getCurrentPrice(symbol) {
    try {
      const marketData = await bitgetService.getMarketData();
      const pair = marketData.find(p => p.symbol === `${symbol}_UMCBL`);
      
      if (!pair) {
        throw new Error(`Symbol ${symbol} not found in market data`);
      }
      
      return parseFloat(pair.last);
    } catch (error) {
      logger.error(`Failed to get current price for ${symbol}: ${error.message}`);
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
    this.isAutoTradingEnabled = enabled;
    
    logger.info(`Auto-trading ${enabled ? 'enabled' : 'disabled'}`);
    
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
      const accountInfo = await bitgetService.getAccountBalance();
      const activePositions = await bitgetService.getPositions();
      
      return {
        autoTradingEnabled: this.isAutoTradingEnabled,
        accountBalance: accountInfo.find(acc => acc.marginCoin === 'USDT')?.available || 0,
        activePositionsCount: activePositions.length,
        activeTradingPairs: this.tradingPairs.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      logger.error(`Failed to get trading status: ${error.message}`);
      throw error;
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
      const offset = (page - 1) * limit;
      const history = await bitgetService.getTradeHistory(limit * page);
      
      // Apply pagination
      const paginatedHistory = history.slice(offset, offset + limit);
      
      return {
        trades: paginatedHistory,
        pagination: {
          total: history.length,
          page,
          limit,
          pages: Math.ceil(history.length / limit)
        }
      };
    } catch (error) {
      logger.error(`Failed to get trade history: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new TradingService();