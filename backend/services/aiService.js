// backend/services/aiService.js
const axios = require('axios');
const logger = require('../utils/logger');

class AIService {
  constructor() {
    this.apiUrl = process.env.ML_API_URL || 'http://localhost:8000';
    this.isReady = false;
    this.healthCheckInterval = null;
    this.initHealthCheck();
  }

  initHealthCheck() {
    // Check if AI service is available and ready
    this.checkHealth()
      .then(isHealthy => {
        this.isReady = isHealthy;
        logger.info(`AI Service initial health check: ${isHealthy ? 'READY' : 'NOT READY'}`);
        
        // Set up periodic health checks
        this.healthCheckInterval = setInterval(() => {
          this.checkHealth()
            .then(isHealthy => {
              // Only log if status changes
              if (this.isReady !== isHealthy) {
                logger.info(`AI Service health status changed: ${isHealthy ? 'UP' : 'DOWN'}`);
              }
              this.isReady = isHealthy;
            })
            .catch(err => {
              logger.error('AI Service health check failed:', err.message);
              this.isReady = false;
            });
        }, 60000); // Check every minute
      })
      .catch(err => {
        logger.error('Initial AI service health check failed:', err.message);
        this.isReady = false;
        
        // Try again after 30 seconds
        setTimeout(() => this.initHealthCheck(), 30000);
      });
  }

  async checkHealth() {
    try {
      const response = await axios.get(`${this.apiUrl}/health`, { timeout: 5000 });
      return response.status === 200;
    } catch (error) {
      logger.error('AI Service health check error:', error.message);
      return false;
    }
  }

  async predictTrade(marketData) {
    if (!this.isReady) {
      logger.warn('AI Service is not ready. Cannot make predictions.');
      throw new Error('AI Service is currently unavailable');
    }

    try {
      const response = await axios.post(`${this.apiUrl}/predict`, marketData, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.ML_API_KEY
        },
        timeout: 10000 // 10-second timeout
      });

      return response.data;
    } catch (error) {
      logger.error('AI prediction error:', error.message);
      throw new Error(`Failed to get AI prediction: ${error.message}`);
    }
  }

  async optimizeStopLossTakeProfit(symbol, entryPrice, direction, marketData) {
    if (!this.isReady) {
      logger.warn('AI Service is not ready. Cannot optimize SL/TP.');
      throw new Error('AI Service is currently unavailable');
    }

    try {
      const payload = {
        symbol,
        entryPrice,
        direction, // 'long' or 'short'
        marketData
      };

      const response = await axios.post(`${this.apiUrl}/optimize-sl-tp`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.ML_API_KEY
        },
        timeout: 5000
      });

      return response.data;
    } catch (error) {
      logger.error('SL/TP optimization error:', error.message);
      
      // Fallback to default values
      const defaultPercentage = direction === 'long' ? 
        { stopLoss: entryPrice * 0.98, takeProfit: entryPrice * 1.03 } : 
        { stopLoss: entryPrice * 1.02, takeProfit: entryPrice * 0.97 };
      
      logger.info('Using default SL/TP values due to optimization failure');
      return defaultPercentage;
    }
  }

  async filterTradeSignal(signal, historicalData) {
    if (!this.isReady) {
      logger.warn('AI Service is not ready. Cannot filter trade signal.');
      return { valid: false, confidence: 0, reason: 'AI service unavailable' };
    }

    try {
      const payload = {
        signal,
        historicalData
      };

      const response = await axios.post(`${this.apiUrl}/filter-signal`, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': process.env.ML_API_KEY
        },
        timeout: 5000
      });

      return response.data;
    } catch (error) {
      logger.error('Signal filtering error:', error.message);
      // Default to invalid signal on error
      return { valid: false, confidence: 0, reason: 'Error in signal filtering' };
    }
  }

  // Cleanup method to clear interval
  close() {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
  }
}

// Singleton instance
const aiService = new AIService();

module.exports = aiService;