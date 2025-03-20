const axios = require('axios');
const crypto = require('crypto');
const { logger } = require('../utils/logger');

/**
 * Service to handle all interactions with the Bitget API
 */
class BitgetService {
  constructor() {
    this.baseUrl = 'https://api.bitget.com';
    this.apiKey = process.env.BITGET_API_KEY;
    this.secretKey = process.env.BITGET_SECRET_KEY;
    this.passphrase = process.env.BITGET_PASSPHRASE;
    this.coinGeckoUrl = 'https://api.coingecko.com/api/v3';
    
    // Define the exact count of large and mid cap pairs we want
    this.largeCapCount = 10;
    this.midCapCount = 30;
    
    // Cache for filtered pairs to avoid frequent API calls
    this.filteredPairsCache = null;
    this.lastCacheUpdate = 0;
    this.cacheValidityPeriod = 6 * 60 * 60 * 1000; // 6 hours in milliseconds

    if (!this.apiKey || !this.secretKey || !this.passphrase) {
      logger.warn('Bitget API credentials not found in environment variables');
    }
  }

  /**
   * Generate signature for Bitget API authentication
   * @param {string} timestamp ISO timestamp
   * @param {string} method HTTP method
   * @param {string} requestPath API endpoint path
   * @param {string} body Request body (if any)
   * @returns {string} Signature
   */
  generateSignature(timestamp, method, requestPath, body = '') {
    const message = timestamp + method + requestPath + body;
    return crypto
      .createHmac('sha256', this.secretKey)
      .update(message)
      .digest('base64');
  }

  /**
   * Make authenticated request to Bitget API
   * @param {string} method HTTP method
   * @param {string} endpoint API endpoint
   * @param {Object} data Request data
   * @returns {Promise<Object>} API response
   */
  async request(method, endpoint, data = {}) {
    try {
      const timestamp = new Date().toISOString();
      const body = method === 'GET' ? '' : JSON.stringify(data);
      const signature = this.generateSignature(timestamp, method, endpoint, body);

      const headers = {
        'ACCESS-KEY': this.apiKey,
        'ACCESS-SIGN': signature,
        'ACCESS-TIMESTAMP': timestamp,
        'ACCESS-PASSPHRASE': this.passphrase,
        'Content-Type': 'application/json'
      };

      const url = `${this.baseUrl}${endpoint}`;
      
      const options = {
        method,
        url,
        headers,
        data: method === 'GET' ? undefined : data
      };

      const response = await axios(options);
      return response.data;
    } catch (error) {
      logger.error(`Bitget API request failed: ${error.message}`, {
        endpoint,
        error: error.response?.data || error.message
      });
      throw new Error(error.response?.data?.msg || error.message);
    }
  }

  /**
   * Make request to CoinGecko API
   * @param {string} endpoint API endpoint
   * @param {Object} params Query parameters
   * @returns {Promise<Object>} API response
   */
  async requestCoinGecko(endpoint, params = {}) {
    try {
      const url = `${this.coinGeckoUrl}${endpoint}`;
      const response = await axios.get(url, { params });
      return response.data;
    } catch (error) {
      logger.error(`CoinGecko API request failed: ${error.message}`, {
        endpoint,
        error: error.response?.data || error.message
      });
      throw new Error(error.response?.data?.error || error.message);
    }
  }

