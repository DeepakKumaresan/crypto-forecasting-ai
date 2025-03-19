/**
 * Technical Indicators Utility
 * Provides advanced technical analysis functions for crypto trading signals
 * Works with real-time market data from WebSockets
 */

// Technical analysis library
const technicalIndicators = require('technicalindicators');

// Configure technical indicators
technicalIndicators.setConfig('precision', 8);

// Logger
const logger = require('./logger');

/**
 * Calculate RSI (Relative Strength Index)
 * @param {Array} prices - Array of closing prices
 * @param {Number} period - Period for RSI calculation (default: 14)
 * @returns {Number} RSI value (0-100)
 */
const calculateRSI = (prices, period = 14) => {
  try {
    if (prices.length < period + 1) {
      return null;
    }
    
    const rsi = technicalIndicators.RSI.calculate({
      values: prices,
      period: period
    });
    
    return rsi[rsi.length - 1];
  } catch (error) {
    logger.error(`RSI calculation error: ${error.message}`);
    return null;
  }
};

/**
 * Calculate MACD (Moving Average Convergence Divergence)
 * @param {Array} prices - Array of closing prices
 * @param {Number} fastPeriod - Fast period (default: 12)
 * @param {Number} slowPeriod - Slow period (default: 26)
 * @param {Number} signalPeriod - Signal period (default: 9)
 * @returns {Object} MACD values {MACD, signal, histogram}
 */
const calculateMACD = (prices, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) => {
  try {
    if (prices.length < slowPeriod + signalPeriod) {
      return null;
    }
    
    const macdValues = technicalIndicators.MACD.calculate({
      values: prices,
      fastPeriod,
      slowPeriod,
      signalPeriod,
      SimpleMAOscillator: false,
      SimpleMASignal: false
    });
    
    return macdValues[macdValues.length - 1];
  } catch (error) {
    logger.error(`MACD calculation error: ${error.message}`);
    return null;
  }
};

/**
 * Calculate Bollinger Bands
 * @param {Array} prices - Array of closing prices
 * @param {Number} period - Period for calculation (default: 20)
 * @param {Number} stdDev - Standard deviation multiplier (default: 2)
 * @returns {Object} Bollinger Bands values {upper, middle, lower}
 */
const calculateBollingerBands = (prices, period = 20, stdDev = 2) => {
  try {
    if (prices.length < period) {
      return null;
    }
    
    const bb = technicalIndicators.BollingerBands.calculate({
      values: prices,
      period,
      stdDev
    });
    
    return bb[bb.length - 1];
  } catch (error) {
    logger.error(`Bollinger Bands calculation error: ${error.message}`);
    return null;
  }
};

/**
 * Calculate Stochastic Oscillator
 * @param {Object} data - OHLC data {high, low, close}
 * @param {Number} period - Period for calculation (default: 14)
 * @param {Number} signalPeriod - Signal period (default: 3)
 * @returns {Object} Stochastic values {k, d}
 */
const calculateStochastic = (data, period = 14, signalPeriod = 3) => {
  try {
    if (data.close.length < period + signalPeriod) {
      return null;
    }
    
    const stoch = technicalIndicators.Stochastic.calculate({
      high: data.high,
      low: data.low,
      close: data.close,
      period,
      signalPeriod
    });
    
    return stoch[stoch.length - 1];
  } catch (error) {
    logger.error(`Stochastic calculation error: ${error.message}`);
    return null;
  }
};

/**
 * Calculate Exponential Moving Average (EMA)
 * @param {Array} prices - Array of closing prices
 * @param {Number} period - Period for calculation
 * @returns {Number} EMA value
 */
const calculateEMA = (prices, period) => {
  try {
    if (prices.length < period) {
      return null;
    }
    
    const ema = technicalIndicators.EMA.calculate({
      values: prices,
      period
    });
    
    return ema[ema.length - 1];
  } catch (error) {
    logger.error(`EMA calculation error: ${error.message}`);
    return null;
  }
};

