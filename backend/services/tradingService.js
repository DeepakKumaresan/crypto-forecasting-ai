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
    this.initialize().catch(err => {
      logger.error(`Failed to initialize trading service: ${err ? (err.message || String(err)) : 'Unknown error'}`);
    });
  }

  /**
   * Initialize the trading service
   */
  async initialize() {
    try {
      await this.updateTradingPairs();
      
      setInterval(() => {
        this.updateTradingPairs().catch(err => {
          logger.error(`Periodic trading pairs update failed: ${err ? err.message || String(err) : 'Unknown error'}`);
        });
      }, 3600000); // Update every hour
      
      logger.info('Trading service initialized successfully');
    } catch (error) {
      logger.error(`Failed to initialize trading service: ${error.message || String(error)}`);
    }
  }

  /**
   * Update the list of trading pairs to monitor
   */
  async updateTradingPairs() {
    try {
      if (!bitgetService || typeof bitgetService.getMarketData !== 'function') {
        logger.warn('Bitget service not initialized properly, skipping updateTradingPairs');
        return;
      }

      const marketData = await bitgetService.getMarketData();
      
      if (!marketData || !Array.isArray(marketData)) {
        logger.warn('Invalid market data received, skipping update');
        return;
      }

      const usdtPairs = marketData
        .filter(pair => pair && pair.symbol && pair.symbol.endsWith('_UMCBL') && pair.symbol.includes('USDT'))
        .map(pair => ({
          symbol: pair.symbol.replace('_UMCBL', ''),
          volume24h: parseFloat(pair.volume24h || 0),
          price: parseFloat(pair.last || 0)
        }))
        .sort((a, b) => b.volume24h - a.volume24h);
      
      this.tradingPairs = usdtPairs.slice(0, this.maxPairsToWatch).map(pair => pair.symbol);
      
      logger.info(`Updated trading pairs: ${this.tradingPairs.length} pairs selected`);
    } catch (error) {
      logger.error(`Failed to update trading pairs: ${error.message || String(error)}`);
    }
  }

  /**
   * Get AI-filtered trade signals
   */
  async getTradeSignals(timeframe = '15m') {
    try {
      const response = await axios.post(`${this.mlApiUrl}/predict`, {
        pairs: this.tradingPairs,
        timeframe
      });

      const signals = response.data && response.data.predictions;
      
      if (!signals || !Array.isArray(signals)) {
        logger.warn('Invalid signals data received from ML API');
        return [];
      }

      const filteredSignals = this.filterSignals(signals, timeframe);
      this.updateActiveSignals(filteredSignals, timeframe);

      if (this.isAutoTradingEnabled) {
        await this.executeAutoTrades(filteredSignals).catch(err => {
          logger.error(`Auto-trading execution failed: ${err.message || String(err)}`);
        });
      }

      return filteredSignals;
    } catch (error) {
      logger.error(`Failed to get trade signals: ${error.message || String(error)}`);
      return [];
    }
  }

  /**
   * Filter signals based on AI confidence and remove duplicates
   */
  filterSignals(signals, timeframe) {
    if (!signals || !Array.isArray(signals)) return [];

    const highConfidenceSignals = signals.filter(signal => 
      signal && typeof signal === 'object' && 
      signal.confidence >= parseFloat(process.env.MIN_SIGNAL_CONFIDENCE || '0.7')
    );

    const uniqueSignals = [];
    const sigKeys = new Set();

    for (const signal of highConfidenceSignals) {
      if (!signal || !signal.symbol || !signal.side) continue;

      const key = `${signal.symbol}_${signal.side}`;
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
   */
  updateActiveSignals(signals, timeframe) {
    if (!signals || !Array.isArray(signals)) return;

    const now = Date.now();
    for (const [key, signal] of this.activeSignals.entries()) {
      if (new Date(signal.expiresAt).getTime() < now) {
        this.activeSignals.delete(key);
      }
    }

    for (const signal of signals) {
      if (!signal || !signal.symbol || !signal.side) continue;

      const key = `${signal.symbol}_${signal.side}_${timeframe}`;
      this.activeSignals.set(key, signal);
    }
  }

  /**
   * Toggle auto-trading
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
   * Get trade history
   */
  async getTradeHistory(limit = 20, page = 1) {
    try {
      if (!bitgetService || typeof bitgetService.getTradeHistory !== 'function') {
        return {
          trades: [],
          pagination: { total: 0, page, limit, pages: 0 },
          serviceFunctional: false
        };
      }

      const offset = (page - 1) * limit;
      const history = await bitgetService.getTradeHistory(limit * page);

      if (!history || !Array.isArray(history)) {
        return {
          trades: [],
          pagination: { total: 0, page, limit, pages: 0 },
          serviceFunctional: true
        };
      }

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
      logger.error(`Failed to get trade history: ${error.message || String(error)}`);
      return {
        trades: [],
        pagination: { total: 0, page, limit, pages: 0 },
        serviceFunctional: false
      };
    }
  }
}

module.exports = new TradingService();
