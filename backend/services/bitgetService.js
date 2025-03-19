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
   * Get market data for all available USDT trading pairs
   * @returns {Promise<Array>} List of market data
   */
  async getMarketData() {
    try {
      const response = await this.request('GET', '/api/mix/v1/market/tickers?productType=USDT-FUTURES');
      return response.data;
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
   * Get account position information
   * @param {string} symbol Trading symbol
   * @returns {Promise<Array>} Position information
   */
  async getPositions(symbol = '') {
    try {
      const endpoint = symbol 
        ? `/api/mix/v1/position/singlePosition?symbol=${symbol}_UMCBL`
        : '/api/mix/v1/position/allPosition?productType=USDT-FUTURES';
      
      const response = await this.request('GET', endpoint);
      return response.data;
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
      const response = await this.request('GET', '/api/mix/v1/account/accounts?productType=USDT-FUTURES');
      return response.data;
    } catch (error) {
      logger.error(`Failed to get account balance: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get trade history
   * @param {number} limit Max number of records
   * @param {number} startTime Start time in milliseconds
   * @param {number} endTime End time in milliseconds
   * @returns {Promise<Array>} Trade history
   */
  async getTradeHistory(limit = 100, startTime = null, endTime = null) {
    try {
      let endpoint = `/api/mix/v1/order/history?productType=USDT-FUTURES&limit=${limit}`;
      
      if (startTime) {
        endpoint += `&startTime=${startTime}`;
      }
      
      if (endTime) {
        endpoint += `&endTime=${endTime}`;
      }
      
      const response = await this.request('GET', endpoint);
      return response.data;
    } catch (error) {
      logger.error(`Failed to get trade history: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new BitgetService();