/**
 * Calculate Average True Range (ATR) - important for stop loss calculation
 * @param {Object} data - OHLC data {high, low, close}
 * @param {Number} period - Period for calculation (default: 14)
 * @returns {Number} ATR value
 */
const calculateATR = (data, period = 14) => {
  try {
    if (data.close.length < period + 1) {
      return null;
    }
    
    const atr = technicalIndicators.ATR.calculate({
      high: data.high,
      low: data.low,
      close: data.close,
      period
    });
    
    return atr[atr.length - 1];
  } catch (error) {
    logger.error(`ATR calculation error: ${error.message}`);
    return null;
  }
};

/**
 * Calculate Ichimoku Cloud
 * @param {Object} data - OHLC data {high, low}
 * @returns {Object} Ichimoku values
 */
const calculateIchimoku = (data) => {
  try {
    const ichimoku = technicalIndicators.IchimokuCloud.calculate({
      high: data.high,
      low: data.low,
      conversionPeriod: 9,
      basePeriod: 26,
      spanPeriod: 52,
      displacement: 26
    });
    
    return ichimoku[ichimoku.length - 1];
  } catch (error) {
    logger.error(`Ichimoku calculation error: ${error.message}`);
    return null;
  }
};

/**
 * Advanced AI-Enhanced Signal Generator
 * Combines multiple indicators with AI weights for more accurate signals
 * @param {Object} candles - OHLC candle data
 * @param {Object} weights - AI-determined weights for indicators
 * @returns {Object} Trading signal with confidence score and parameters
 */
const generateAIEnhancedSignal = (candles, weights = defaultWeights) => {
  try {
    // Extract price data
    const prices = {
      close: candles.map(c => c.close),
      high: candles.map(c => c.high),
      low: candles.map(c => c.low),
      open: candles.map(c => c.open),
      volume: candles.map(c => c.volume)
    };
    
    // Calculate individual indicators
    const rsi = calculateRSI(prices.close);
    const macd = calculateMACD(prices.close);
    const bb = calculateBollingerBands(prices.close);
    const stoch = calculateStochastic(prices);
    const ema200 = calculateEMA(prices.close, 200);
    const ema50 = calculateEMA(prices.close, 50);
    const atr = calculateATR(prices);
    
    // Skip if missing data
    if (!rsi || !macd || !bb || !stoch || !ema200 || !ema50 || !atr) {
      return null;
    }
    
    // Current price
    const currentPrice = prices.close[prices.close.length - 1];
    
    // Signal components with weighted scores
    let bullishScore = 0;
    let bearishScore = 0;
    
    // RSI analysis (oversold/overbought)
    if (rsi < 30) bullishScore += weights.rsi;
    if (rsi > 70) bearishScore += weights.rsi;
    
    // MACD analysis (crossover and histogram)
    if (macd.MACD > macd.signal) bullishScore += weights.macd;
    if (macd.MACD < macd.signal) bearishScore += weights.macd;
    
    // Bollinger Bands analysis
    if (currentPrice < bb.lower) bullishScore += weights.bollingerBands;
    if (currentPrice > bb.upper) bearishScore += weights.bollingerBands;
    
    // Stochastic analysis
    if (stoch.k < 20 && stoch.k > stoch.d) bullishScore += weights.stochastic;
    if (stoch.k > 80 && stoch.k < stoch.d) bearishScore += weights.stochastic;
    
    // Moving Average analysis
    if (ema50 > ema200) bullishScore += weights.ema;
    if (ema50 < ema200) bearishScore += weights.ema;
    
    // Determine signal type
    let signalType = null;
    let confidence = 0;
    
    // Calculate net score and confidence
    const netScore = bullishScore - bearishScore;
    
    if (netScore > 0.5) {
      signalType = 'LONG';
      confidence = Math.min(netScore, 1) * 100;
    } else if (netScore < -0.5) {
      signalType = 'SHORT';
      confidence = Math.min(Math.abs(netScore), 1) * 100;
    }
    
    // Calculate stop loss and take profit based on ATR
    let stopLoss = null;
    let takeProfit = null;
    
    if (signalType === 'LONG') {
      stopLoss = currentPrice - (atr * 2);
      takeProfit = currentPrice + (atr * 4); // 2:1 risk-reward
    } else if (signalType === 'SHORT') {
      stopLoss = currentPrice + (atr * 2);
      takeProfit = currentPrice - (atr * 4); // 2:1 risk-reward
    }
    
    // Return complete signal if confidence meets threshold
    if (confidence >= 75) {
      return {
        type: signalType,
        price: currentPrice,
        stopLoss: parseFloat(stopLoss.toFixed(8)),
        takeProfit: parseFloat(takeProfit.toFixed(8)),
        confidence: parseFloat(confidence.toFixed(2)),
        indicators: {
          rsi,
          macd: { macd: macd.MACD, signal: macd.signal, histogram: macd.histogram },
          bollingerBands: { upper: bb.upper, middle: bb.middle, lower: bb.lower },
          stochastic: { k: stoch.k, d: stoch.d },
          ema: { ema50, ema200 },
          atr
        },
        timestamp: new Date().toISOString()
      };
    }
    
    return null; // No signal with sufficient confidence
    
  } catch (error) {
    logger.error(`AI Enhanced Signal generation error: ${error.message}`);
    return null;
  }
};

