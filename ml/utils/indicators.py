"""
Adaptive Technical Indicators Module for Cryptocurrency Trading
This module implements adaptive technical indicators that automatically adjust
to current market trends and provide high-accuracy trading signals.
"""

import numpy as np
import pandas as pd
from sklearn.preprocessing import StandardScaler
from scipy.signal import find_peaks
import talib


class AdaptiveIndicators:
    """
    Class for handling adaptive technical indicators that automatically
    adjust parameters based on current market volatility and trends.
    """
    
    def __init__(self, volatility_window=14, trend_window=50):
        """
        Initialize the adaptive indicators with default parameters.
        
        Args:
            volatility_window (int): Window size for volatility calculation
            trend_window (int): Window size for trend determination
        """
        self.volatility_window = volatility_window
        self.trend_window = trend_window
        self.scaler = StandardScaler()
        
    def calculate_market_volatility(self, prices):
        """
        Calculate current market volatility using ATR-based approach.
        
        Args:
            prices (pd.DataFrame): DataFrame with OHLC price data
            
        Returns:
            float: Normalized volatility score between 0 and 1
        """
        # Calculate True Range
        high = prices['high'].values
        low = prices['low'].values
        close = np.array(prices['close'].values)
        
        prev_close = np.roll(close, 1)
        prev_close[0] = close[0]
        
        # True Range calculation
        tr1 = high - low
        tr2 = np.abs(high - prev_close)
        tr3 = np.abs(low - prev_close)
        
        tr = np.maximum(np.maximum(tr1, tr2), tr3)
        
        # Average True Range
        atr = np.mean(tr[-self.volatility_window:])
        
        # Normalize volatility to 0-1 range
        norm_atr = min(atr / (np.mean(close[-self.volatility_window:]) * 0.1), 1.0)
        
        return norm_atr
    
    def detect_market_trend(self, prices):
        """
        Detect the current market trend using EMA crossovers and momentum.
        
        Args:
            prices (pd.DataFrame): DataFrame with OHLC price data
            
        Returns:
            int: 1 for uptrend, -1 for downtrend, 0 for sideways
        """
        if len(prices) < self.trend_window:
            return 0  # Not enough data
            
        close = prices['close'].values
        
        # Calculate EMAs
        ema_short = talib.EMA(close, timeperiod=self.trend_window//4)
        ema_long = talib.EMA(close, timeperiod=self.trend_window)
        
        # Calculate momentum
        momentum = talib.MOM(close, timeperiod=self.trend_window//2)
        
        # Recent values
        recent_mom = momentum[-5:]
        recent_ema_diff = ema_short[-5:] - ema_long[-5:]
        
        # Determine trend
        if np.all(recent_ema_diff > 0) and np.all(recent_mom > 0):
            return 1  # Strong uptrend
        elif np.all(recent_ema_diff < 0) and np.all(recent_mom < 0):
            return -1  # Strong downtrend
        elif np.mean(recent_ema_diff) > 0 and np.mean(recent_mom) > 0:
            return 0.5  # Moderate uptrend
        elif np.mean(recent_ema_diff) < 0 and np.mean(recent_mom) < 0:
            return -0.5  # Moderate downtrend
        else:
            return 0  # Sideways or unclear
    
    def adaptive_rsi(self, prices, base_period=14):
        """
        Adaptive RSI that adjusts period based on market conditions.
        
        Args:
            prices (pd.DataFrame): DataFrame with OHLC price data
            base_period (int): Base period for RSI calculation
            
        Returns:
            np.array: Adaptive RSI values
        """
        volatility = self.calculate_market_volatility(prices)
        trend = self.detect_market_trend(prices)
        
        # Adjust period based on market conditions
        if abs(trend) > 0.7:  # Strong trend
            # Shorten period in strong trends to be more responsive
            period = max(int(base_period * 0.7), 5)
        elif volatility > 0.7:  # High volatility
            # Lengthen period in high volatility to filter noise
            period = min(int(base_period * 1.5), 30)
        else:
            period = base_period
            
        close = prices['close'].values
        rsi = talib.RSI(close, timeperiod=period)
        
        return rsi
    
    def adaptive_macd(self, prices, base_fast=12, base_slow=26, base_signal=9):
        """
        Adaptive MACD that adjusts periods based on market conditions.
        
        Args:
            prices (pd.DataFrame): DataFrame with OHLC price data
            base_fast (int): Base fast period
            base_slow (int): Base slow period
            base_signal (int): Base signal period
            
        Returns:
            tuple: (MACD line, Signal line, Histogram)
        """
        volatility = self.calculate_market_volatility(prices)
        trend = self.detect_market_trend(prices)
        
        # Adjust periods based on market conditions
        if abs(trend) > 0.7:  # Strong trend
            # More responsive in strong trends
            fast_period = max(int(base_fast * 0.8), 8)
            slow_period = max(int(base_slow * 0.8), 20)
            signal_period = max(int(base_signal * 0.8), 7)
        elif volatility > 0.7:  # High volatility
            # Filter noise in high volatility
            fast_period = min(int(base_fast * 1.3), 18)
            slow_period = min(int(base_slow * 1.3), 40)
            signal_period = min(int(base_signal * 1.3), 14)
        else:
            fast_period = base_fast
            slow_period = base_slow
            signal_period = base_signal
            
        close = prices['close'].values
        macd, signal, hist = talib.MACD(
            close, 
            fastperiod=fast_period, 
            slowperiod=slow_period, 
            signalperiod=signal_period
        )
        
        return macd, signal, hist
    
    def adaptive_bollinger_bands(self, prices, base_period=20, base_dev=2.0):
        """
        Adaptive Bollinger Bands that adjust based on market conditions.
        
        Args:
            prices (pd.DataFrame): DataFrame with OHLC price data
            base_period (int): Base period for BB calculation
            base_dev (float): Base standard deviation multiplier
            
        Returns:
            tuple: (Upper band, Middle band, Lower band)
        """
        volatility = self.calculate_market_volatility(prices)
        
        # Adjust parameters based on volatility
        if volatility > 0.7:  # High volatility
            # Widen bands in high volatility
            period = max(int(base_period * 0.8), 14)
            dev = min(base_dev * 1.3, 3.0)
        elif volatility < 0.3:  # Low volatility
            # Tighten bands in low volatility
            period = min(int(base_period * 1.2), 30)
            dev = max(base_dev * 0.8, 1.5)
        else:
            period = base_period
            dev = base_dev
            
        close = prices['close'].values
        upper, middle, lower = talib.BBANDS(
            close,
            timeperiod=period,
            nbdevup=dev,
            nbdevdn=dev,
            matype=0
        )
        
        return upper, middle, lower
    
    def adaptive_stochastic(self, prices, base_k_period=14, base_d_period=3):
        """
        Adaptive Stochastic Oscillator that adjusts based on market conditions.
        
        Args:
            prices (pd.DataFrame): DataFrame with OHLC price data
            base_k_period (int): Base %K period
            base_d_period (int): Base %D period
            
        Returns:
            tuple: (Slow %K, %D)
        """
        trend = self.detect_market_trend(prices)
        
        # Adjust periods based on trend strength
        if abs(trend) > 0.7:  # Strong trend
            # More responsive in strong trends
            k_period = max(int(base_k_period * 0.8), 10)
            d_period = max(int(base_d_period * 0.8), 2)
        else:
            k_period = base_k_period
            d_period = base_d_period
            
        high = prices['high'].values
        low = prices['low'].values
        close = prices['close'].values
        
        slowk, slowd = talib.STOCH(
            high,
            low,
            close,
            fastk_period=k_period,
            slowk_period=3,
            slowk_matype=0,
            slowd_period=d_period,
            slowd_matype=0
        )
        
        return slowk, slowd
    
    def adaptive_support_resistance(self, prices, sensitivity=0.5):
        """
        Find adaptive support and resistance levels based on market structure.
        
        Args:
            prices (pd.DataFrame): DataFrame with OHLC price data
            sensitivity (float): Sensitivity for peak detection (0-1)
            
        Returns:
            tuple: (support_levels, resistance_levels)
        """
        if len(prices) < 30:
            return [], []
            
        close = prices['close'].values
        high = prices['high'].values
        low = prices['low'].values
        
        volatility = self.calculate_market_volatility(prices)
        
        # Adjust sensitivity based on volatility
        distance = int(max(5, 20 * (1 - sensitivity) * (1 + volatility)))
        prominence = np.std(close[-30:]) * (0.2 + sensitivity * 0.6)
        
        # Find peaks for resistance
        peaks, _ = find_peaks(high, distance=distance, prominence=prominence)
        resistance_levels = high[peaks]
        
        # Find troughs for support (invert low prices)
        troughs, _ = find_peaks(-low, distance=distance, prominence=prominence)
        support_levels = low[troughs]
        
        # Filter levels to recent and significant ones
        recent_window = min(100, len(close) // 2)
        recent_high = np.max(high[-recent_window:])
        recent_low = np.min(low[-recent_window:])
        
        # Filter resistance levels
        filtered_resistance = [
            level for level in resistance_levels 
            if level >= recent_low and level <= recent_high * 1.1
        ]
        
        # Filter support levels
        filtered_support = [
            level for level in support_levels 
            if level >= recent_low * 0.9 and level <= recent_high
        ]
        
        return filtered_support, filtered_resistance
    
    def get_trade_signal(self, prices):
        """
        Generate trading signals by combining multiple adaptive indicators.
        
        Args:
            prices (pd.DataFrame): DataFrame with OHLC price data
            
        Returns:
            dict: Dictionary with signal information
        """
        if len(prices) < 50:
            return {"signal": "neutral", "confidence": 0, "reason": "Insufficient data"}
        
        # Calculate indicators
        rsi = self.adaptive_rsi(prices)
        macd, signal, hist = self.adaptive_macd(prices)
        upper, middle, lower = self.adaptive_bollinger_bands(prices)
        slowk, slowd = self.adaptive_stochastic(prices)
        trend = self.detect_market_trend(prices)
        volatility = self.calculate_market_volatility(prices)
        
        close = prices['close'].values
        current_price = close[-1]
        
        # Initialize voting system
        long_votes = 0
        short_votes = 0
        max_votes = 5  # Total number of indicators
        
        # RSI signals
        if rsi[-1] < 30:
            long_votes += 1
            rsi_signal = "bullish"
        elif rsi[-1] > 70:
            short_votes += 1
            rsi_signal = "bearish"
        else:
            rsi_signal = "neutral"
            
        # MACD signals
        if hist[-1] > 0 and hist[-1] > hist[-2]:
            long_votes += 1
            macd_signal = "bullish"
        elif hist[-1] < 0 and hist[-1] < hist[-2]:
            short_votes += 1
            macd_signal = "bearish"
        else:
            macd_signal = "neutral"
            
        # Bollinger Bands signals
        if close[-1] < lower[-1]:
            long_votes += 1
            bb_signal = "bullish"
        elif close[-1] > upper[-1]:
            short_votes += 1
            bb_signal = "bearish"
        else:
            bb_signal = "neutral"
            
        # Stochastic signals
        if slowk[-1] < 20 and slowd[-1] < 20 and slowk[-1] > slowd[-1]:
            long_votes += 1
            stoch_signal = "bullish"
        elif slowk[-1] > 80 and slowd[-1] > 80 and slowk[-1] < slowd[-1]:
            short_votes += 1
            stoch_signal = "bearish"
        else:
            stoch_signal = "neutral"
            
        # Trend signals
        if trend > 0.5:
            long_votes += 1
            trend_signal = "bullish"
        elif trend < -0.5:
            short_votes += 1
            trend_signal = "bearish"
        else:
            trend_signal = "neutral"
            
        # Calculate confidence based on voting and trend strength
        long_confidence = (long_votes / max_votes) * (1 + abs(trend) * 0.5 if trend > 0 else 1)
        short_confidence = (short_votes / max_votes) * (1 + abs(trend) * 0.5 if trend < 0 else 1)
        
        # Generate final signal
        if long_confidence > 0.6 and long_confidence > short_confidence:
            signal = "long"
            confidence = long_confidence
            reason = f"Strong bullish signals: RSI={rsi_signal}, MACD={macd_signal}, BB={bb_signal}, Stoch={stoch_signal}, Trend={trend_signal}"
        elif short_confidence > 0.6 and short_confidence > long_confidence:
            signal = "short"
            confidence = short_confidence
            reason = f"Strong bearish signals: RSI={rsi_signal}, MACD={macd_signal}, BB={bb_signal}, Stoch={stoch_signal}, Trend={trend_signal}"
        else:
            signal = "neutral"
            confidence = max(long_confidence, short_confidence)
            reason = "Mixed signals, no clear direction"
            
        # Calculate optimal stop loss and take profit based on volatility and supports/resistances
        supports, resistances = self.adaptive_support_resistance(prices)
        
        if signal == "long":
            # For long positions
            volatility_factor = 2.5 + (volatility * 2)
            atr = talib.ATR(prices['high'].values, prices['low'].values, close, timeperiod=14)[-1]
            
            stop_loss = current_price - (atr * volatility_factor)
            # Find closest support for better stop loss
            if supports:
                supports_below = [s for s in supports if s < current_price]
                if supports_below:
                    stop_loss = max(stop_loss, max(supports_below) * 0.995)
            
            # Take profit based on risk-reward and resistance
            take_profit = current_price + ((current_price - stop_loss) * 2)
            # Find resistance for take profit
            if resistances:
                resistances_above = [r for r in resistances if r > current_price]
                if resistances_above:
                    take_profit = min(take_profit, min(resistances_above) * 0.995)
                    
        elif signal == "short":
            # For short positions
            volatility_factor = 2.5 + (volatility * 2)
            atr = talib.ATR(prices['high'].values, prices['low'].values, close, timeperiod=14)[-1]
            
            stop_loss = current_price + (atr * volatility_factor)
            # Find closest resistance for better stop loss
            if resistances:
                resistances_above = [r for r in resistances if r > current_price]
                if resistances_above:
                    stop_loss = min(stop_loss, min(resistances_above) * 1.005)
            
            # Take profit based on risk-reward and support
            take_profit = current_price - ((stop_loss - current_price) * 2)
            # Find support for take profit
            if supports:
                supports_below = [s for s in supports if s < current_price]
                if supports_below:
                    take_profit = max(take_profit, max(supports_below) * 1.005)
        else:
            stop_loss = None
            take_profit = None
        
        return {
            "signal": signal,
            "confidence": round(confidence, 2),
            "reason": reason,
            "stop_loss": round(stop_loss, 8) if stop_loss else None,
            "take_profit": round(take_profit, 8) if take_profit else None,
            "current_price": round(current_price, 8),
            "indicators": {
                "rsi": round(rsi[-1], 2) if not np.isnan(rsi[-1]) else None,
                "macd": round(hist[-1], 8) if not np.isnan(hist[-1]) else None,
                "bb_width": round((upper[-1] - lower[-1]) / middle[-1], 4) if not np.isnan(upper[-1]) else None,
                "stoch_k": round(slowk[-1], 2) if not np.isnan(slowk[-1]) else None,
                "stoch_d": round(slowd[-1], 2) if not np.isnan(slowd[-1]) else None,
                "trend": trend,
                "volatility": round(volatility, 2)
            }
        }


class SignalOptimizer:
    """
    Class for optimizing trade signals based on market conditions and ML predictions.
    """
    
    def __init__(self, min_confidence=0.7):
        """
        Initialize the signal optimizer.
        
        Args:
            min_confidence (float): Minimum confidence threshold for trades
        """
        self.min_confidence = min_confidence
        self.indicators = AdaptiveIndicators()
        
    def optimize_signals(self, prices, ml_prediction=None):
        """
        Optimize trading signals by combining technical indicators and ML predictions.
        
        Args:
            prices (pd.DataFrame): DataFrame with OHLC price data
            ml_prediction (dict, optional): ML model prediction data
            
        Returns:
            dict: Optimized trading signal
        """
        # Get base signal from indicators
        indicator_signal = self.indicators.get_trade_signal(prices)
        
        # If no ML prediction, return indicator signal with minimum confidence check
        if ml_prediction is None:
            if indicator_signal["confidence"] < self.min_confidence:
                return {
                    "signal": "neutral",
                    "confidence": indicator_signal["confidence"],
                    "reason": f"Confidence below threshold ({indicator_signal['confidence']:.2f} < {self.min_confidence})",
                    "stop_loss": None,
                    "take_profit": None,
                    "current_price": indicator_signal["current_price"]
                }
            return indicator_signal
            
        # Combine indicator and ML signals
        # Weight ML signal more heavily if confidence is high
        ml_weight = ml_prediction.get("confidence", 0.5)
        indicator_weight = 1 - (ml_weight * 0.5)  # ML can influence up to 50% of decision
        
        combined_confidence = 0
        combined_signal = "neutral"
        
        # Indicator signal confidence adjusted by weight
        adj_indicator_confidence = indicator_signal["confidence"] * indicator_weight
        
        # ML signal confidence adjusted by weight
        adj_ml_confidence = ml_prediction.get("confidence", 0) * ml_weight
        
        # Determine signal direction based on both sources
        if indicator_signal["signal"] == ml_prediction.get("signal", "neutral"):
            # Both signals agree - use the signal and combine confidences
            combined_signal = indicator_signal["signal"]
            combined_confidence = min(adj_indicator_confidence + adj_ml_confidence, 0.99)
            reason = f"Indicators and ML model agree on {combined_signal} signal"
        else:
            # Signals disagree - use the one with higher confidence
            if adj_indicator_confidence > adj_ml_confidence:
                combined_signal = indicator_signal["signal"]
                combined_confidence = adj_indicator_confidence - (adj_ml_confidence * 0.3)  # Penalize for disagreement
                reason = f"Indicators suggest {combined_signal} while ML suggests {ml_prediction.get('signal', 'neutral')}"
            else:
                combined_signal = ml_prediction.get("signal", "neutral")
                combined_confidence = adj_ml_confidence - (adj_indicator_confidence * 0.3)  # Penalize for disagreement
                reason = f"ML model suggests {combined_signal} while indicators suggest {indicator_signal['signal']}"
        
        # Check minimum confidence threshold
        if combined_confidence < self.min_confidence:
            return {
                "signal": "neutral",
                "confidence": combined_confidence,
                "reason": f"Combined confidence below threshold ({combined_confidence:.2f} < {self.min_confidence})",
                "stop_loss": None,
                "take_profit": None,
                "current_price": indicator_signal["current_price"]
            }
        
        # Use the stop loss and take profit from indicator signal as base
        stop_loss = indicator_signal["stop_loss"]
        take_profit = indicator_signal["take_profit"]
        
        # Adjust based on ML if available
        if ml_prediction.get("stop_loss") and ml_prediction.get("take_profit"):
            if combined_signal == "long":
                # For long: use the higher stop loss (less risk)
                stop_loss = max(stop_loss, ml_prediction["stop_loss"]) if stop_loss else ml_prediction["stop_loss"]
                # Use lower take profit (more conservative)
                take_profit = min(take_profit, ml_prediction["take_profit"]) if take_profit else ml_prediction["take_profit"]
            elif combined_signal == "short":
                # For short: use the lower stop loss (less risk)
                stop_loss = min(stop_loss, ml_prediction["stop_loss"]) if stop_loss else ml_prediction["stop_loss"]
                # Use higher take profit (more conservative)
                take_profit = max(take_profit, ml_prediction["take_profit"]) if take_profit else ml_prediction["take_profit"]
        
        return {
            "signal": combined_signal,
            "confidence": round(combined_confidence, 2),
            "reason": reason,
            "stop_loss": round(stop_loss, 8) if stop_loss else None,
            "take_profit": round(take_profit, 8) if take_profit else None,
            "current_price": indicator_signal["current_price"],
            "indicators": indicator_signal["indicators"],
            "ml_contribution": round(ml_weight / (indicator_weight + ml_weight), 2)
        }


class PositionManager:
    """
    Class for managing trading positions, including sizing and risk management.
    """
    
    def __init__(self, balance=1000.0, max_risk_per_trade=0.02):
        """
        Initialize the position manager.
        
        Args:
            balance (float): Account balance
            max_risk_per_trade (float): Maximum risk per trade as a fraction of balance
        """
        self.balance = balance
        self.max_risk_per_trade = max_risk_per_trade
        
    def calculate_position_size(self, entry_price, stop_loss, confidence=0.7):
        """
        Calculate optimal position size based on risk management principles.
        
        Args:
            entry_price (float): Entry price for the trade
            stop_loss (float): Stop loss price
            confidence (float): Signal confidence (0-1)
            
        Returns:
            float: Position size in base currency
        """
        if stop_loss is None or entry_price == stop_loss:
            return 0.0
            
        # Calculate risk per unit
        if entry_price > stop_loss:  # Long position
            risk_per_unit = entry_price - stop_loss
        else:  # Short position
            risk_per_unit = stop_loss - entry_price
            
        # Calculate risk amount based on balance and max risk
        risk_amount = self.balance * self.max_risk_per_trade
        
        # Adjust risk based on confidence
        adjusted_risk = risk_amount * confidence
        
        # Calculate position size
        position_size = adjusted_risk / risk_per_unit
        
        return position_size
        
    def calculate_risk_reward(self, entry_price, stop_loss, take_profit):
        """
        Calculate risk-reward ratio for a trade.
        
        Args:
            entry_price (float): Entry price for the trade
            stop_loss (float): Stop loss price
            take_profit (float): Take profit price
            
        Returns:
            float: Risk-reward ratio
        """
        if stop_loss is None or take_profit is None or entry_price is None:
            return 0.0
            
        # Calculate risk and reward
        if entry_price > stop_loss:  # Long position
            risk = entry_price - stop_loss
            reward = take_profit - entry_price
        else:  # Short position
            risk = stop_loss - entry_price
            reward = entry_price - take_profit
            
        if risk == 0:
            return 0.0
            
        return reward / risk