  /**
   * Get market cap data from CoinGecko for categorizing pairs
   * @returns {Promise<Object>} Market cap data
   */
  async getMarketCapData() {
    try {
      const data = await this.requestCoinGecko('/coins/markets', {
        vs_currency: 'usd',
        order: 'market_cap_desc',
        per_page: 250, // Fetch enough to cover all potential pairs
        page: 1,
        sparkline: false
      });
      
      return data;
    } catch (error) {
      logger.error(`Failed to get market cap data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get filtered list of top 10 large-cap and 30 mid-cap pairs
   * @returns {Promise<Object>} Filtered trading pairs by market cap
   */
  async getFilteredTradingPairs() {
    // Check if we have a valid cache
    const now = Date.now();
    if (
      this.filteredPairsCache && 
      (now - this.lastCacheUpdate) < this.cacheValidityPeriod
    ) {
      logger.info('Using cached filtered trading pairs');
      return this.filteredPairsCache;
    }

    try {
      // Step 1: Get all available pairs from Bitget
      const bitgetMarketData = await this.getMarketData(false); // Get raw data
      
      if (!bitgetMarketData || bitgetMarketData.length === 0) {
        throw new Error('No market data received from Bitget');
      }
      
      // Extract symbols from Bitget data
      const availablePairs = bitgetMarketData.map(pair => {
        const symbol = pair.symbol.split('_')[0];
        return {
          symbol,
          volume: parseFloat(pair.usdtVolume)
        };
      }).filter(pair => pair.volume > 0); // Ensure valid volume
      
      // Step 2: Get market cap data from CoinGecko
      const marketCapData = await this.getMarketCapData();
      
      // Create a map for quick lookup of market cap rank
      const marketCapRankMap = {};
      marketCapData.forEach(coin => {
        // Handle both uppercase and lowercase symbols
        marketCapRankMap[coin.symbol.toUpperCase()] = {
          rank: coin.market_cap_rank,
          marketCap: coin.market_cap
        };
      });
      
      // Step 3: Categorize and filter pairs
      const categorizedPairs = availablePairs.map(pair => {
        const marketCapInfo = marketCapRankMap[pair.symbol.toUpperCase()] || { rank: 9999, marketCap: 0 };
        return {
          symbol: pair.symbol,
          volume: pair.volume,
          marketCapRank: marketCapInfo.rank,
          marketCap: marketCapInfo.marketCap,
          category: marketCapInfo.rank <= 20 ? 'large-cap' : 
                  marketCapInfo.rank <= 100 ? 'mid-cap' : 'small-cap'
        };
      });
      
      // Step 4: Sort and select top pairs by market cap
      const largeCapPairs = categorizedPairs
        .filter(pair => pair.category === 'large-cap')
        .sort((a, b) => a.marketCapRank - b.marketCapRank)
        .slice(0, this.largeCapCount);
      
      const midCapPairs = categorizedPairs
        .filter(pair => pair.category === 'mid-cap')
        .sort((a, b) => a.marketCapRank - b.marketCapRank)
        .slice(0, this.midCapCount);
      
      // Combine and sort by market cap rank
      const filteredPairs = [...largeCapPairs, ...midCapPairs]
        .sort((a, b) => a.marketCapRank - b.marketCapRank);
      
      // Get just the symbols for easy access
      const filteredSymbols = filteredPairs.map(pair => pair.symbol);
      
      // Store in cache
      this.filteredPairsCache = {
        largeCapPairs,
        midCapPairs,
        allFilteredPairs: filteredPairs,
        filteredSymbols
      };
      this.lastCacheUpdate = now;
      
      logger.info(`Filtered trading pairs: ${filteredSymbols.length} pairs selected (${largeCapPairs.length} large-cap, ${midCapPairs.length} mid-cap)`);
      logger.debug(`Selected pairs: ${filteredSymbols.join(', ')}`);
      
      return this.filteredPairsCache;
    } catch (error) {
      logger.error(`Failed to filter trading pairs: ${error.message}`);
      
      // If we can't get fresh data but have a cache, use it even if expired
      if (this.filteredPairsCache) {
        logger.warn('Using expired cached filtered trading pairs due to error');
        return this.filteredPairsCache;
      }
      
      throw error;
    }
  }

  /**
   * Get market data for USDT trading pairs, optionally filtered by market cap
   * @param {boolean} filtered Whether to filter pairs by market cap
   * @returns {Promise<Array>} List of market data
   */
  async getMarketData(filtered = true) {
    try {
      // Updated endpoint based on the latest Bitget API documentation
      const response = await this.request('GET', '/api/mix/v1/market/tickers?productType=UMCBL');
      
      if (!filtered) {
        return response.data; // Return all pairs without filtering
      }
      
      // Get filtered pairs
      const { filteredSymbols } = await this.getFilteredTradingPairs();
      
      // Filter market data to include only selected pairs
      const filteredData = response.data.filter(pair => {
        const symbol = pair.symbol.split('_')[0];
        return filteredSymbols.includes(symbol);
      });
      
      logger.info(`Retrieved ${filteredData.length} filtered market data entries`);
      return filteredData;
    } catch (error) {
      logger.error(`Failed to get market data: ${error.message}`);
      throw error;
    }
  }

  /**
   * Place a trade order
   * @param {string} symbol Trading symbol
   * @param {string} side 'buy' or 'sell'
   * @param {number} size Order size
   * @param {number} price Order price (optional for market orders)
   * @param {string} orderType 'limit' or 'market'
   * @param {number} stopLoss Stop loss price
   * @param {number} takeProfit Take profit price
   * @returns {Promise<Object>} Order response
   */
  async placeOrder(symbol, side, size, price = null, orderType = 'market', stopLoss = null, takeProfit = null) {
    try {
      // Verify that symbol is in our filtered list before placing order
      const { filteredSymbols } = await this.getFilteredTradingPairs();
      const baseSymbol = symbol.split('_')[0];
      
      if (!filteredSymbols.includes(baseSymbol)) {
        throw new Error(`Symbol ${baseSymbol} is not in the approved list of 40 trading pairs`);
      }
      
      const order = {
        symbol: `${symbol}_UMCBL`,
        marginCoin: 'USDT',
        size: size.toString(),
        side: side.toLowerCase() === 'buy' ? 'buy' : 'sell',
        orderType: orderType,
        timeInForceValue: 'normal'
      };

      if (price && orderType === 'limit') {
        order.price = price.toString();
      }

      const response = await this.request('POST', '/api/mix/v1/order/placeOrder', order);
      
      // If stop loss and take profit are specified, place them after the main order
      if (response.data?.orderId && (stopLoss || takeProfit)) {
        await this.placeStopOrders(symbol, side, response.data.orderId, stopLoss, takeProfit);
      }
      
      return response.data;
    } catch (error) {
      logger.error(`Failed to place order: ${error.message}`);
      throw error;
    }
  }

  /**
   * Place stop loss and take profit orders
   * @param {string} symbol Trading symbol
   * @param {string} side Original order side
   * @param {string} parentOrderId Parent order ID
   * @param {number} stopLoss Stop loss price
   * @param {number} takeProfit Take profit price
   * @returns {Promise<Object>} Stop orders response
   */
  async placeStopOrders(symbol, side, parentOrderId, stopLoss = null, takeProfit = null) {
    const promises = [];
    const oppositeSide = side.toLowerCase() === 'buy' ? 'sell' : 'buy';
    
    if (stopLoss) {
      const stopLossOrder = {
        symbol: `${symbol}_UMCBL`,
        marginCoin: 'USDT',
        triggerPrice: stopLoss.toString(),
        side: oppositeSide,
        orderType: 'market',
        timeInForceValue: 'normal',
        presetTakeProfitPrice: '',
        presetStopLossPrice: '',
        clientOid: `sl_${parentOrderId}`,
        triggerType: 'market_price'
      };
      
      promises.push(this.request('POST', '/api/mix/v1/plan/placeTPSL', stopLossOrder));
    }
    
    if (takeProfit) {
      const takeProfitOrder = {
        symbol: `${symbol}_UMCBL`,
        marginCoin: 'USDT',
        triggerPrice: takeProfit.toString(),
        side: oppositeSide,
        orderType: 'market',
        timeInForceValue: 'normal',
        presetTakeProfitPrice: '',
        presetStopLossPrice: '',
        clientOid: `tp_${parentOrderId}`,
        triggerType: 'market_price'
      };
      
      promises.push(this.request('POST', '/api/mix/v1/plan/placeTPSL', takeProfitOrder));
    }
    
    const results = await Promise.all(promises);
    return results;
  }

  /**
   * Get account position information, optionally filtered by symbol
   * @param {string} symbol Trading symbol
   * @returns {Promise<Array>} Position information
   */
  async getPositions(symbol = '') {
    try {
      let endpoint;
      let response;
      
      if (symbol) {
        endpoint = `/api/mix/v1/position/singlePosition?symbol=${symbol}_UMCBL`;
        response = await this.request('GET', endpoint);
        return response.data;
      } else {
        // If no symbol specified, get all positions but filter to our approved list
        endpoint = '/api/mix/v1/position/allPosition?productType=UMCBL';
        response = await this.request('GET', endpoint);
        
        // Get filtered symbols
        const { filteredSymbols } = await this.getFilteredTradingPairs();
        
        // Filter positions to only include approved pairs
        const filteredPositions = response.data.filter(position => {
          const baseSymbol = position.symbol.split('_')[0];
          return filteredSymbols.includes(baseSymbol);
        });
        
        return filteredPositions;
      }
    } catch (error) {
      logger.error(`Failed to get positions: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get account balance information
   * @returns {Promise<Object>} Account balance
   */
  async getAccountBalance() {
    try {
      const response = await this.request('GET', '/api/mix/v1/account/accounts?productType=UMCBL');
      return response.data;
    } catch (error) {
      logger.error(`Failed to get account balance: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get trade history, optionally filtered by our approved coin list
   * @param {number} limit Max number of records
   * @param {number} startTime Start time in milliseconds
   * @param {number} endTime End time in milliseconds
   * @param {boolean} filterByApprovedList Whether to filter by approved coin list
   * @returns {Promise<Array>} Trade history
   */
  async getTradeHistory(limit = 100, startTime = null, endTime = null, filterByApprovedList = true) {
    try {
      let endpoint = `/api/mix/v1/order/history?productType=UMCBL&limit=${limit}`;
      
      if (startTime) {
        endpoint += `&startTime=${startTime}`;
      }
      
      if (endTime) {
        endpoint += `&endTime=${endTime}`;
      }
      
      const response = await this.request('GET', endpoint);
      
      if (!filterByApprovedList) {
        return response.data;
      }
      
      // Get filtered symbols
      const { filteredSymbols } = await this.getFilteredTradingPairs();
      
      // Filter trade history to only include approved pairs
      const filteredHistory = response.data.filter(trade => {
        const baseSymbol = trade.symbol.split('_')[0];
        return filteredSymbols.includes(baseSymbol);
      });
      
      return filteredHistory;
    } catch (error) {
      logger.error(`Failed to get trade history: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get the list of approved trading symbols
   * @returns {Promise<Array>} List of approved symbols
   */
  async getApprovedSymbols() {
    const { filteredSymbols } = await this.getFilteredTradingPairs();
    return filteredSymbols;
  }
}

module.exports = new BitgetService();