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
    
    // Fallback data for when API calls fail
    this.fallbackData = {
      largeCapPairs: [],
      midCapPairs: [],
      allFilteredPairs: [],
      filteredSymbols: []
    };

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
        data: method === 'GET' ? undefined : data,
        timeout: 10000 // Add timeout to prevent hanging requests
      };

      const response = await axios(options);
      
      // Check if the response has the expected structure
      if (!response.data || (response.data.code !== '00000' && response.data.code !== 0)) {
        throw new Error(`API returned error code: ${response.data?.code}, message: ${response.data?.msg}`);
      }
      
      return response.data;
    } catch (error) {
      logger.error(`Bitget API request failed: ${error.message}`, {
        endpoint,
        error: error.response?.data || error.message
      });
      
      // Throw a more informative error
      throw new Error(error.response?.data?.msg || `Bitget API request failed: ${error.message}`);
    }
  }

  /**
   * Make request to CoinGecko API with retry and better error handling
   * @param {string} endpoint API endpoint
   * @param {Object} params Query parameters
   * @returns {Promise<Object>} API response
   */
  async requestCoinGecko(endpoint, params = {}) {
    const maxRetries = 3;
    let retries = 0;
    let lastError = null;

    while (retries < maxRetries) {
      try {
        const url = `${this.coinGeckoUrl}${endpoint}`;
        
        // Add API key if available (for higher rate limits)
        if (process.env.COINGECKO_API_KEY) {
          params.x_cg_pro_api_key = process.env.COINGECKO_API_KEY;
        }
        
        // Add a cache-busting parameter to avoid rate limiting issues
        params._cacheBust = Date.now();
        
        const response = await axios.get(url, { 
          params,
          timeout: 15000, // Increase timeout for CoinGecko
          headers: {
            'Accept': 'application/json',
            'User-Agent': 'Trading-Bot/1.0.0'
          }
        });
        
        return response.data;
      } catch (error) {
        lastError = error;
        
        // Log the error but only if it's not a rate limit issue or on the final retry
        if (error.response?.status !== 429 || retries === maxRetries - 1) {
          logger.error(`CoinGecko API request failed (attempt ${retries + 1}/${maxRetries}): ${error.message}`, {
            endpoint,
            status: error.response?.status,
            error: error.response?.data || error.message
          });
        }
        
        // If we hit rate limits, wait longer between retries
        const delayMs = error.response?.status === 429 ? 5000 : 1000;
        await new Promise(resolve => setTimeout(resolve, delayMs * (retries + 1)));
        
        retries++;
      }
    }
    
    // If all retries failed, throw the last error
    throw new Error(`CoinGecko API request failed after ${maxRetries} attempts: ${lastError.message}`);
  }

  /**
   * Get market cap data from CoinGecko with fallback mechanism
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
      
      if (!Array.isArray(data) || data.length === 0) {
        throw new Error('Invalid market cap data received from CoinGecko');
      }
      
      return data;
    } catch (error) {
      logger.error(`Failed to get market cap data: ${error.message}`);
      
      // Implement fallback mechanism - use volume-based estimates if CoinGecko fails
      logger.info('Using volume-based estimates for market cap due to API error');
      return null;
    }
  }

  /**
   * Estimate market cap rank based on trading volume when CoinGecko fails
   * @param {Array} pairs Array of trading pairs with volume data
   * @returns {Array} Pairs with estimated market cap ranks
   */
  estimateMarketCapFromVolume(pairs) {
    if (!Array.isArray(pairs) || pairs.length === 0) {
      return [];
    }
    
    // Sort pairs by volume (descending)
    const sortedPairs = [...pairs].sort((a, b) => b.volume - a.volume);
    
    // Assign estimated ranks based on volume
    return sortedPairs.map((pair, index) => ({
      symbol: pair.symbol,
      volume: pair.volume,
      marketCapRank: index + 1, // Estimated rank based on volume
      marketCap: pair.volume * 100, // Rough estimate: volume * 100 as placeholder
      category: index < 20 ? 'large-cap' : 
              index < 100 ? 'mid-cap' : 'small-cap'
    }));
  }

  /**
   * Get filtered list of top 10 large-cap and 30 mid-cap pairs with improved error handling
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
          volume: parseFloat(pair.usdtVolume || pair.volumeUsd || '0')
        };
      }).filter(pair => pair.volume > 0 && pair.symbol); // Ensure valid volume and symbol
      
      if (availablePairs.length === 0) {
        throw new Error('No valid pairs extracted from Bitget data');
      }
      
      let categorizedPairs = [];
      
      // Step 2: Try to get market cap data from CoinGecko
      const marketCapData = await this.getMarketCapData();
      
      if (marketCapData) {
        // Create a map for quick lookup of market cap rank
        const marketCapRankMap = {};
        marketCapData.forEach(coin => {
          // Handle both uppercase and lowercase symbols for better matching
          if (coin.symbol) {
            marketCapRankMap[coin.symbol.toUpperCase()] = {
              rank: coin.market_cap_rank || 9999,
              marketCap: coin.market_cap || 0
            };
          }
        });
        
        // Step 3: Categorize and filter pairs
        categorizedPairs = availablePairs.map(pair => {
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
      } else {
        // Fallback: Use volume-based estimates if CoinGecko fails
        categorizedPairs = this.estimateMarketCapFromVolume(availablePairs);
      }
      
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
      
      // Also update fallback data
      this.fallbackData = this.filteredPairsCache;
      
      logger.info(`Filtered trading pairs: ${filteredSymbols.length} pairs selected (${largeCapPairs.length} large-cap, ${midCapPairs.length} mid-cap)`);
      if (filteredSymbols.length > 0) {
        logger.debug(`Selected pairs: ${filteredSymbols.join(', ')}`);
      }
      
      return this.filteredPairsCache;
    } catch (error) {
      logger.error(`Failed to filter trading pairs: ${error.message}`);
      
      // If we can't get fresh data but have a cache, use it even if expired
      if (this.filteredPairsCache) {
        logger.warn('Using expired cached filtered trading pairs due to error');
        return this.filteredPairsCache;
      }
      
      // If no cache is available, use fallback data
      logger.warn('Using fallback data for trading pairs');
      return this.fallbackData;
    }
  }

  /**
   * Get market data for USDT trading pairs, optionally filtered by market cap
   * With improved error handling
   * @param {boolean} filtered Whether to filter pairs by market cap
   * @returns {Promise<Array>} List of market data
   */
  async getMarketData(filtered = true) {
    try {
      // Updated endpoint based on the latest Bitget API documentation
      // The UMCBL refers to USDT-Margined Contract
      const response = await this.request('GET', '/api/mix/v1/market/tickers?productType=UMCBL');
      
      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Invalid market data format received from Bitget');
      }
      
      // Filter out any invalid data
      const validData = response.data.filter(item => 
        item && item.symbol && (item.usdtVolume || item.volumeUsd)
      );
      
      if (validData.length === 0) {
        throw new Error('No valid market data found');
      }
      
      if (!filtered) {
        return validData; // Return all pairs without filtering
      }
      
      // Get filtered pairs
      const { filteredSymbols } = await this.getFilteredTradingPairs();
      
      if (!filteredSymbols || filteredSymbols.length === 0) {
        logger.warn('No filtered symbols available, returning all market data');
        return validData;
      }
      
      // Filter market data to include only selected pairs
      const filteredData = validData.filter(pair => {
        const symbol = pair.symbol.split('_')[0];
        return filteredSymbols.includes(symbol);
      });
      
      logger.info(`Retrieved ${filteredData.length} filtered market data entries`);
      return filteredData;
    } catch (error) {
      logger.error(`Failed to get market data: ${error.message}`);
      
      // Return empty array instead of throwing to prevent cascading failures
      return [];
    }
  }

  /**
   * Get fallback market data for use when all else fails
   * @returns {Promise<Array>} Fallback market data
   */
  async getFallbackMarketData() {
    try {
      // First try to get real data
      const realData = await this.getMarketData(true);
      if (realData && realData.length > 0) {
        return realData;
      }
      
      // If that fails, return synthetic data based on our fallback
      if (this.fallbackData.allFilteredPairs.length > 0) {
        // Create synthetic market data from our fallback pairs
        return this.fallbackData.allFilteredPairs.map(pair => ({
          symbol: `${pair.symbol}_UMCBL`,
          lastPrice: "0",
          askOne: "0",
          bidOne: "0",
          baseVolume: "0",
          usdtVolume: pair.volume.toString(),
          high24h: "0",
          low24h: "0",
          timestamp: Date.now(),
          priceChangePercent: "0",
          // Add any other required fields with default values
        }));
      }
      
      // Last resort - return empty array
      return [];
    } catch (error) {
      logger.error(`Failed to get fallback market data: ${error.message}`);
      return [];
    }
  }

  /**
   * Place a trade order with improved validation and error handling
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
    // Input validation
    if (!symbol || typeof symbol !== 'string') {
      throw new Error('Invalid symbol');
    }
    
    if (!['buy', 'sell'].includes(side.toLowerCase())) {
      throw new Error('Invalid side. Must be "buy" or "sell"');
    }
    
    if (isNaN(parseFloat(size)) || parseFloat(size) <= 0) {
      throw new Error('Invalid size. Must be a positive number');
    }
    
    if (price !== null && (isNaN(parseFloat(price)) || parseFloat(price) <= 0)) {
      throw new Error('Invalid price. Must be a positive number');
    }
    
    if (!['limit', 'market'].includes(orderType.toLowerCase())) {
      throw new Error('Invalid orderType. Must be "limit" or "market"');
    }
    
    if (stopLoss !== null && isNaN(parseFloat(stopLoss))) {
      throw new Error('Invalid stopLoss. Must be a number');
    }
    
    if (takeProfit !== null && isNaN(parseFloat(takeProfit))) {
      throw new Error('Invalid takeProfit. Must be a number');
    }
    
    try {
      // Clean symbol format - ensure UMCBL suffix is not duplicated
      const cleanSymbol = symbol.endsWith('_UMCBL') ? symbol : `${symbol}_UMCBL`;
      const baseSymbol = cleanSymbol.split('_')[0];
      
      // Verify that symbol is in our filtered list before placing order
      const { filteredSymbols } = await this.getFilteredTradingPairs();
      
      if (!filteredSymbols.includes(baseSymbol)) {
        throw new Error(`Symbol ${baseSymbol} is not in the approved list of trading pairs`);
      }
      
      const order = {
        symbol: cleanSymbol,
        marginCoin: 'USDT',
        size: parseFloat(size).toString(),
        side: side.toLowerCase() === 'buy' ? 'buy' : 'sell',
        orderType: orderType.toLowerCase(),
        timeInForceValue: 'normal'
      };

      if (price && orderType.toLowerCase() === 'limit') {
        order.price = parseFloat(price).toString();
      }

      const response = await this.request('POST', '/api/mix/v1/order/placeOrder', order);
      
      if (!response.data || !response.data.orderId) {
        throw new Error('Order placement failed: No order ID received');
      }
      
      logger.info(`Order placed successfully: ${response.data.orderId}`);
      
      // If stop loss and take profit are specified, place them after the main order
      if (response.data.orderId && (stopLoss || takeProfit)) {
        try {
          await this.placeStopOrders(cleanSymbol, side, response.data.orderId, stopLoss, takeProfit);
        } catch (stopOrderError) {
          // Log error but don't fail the main order
          logger.error(`Failed to place stop orders: ${stopOrderError.message}`);
        }
      }
      
      return response.data;
    } catch (error) {
      logger.error(`Failed to place order: ${error.message}`);
      throw error;
    }
  }

  /**
   * Place stop loss and take profit orders with improved error handling
   * @param {string} symbol Trading symbol
   * @param {string} side Original order side
   * @param {string} parentOrderId Parent order ID
   * @param {number} stopLoss Stop loss price
   * @param {number} takeProfit Take profit price
   * @returns {Promise<Object>} Stop orders response
   */
  async placeStopOrders(symbol, side, parentOrderId, stopLoss = null, takeProfit = null) {
    if (!stopLoss && !takeProfit) {
      return { message: 'No stop orders to place' };
    }
    
    const promises = [];
    const oppositeSide = side.toLowerCase() === 'buy' ? 'sell' : 'buy';
    
    // Ensure the symbol has the correct format
    const cleanSymbol = symbol.endsWith('_UMCBL') ? symbol : `${symbol}_UMCBL`;
    
    if (stopLoss) {
      const stopLossOrder = {
        symbol: cleanSymbol,
        marginCoin: 'USDT',
        triggerPrice: parseFloat(stopLoss).toString(),
        side: oppositeSide,
        orderType: 'market',
        timeInForceValue: 'normal',
        presetTakeProfitPrice: '',
        presetStopLossPrice: '',
        clientOid: `sl_${parentOrderId}_${Date.now()}`, // Add timestamp for uniqueness
        triggerType: 'market_price'
      };
      
      promises.push(
        this.request('POST', '/api/mix/v1/plan/placeTPSL', stopLossOrder)
          .catch(error => {
            logger.error(`Failed to place stop loss: ${error.message}`);
            return { error: error.message, type: 'stop_loss' };
          })
      );
    }
    
    if (takeProfit) {
      const takeProfitOrder = {
        symbol: cleanSymbol,
        marginCoin: 'USDT',
        triggerPrice: parseFloat(takeProfit).toString(),
        side: oppositeSide,
        orderType: 'market',
        timeInForceValue: 'normal',
        presetTakeProfitPrice: '',
        presetStopLossPrice: '',
        clientOid: `tp_${parentOrderId}_${Date.now()}`, // Add timestamp for uniqueness
        triggerType: 'market_price'
      };
      
      promises.push(
        this.request('POST', '/api/mix/v1/plan/placeTPSL', takeProfitOrder)
          .catch(error => {
            logger.error(`Failed to place take profit: ${error.message}`);
            return { error: error.message, type: 'take_profit' };
          })
      );
    }
    
    const results = await Promise.all(promises);
    
    // Check if any orders failed
    const failures = results.filter(result => result.error);
    if (failures.length > 0) {
      logger.warn(`${failures.length} stop orders failed to place:`, failures);
    }
    
    return {
      results,
      success: results.length - failures.length,
      failures: failures.length
    };
  }

  /**
   * Get account position information, optionally filtered by symbol
   * With improved error handling
   * @param {string} symbol Trading symbol
   * @returns {Promise<Array>} Position information
   */
  async getPositions(symbol = '') {
    try {
      let endpoint;
      let response;
      
      if (symbol) {
        // Clean up symbol format
        const cleanSymbol = symbol.endsWith('_UMCBL') ? symbol : `${symbol}_UMCBL`;
        endpoint = `/api/mix/v1/position/singlePosition?symbol=${cleanSymbol}`;
        response = await this.request('GET', endpoint);
        
        if (!response.data) {
          throw new Error('No position data received');
        }
        
        return Array.isArray(response.data) ? response.data : [response.data];
      } else {
        // If no symbol specified, get all positions but filter to our approved list
        endpoint = '/api/mix/v1/position/allPosition?productType=UMCBL';
        response = await this.request('GET', endpoint);
        
        if (!response.data || !Array.isArray(response.data)) {
          throw new Error('Invalid position data received');
        }
        
        // Get filtered symbols
        const { filteredSymbols } = await this.getFilteredTradingPairs();
        
        if (!filteredSymbols || filteredSymbols.length === 0) {
          // If no filtered symbols, return all positions
          return response.data;
        }
        
        // Filter positions to only include approved pairs
        const filteredPositions = response.data.filter(position => {
          if (!position || !position.symbol) return false;
          const baseSymbol = position.symbol.split('_')[0];
          return filteredSymbols.includes(baseSymbol);
        });
        
        return filteredPositions;
      }
    } catch (error) {
      logger.error(`Failed to get positions: ${error.message}`);
      // Return empty array instead of throwing to prevent cascading failures
      return [];
    }
  }

  /**
   * Get account balance information with improved error handling
   * @returns {Promise<Object>} Account balance
   */
  async getAccountBalance() {
    try {
      const response = await this.request('GET', '/api/mix/v1/account/accounts?productType=UMCBL');
      
      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Invalid account balance data received');
      }
      
      return response.data;
    } catch (error) {
      logger.error(`Failed to get account balance: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get trade history, optionally filtered by our approved coin list
   * With improved error handling and pagination
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
      
      if (!response.data || !Array.isArray(response.data)) {
        throw new Error('Invalid trade history data received');
      }
      
      if (!filterByApprovedList) {
        return response.data;
      }
      
      // Get filtered symbols
      const { filteredSymbols } = await this.getFilteredTradingPairs();
      
      if (!filteredSymbols || filteredSymbols.length === 0) {
        // If no filtered symbols, return all trade history
        return response.data;
      }
      
      // Filter trade history to only include approved pairs
      const filteredHistory = response.data.filter(trade => {
        if (!trade || !trade.symbol) return false;
        const baseSymbol = trade.symbol.split('_')[0];
        return filteredSymbols.includes(baseSymbol);
      });
      
      return filteredHistory;
    } catch (error) {
      logger.error(`Failed to get trade history: ${error.message}`);
      // Return empty array instead of throwing to prevent cascading failures
      return [];
    }
  }

  /**
   * Get the list of approved trading symbols
   * @returns {Promise<Array>} List of approved symbols
   */
  async getApprovedSymbols() {
    try {
      const { filteredSymbols } = await this.getFilteredTradingPairs();
      return filteredSymbols || [];
    } catch (error) {
      logger.error(`Failed to get approved symbols: ${error.message}`);
      return [];
    }
  }
  
  /**
   * Initialize the service and prefetch data
   * @returns {Promise<boolean>} Success status
   */
  async initialize() {
    try {
      logger.info('Initializing Bitget service...');
      
      // Pre-fetch filtered trading pairs
      const { filteredSymbols } = await this.getFilteredTradingPairs();
      
      if (!filteredSymbols || filteredSymbols.length === 0) {
        logger.warn('No filtered trading pairs found during initialization');
      } else {
        logger.info(`Successfully initialized with ${filteredSymbols.length} trading pairs`);
      }
      
      return true;
    } catch (error) {
      logger.error(`Failed to initialize Bitget service: ${error.message}`);
      return false;
    }
  }
}

module.exports = new BitgetService();