/**
 * AI-Optimized Dynamic Stop Loss and Take Profit Calculator
 * Adjusts SL and TP based on market volatility, trend strength, and support/resistance levels
 * @param {String} signalType - 'LONG' or 'SHORT'
 * @param {Number} entryPrice - Entry price for the trade
 * @param {Object} candles - OHLC candle data
 * @returns {Object} Optimized stop loss and take profit levels
 */
const calculateOptimizedRiskParameters = (signalType, entryPrice, candles) => {
  try {
    // Extract price data
    const prices = {
      close: candles.map(c => c.close),
      high: candles.map(c => c.high),
      low: candles.map(c => c.low)
    };
    
    // Calculate ATR for volatility measurement
    const atr = calculateATR(prices);
    
    // Calculate recent support/resistance levels
    const recentHighs = prices.high.slice(-20);
    const recentLows = prices.low.slice(-20);
    
    // Find nearest support (for longs) or resistance (for shorts)
    let nearestSupport = Math.min(...recentLows);
    let nearestResistance = Math.max(...recentHighs);
    
    // Base risk percentage on recent volatility
    // More volatile = wider stops
    const volatilityFactor = Math.min(Math.max(atr / entryPrice, 0.005), 0.03);
    
    let stopLoss, takeProfit;
    
    if (signalType === 'LONG') {
      // For long positions
      // Stop loss is below entry price, but above nearest support if possible
      const idealStopDistance = entryPrice * volatilityFactor;
      const supportBasedStop = Math.max(nearestSupport * 0.998, entryPrice - (idealStopDistance * 1.5));
      
      stopLoss = Math.max(entryPrice - idealStopDistance, supportBasedStop);
      
      // Take profit aims for 2-3x risk-reward ratio, adjusted for nearest resistance
      const riskAmount = entryPrice - stopLoss;
      takeProfit = entryPrice + (riskAmount * 2.5);
      
      // Cap take profit at or slightly above resistance
      if (takeProfit > nearestResistance) {
        takeProfit = nearestResistance * 1.01;
      }
      
    } else if (signalType === 'SHORT') {
      // For short positions
      // Stop loss is above entry price, but below nearest resistance if possible
      const idealStopDistance = entryPrice * volatilityFactor;
      const resistanceBasedStop = Math.min(nearestResistance * 1.002, entryPrice + (idealStopDistance * 1.5));
      
      stopLoss = Math.min(entryPrice + idealStopDistance, resistanceBasedStop);
      
      // Take profit aims for 2-3x risk-reward ratio, adjusted for nearest support
      const riskAmount = stopLoss - entryPrice;
      takeProfit = entryPrice - (riskAmount * 2.5);
      
      // Cap take profit at or slightly below support
      if (takeProfit < nearestSupport) {
        takeProfit = nearestSupport * 0.99;
      }
    }
    
    return {
      stopLoss: parseFloat(stopLoss.toFixed(8)),
      takeProfit: parseFloat(takeProfit.toFixed(8)),
      riskRewardRatio: parseFloat((Math.abs(takeProfit - entryPrice) / Math.abs(stopLoss - entryPrice)).toFixed(2))
    };
    
  } catch (error) {
    logger.error(`Optimized risk parameters calculation error: ${error.message}`);
    // Fallback to basic calculation
    const stopPercentage = 0.015; // 1.5%
    const tpPercentage = 0.038;   // 3.8%
    
    if (signalType === 'LONG') {
      return {
        stopLoss: parseFloat((entryPrice * (1 - stopPercentage)).toFixed(8)),
        takeProfit: parseFloat((entryPrice * (1 + tpPercentage)).toFixed(8)),
        riskRewardRatio: parseFloat((tpPercentage / stopPercentage).toFixed(2))
      };
    } else {
      return {
        stopLoss: parseFloat((entryPrice * (1 + stopPercentage)).toFixed(8)),
        takeProfit: parseFloat((entryPrice * (1 - tpPercentage)).toFixed(8)),
        riskRewardRatio: parseFloat((tpPercentage / stopPercentage).toFixed(2))
      };
    }
  }
};

