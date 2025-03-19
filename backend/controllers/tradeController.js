const tradingService = require('../services/tradingService');
const { logger } = require('../utils/logger');

/**
 * Trade controller to handle API requests related to trading operations
 */
exports.getTradeSignals = async (req, res) => {
  try {
    const { timeframe = '15m' } = req.query;
    const signals = await tradingService.getTradeSignals(timeframe);
    
    logger.info(`Retrieved ${signals.length} trade signals for ${timeframe} timeframe`);
    return res.status(200).json({ success: true, data: signals });
  } catch (error) {
    logger.error(`Error retrieving trade signals: ${error.message}`, { error });
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to retrieve trade signals',
      error: error.message
    });
  }
};

exports.executeTrade = async (req, res) => {
  try {
    const { symbol, side, quantity, price, stopLoss, takeProfit } = req.body;
    
    if (!symbol || !side || !quantity) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required trade parameters'
      });
    }
    
    const tradeResult = await tradingService.executeTrade(symbol, side, quantity, price, stopLoss, takeProfit);
    
    logger.info(`Trade executed: ${side} ${quantity} ${symbol} at ${price}`);
    return res.status(200).json({ success: true, data: tradeResult });
  } catch (error) {
    logger.error(`Error executing trade: ${error.message}`, { error });
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to execute trade',
      error: error.message
    });
  }
};

exports.getTradingStatus = async (req, res) => {
  try {
    const status = await tradingService.getTradingStatus();
    return res.status(200).json({ success: true, data: status });
  } catch (error) {
    logger.error(`Error getting trading status: ${error.message}`, { error });
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to get trading status',
      error: error.message
    });
  }
};

exports.toggleAutoTrading = async (req, res) => {
  try {
    const { enabled } = req.body;
    
    if (typeof enabled !== 'boolean') {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid parameter: enabled must be a boolean'
      });
    }
    
    const status = await tradingService.toggleAutoTrading(enabled);
    
    logger.info(`Auto-trading ${enabled ? 'enabled' : 'disabled'}`);
    return res.status(200).json({ success: true, data: status });
  } catch (error) {
    logger.error(`Error toggling auto-trading: ${error.message}`, { error });
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to toggle auto-trading',
      error: error.message
    });
  }
};

exports.getTradeHistory = async (req, res) => {
  try {
    const { limit = 20, page = 1 } = req.query;
    const history = await tradingService.getTradeHistory(parseInt(limit), parseInt(page));
    
    return res.status(200).json({ 
      success: true, 
      data: history.trades,
      pagination: history.pagination
    });
  } catch (error) {
    logger.error(`Error retrieving trade history: ${error.message}`, { error });
    return res.status(500).json({ 
      success: false, 
      message: 'Failed to retrieve trade history',
      error: error.message
    });
  }
};