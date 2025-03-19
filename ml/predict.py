import os
import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow.keras.models import load_model
import joblib
from datetime import datetime
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("predict")

class TradingPredictor:
    def __init__(self, model_path="models/trading_model.h5", scaler_path="models/scaler.pkl"):
        """
        Initialize the trading predictor with model and scaler paths
        
        Args:
            model_path: Path to the trained TensorFlow model
            scaler_path: Path to the saved scaler for feature normalization
        """
        try:
            self.model = load_model(model_path)
            logger.info(f"Model loaded successfully from {model_path}")
            self.scaler = joblib.load(scaler_path)
            logger.info(f"Scaler loaded successfully from {scaler_path}")
        except Exception as e:
            logger.error(f"Error loading model or scaler: {str(e)}")
            raise

        # Define lookback period for feature generation
        self.lookback = 30  # Number of periods to consider for technical indicators

    def preprocess_data(self, market_data):
        """
        Preprocess market data for prediction
        
        Args:
            market_data: DataFrame with OHLCV data (Open, High, Low, Close, Volume)
            
        Returns:
            Preprocessed data ready for model prediction
        """
        try:
            # Ensure market_data is a pandas DataFrame
            if not isinstance(market_data, pd.DataFrame):
                market_data = pd.DataFrame(market_data)
            
            # Ensure we have the required columns
            required_columns = ['open', 'high', 'low', 'close', 'volume']
            for col in required_columns:
                if col not in market_data.columns:
                    raise ValueError(f"Missing required column: {col}")
            
            # Generate technical indicators
            df = self._generate_features(market_data)
            
            # Drop NaN values that might appear during feature generation
            df = df.dropna()
            
            # Get the features used during training
            features = [col for col in df.columns if col not in ['open', 'high', 'low', 'close', 'volume', 'timestamp']]
            
            # Scale the features
            X = self.scaler.transform(df[features])
            
            # Reshape for LSTM if the model expects 3D input
            if len(self.model.input_shape) > 2:
                X = X.reshape(X.shape[0], 1, X.shape[1])
                
            return X, df
            
        except Exception as e:
            logger.error(f"Error preprocessing data: {str(e)}")
            raise

    def _generate_features(self, df):
        """
        Generate technical indicators and features from OHLCV data
        
        Args:
            df: DataFrame with OHLCV data
            
        Returns:
            DataFrame with added technical indicators
        """
        # Create a copy to avoid modifying the original
        data = df.copy()
        
        # Convert column names to lowercase if needed
        data.columns = [col.lower() for col in data.columns]
        
        # Simple Moving Averages
        data['sma_5'] = data['close'].rolling(window=5).mean()
        data['sma_10'] = data['close'].rolling(window=10).mean()
        data['sma_20'] = data['close'].rolling(window=20).mean()
        
        # Exponential Moving Averages
        data['ema_5'] = data['close'].ewm(span=5, adjust=False).mean()
        data['ema_10'] = data['close'].ewm(span=10, adjust=False).mean()
        data['ema_20'] = data['close'].ewm(span=20, adjust=False).mean()
        
        # Relative Strength Index (RSI)
        delta = data['close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / loss
        data['rsi'] = 100 - (100 / (1 + rs))
        
        # MACD
        data['macd'] = data['ema_12'] = data['close'].ewm(span=12, adjust=False).mean()
        data['macd_signal'] = data['ema_26'] = data['close'].ewm(span=26, adjust=False).mean()
        data['macd'] = data['ema_12'] - data['ema_26']
        data['macd_signal'] = data['macd'].ewm(span=9, adjust=False).mean()
        data['macd_hist'] = data['macd'] - data['macd_signal']
        
        # Bollinger Bands
        data['bb_middle'] = data['close'].rolling(window=20).mean()
        data['bb_std'] = data['close'].rolling(window=20).std()
        data['bb_upper'] = data['bb_middle'] + 2 * data['bb_std']
        data['bb_lower'] = data['bb_middle'] - 2 * data['bb_std']
        data['bb_width'] = (data['bb_upper'] - data['bb_lower']) / data['bb_middle']
        
        # Price rate of change
        data['price_roc'] = data['close'].pct_change(periods=10) * 100
        
        # Volume features
        data['volume_roc'] = data['volume'].pct_change(periods=1) * 100
        data['volume_ma_5'] = data['volume'].rolling(window=5).mean()
        data['volume_ma_ratio'] = data['volume'] / data['volume_ma_5']
        
        # Volatility features
        data['daily_return'] = data['close'].pct_change()
        data['volatility'] = data['daily_return'].rolling(window=14).std() * 100
        
        # Trend indicators
        data['adx'] = self._calculate_adx(data, period=14)
        
        return data
    
    def _calculate_adx(self, df, period=14):
        """Calculate Average Directional Index (ADX)"""
        df = df.copy()
        
        # Calculate True Range (TR)
        df['high_low'] = df['high'] - df['low']
        df['high_close'] = abs(df['high'] - df['close'].shift())
        df['low_close'] = abs(df['low'] - df['close'].shift())
        df['tr'] = df[['high_low', 'high_close', 'low_close']].max(axis=1)
        
        # Calculate Directional Movement
        df['up_move'] = df['high'] - df['high'].shift()
        df['down_move'] = df['low'].shift() - df['low']
        
        df['plus_dm'] = np.where((df['up_move'] > df['down_move']) & (df['up_move'] > 0), df['up_move'], 0)
        df['minus_dm'] = np.where((df['down_move'] > df['up_move']) & (df['down_move'] > 0), df['down_move'], 0)
        
        # Calculate Smoothed Averages
        df['plus_di'] = 100 * (df['plus_dm'].rolling(window=period).sum() / df['tr'].rolling(window=period).sum())
        df['minus_di'] = 100 * (df['minus_dm'].rolling(window=period).sum() / df['tr'].rolling(window=period).sum())
        
        # Calculate Directional Movement Index (DX)
        df['dx'] = 100 * (abs(df['plus_di'] - df['minus_di']) / (df['plus_di'] + df['minus_di']))
        
        # Calculate ADX
        adx = df['dx'].rolling(window=period).mean()
        
        return adx

    def predict(self, market_data):
        """
        Make prediction on market data and identify trade signals
        
        Args:
            market_data: DataFrame with OHLCV data
            
        Returns:
            Dictionary with prediction results
        """
        try:
            # Preprocess the data
            X, processed_data = self.preprocess_data(market_data)
            
            # Make prediction
            predictions = self.model.predict(X)
            
            # Get the latest prediction
            latest_prediction = predictions[-1]
            
            # Define confidence threshold
            CONFIDENCE_THRESHOLD = 0.65
            
            # Extract latest market data for signal generation
            latest_data = processed_data.iloc[-1]
            current_price = latest_data['close']
            
            # Initialize signal data
            signal = {
                'timestamp': datetime.now().isoformat(),
                'symbol': market_data.get('symbol', 'UNKNOWN'),
                'current_price': current_price,
                'confidence': float(latest_prediction[0]),
                'signal': 'NEUTRAL',
                'take_profit': None,
                'stop_loss': None,
                'timeframe': '15m'
            }
            
            # Determine signal based on prediction and confidence
            if latest_prediction[0] > CONFIDENCE_THRESHOLD:
                # Long signal
                signal['signal'] = 'LONG'
                
                # Calculate dynamic take profit and stop loss
                volatility = latest_data.get('volatility', 1.5)  # Default to 1.5% if not available
                
                # More volatile market = wider stops and targets
                atr_multiplier = 1.5 if volatility > 2.0 else 1.0
                
                # Calculate take profit (1.5-3x risk depending on confidence)
                risk_reward = 1.5 + (latest_prediction[0] - CONFIDENCE_THRESHOLD) * 5  # 1.5 to 3.0
                
                # Stop loss: 1-2% of current price, adjusted for volatility
                stop_loss_pct = (1.0 + (volatility * 0.2)) * atr_multiplier
                signal['stop_loss'] = round(current_price * (1 - stop_loss_pct/100), 2)
                
                # Take profit: Risk-reward ratio * stop loss distance
                take_profit_distance = current_price - signal['stop_loss']
                signal['take_profit'] = round(current_price + (take_profit_distance * risk_reward), 2)
                
            elif latest_prediction[0] < (1 - CONFIDENCE_THRESHOLD):
                # Short signal
                signal['signal'] = 'SHORT'
                
                # Calculate dynamic take profit and stop loss
                volatility = latest_data.get('volatility', 1.5)  # Default to 1.5% if not available
                
                # More volatile market = wider stops and targets
                atr_multiplier = 1.5 if volatility > 2.0 else 1.0
                
                # Calculate take profit (1.5-3x risk depending on confidence)
                risk_reward = 1.5 + ((1 - CONFIDENCE_THRESHOLD) - latest_prediction[0]) * 5  # 1.5 to 3.0
                
                # Stop loss: 1-2% of current price, adjusted for volatility
                stop_loss_pct = (1.0 + (volatility * 0.2)) * atr_multiplier
                signal['stop_loss'] = round(current_price * (1 + stop_loss_pct/100), 2)
                
                # Take profit: Risk-reward ratio * stop loss distance
                take_profit_distance = signal['stop_loss'] - current_price
                signal['take_profit'] = round(current_price - (take_profit_distance * risk_reward), 2)
            
            logger.info(f"Generated signal: {signal['signal']} for {signal['symbol']} with confidence {signal['confidence']}")
            return signal
            
        except Exception as e:
            logger.error(f"Error making prediction: {str(e)}")
            raise

    def filter_signal(self, signal, recent_signals=None):
        """
        Filter trading signals to remove duplicates and ensure high confidence
        
        Args:
            signal: The current trading signal
            recent_signals: List of recent signals for the same symbol
            
        Returns:
            Boolean indicating whether the signal should be executed
        """
        # Implement duplicate checking logic
        if recent_signals:
            # Check for duplicate signals in the same timeframe
            for prev_signal in recent_signals:
                # Skip if different timeframe or symbol
                if prev_signal['timeframe'] != signal['timeframe'] or prev_signal['symbol'] != signal['symbol']:
                    continue
                
                # Skip if different signal type (LONG vs SHORT)
                if prev_signal['signal'] != signal['signal']:
                    continue
                
                # Check if signal was generated within the last 15 minutes (for 15m timeframe)
                prev_time = datetime.fromisoformat(prev_signal['timestamp'])
                current_time = datetime.fromisoformat(signal['timestamp'])
                time_diff = (current_time - prev_time).total_seconds() / 60
                
                # If similar signal exists within timeframe window, reject as duplicate
                if time_diff < 15:  # 15 minutes for 15m timeframe
                    logger.info(f"Filtered out duplicate {signal['signal']} signal for {signal['symbol']}")
                    return False
        
        # Ensure confidence is high enough
        if signal['signal'] != 'NEUTRAL' and signal['confidence'] < 0.65:
            logger.info(f"Filtered out low confidence {signal['signal']} signal ({signal['confidence']}) for {signal['symbol']}")
            return False
            
        return True