/**
 * Checks for duplicate signals in the recent history
 * @param {Object} newSignal - The new trading signal
 * @param {Array} recentSignals - Array of recent signals
 * @param {String} timeframe - Trading timeframe
 * @returns {Boolean} True if signal is unique, false if duplicate
 */
const isUniqueSignal = (newSignal, recentSignals, timeframe) => {
  // Filter signals from the same timeframe
  const sameTimeframeSignals = recentSignals.filter(s => s.timeframe === timeframe);
  
  // If no signals in this timeframe, it's unique
  if (sameTimeframeSignals.length === 0) {
    return true;
  }
  
  // Look for any same-direction signals in the recent window
  const sameSideSignals = sameTimeframeSignals.filter(s => s.type === newSignal.type);
  
  // If no same-side signals, it's unique
  if (sameSideSignals.length === 0) {
    return true;
  }
  
  // Check the timestamp of the most recent same-side signal
  const mostRecentSignal = sameSideSignals.reduce((latest, signal) => {
    return new Date(signal.timestamp) > new Date(latest.timestamp) ? signal : latest;
  }, sameSideSignals[0]);
  
  // Calculate time difference in minutes
  const timeDiffMinutes = (new Date(newSignal.timestamp) - new Date(mostRecentSignal.timestamp)) / (1000 * 60);
  
  // Time window depends on timeframe (e.g., for 15m candles, allow one signal per hour)
  const timeWindows = {
    '1m': 5,
    '5m': 15,
    '15m': 60,
    '1h': 240,
    '4h': 720,
    '1d': 1440 * 2
  };
  
  const minWindow = timeWindows[timeframe] || 60;
  
  // Signal is unique if it's outside the time window
  return timeDiffMinutes > minWindow;
};

// Default weights for indicators (can be adjusted by AI model)
const defaultWeights = {
  rsi: 0.2,
  macd: 0.2,
  bollingerBands: 0.15,
  stochastic: 0.15,
  ema: 0.15,
  volume: 0.15
};

module.exports = {
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateStochastic,
  calculateEMA,
  calculateATR,
  calculateIchimoku,
  generateAIEnhancedSignal,
  calculateOptimizedRiskParameters,
  isUniqueSignal
};