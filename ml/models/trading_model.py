import os
import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow.keras.models import Sequential, load_model
from tensorflow.keras.layers import LSTM, Dense, Dropout
from tensorflow.keras.callbacks import ModelCheckpoint, EarlyStopping
from sklearn.preprocessing import MinMaxScaler
import joblib
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class TradingModel:
    def __init__(self, model_path=None, scaler_path=None):
        self.model = None
        self.scaler = None
        self.model_path = model_path or os.path.join(os.path.dirname(__file__), 'trading_model.h5')
        self.scaler_path = scaler_path or os.path.join(os.path.dirname(__file__), 'scaler.pkl')
        self.sequence_length = 60  # Number of time steps to look back
        self.features = 7  # Number of features (OHLCV + technical indicators)
        
        # Try to load the model
        self.load()
    
    def load(self):
        """Load the model and scaler if they exist."""
        try:
            if os.path.exists(self.model_path):
                logger.info(f"Loading model from {self.model_path}")
                self.model = load_model(self.model_path)
                logger.info("Model loaded successfully")
            else:
                logger.warning(f"Model file not found at {self.model_path}")
                
            if os.path.exists(self.scaler_path):
                logger.info(f"Loading scaler from {self.scaler_path}")
                self.scaler = joblib.load(self.scaler_path)
                logger.info("Scaler loaded successfully")
            else:
                logger.warning(f"Scaler file not found at {self.scaler_path}")
                self.scaler = MinMaxScaler(feature_range=(0, 1))
        except Exception as e:
            logger.error(f"Error loading model or scaler: {str(e)}")
            raise
    
    def build_model(self):
        """Build and compile the LSTM model."""
        model = Sequential()
        model.add(LSTM(units=50, return_sequences=True, input_shape=(self.sequence_length, self.features)))
        model.add(Dropout(0.2))
        model.add(LSTM(units=50, return_sequences=False))
        model.add(Dropout(0.2))
        model.add(Dense(units=25))
        model.add(Dense(units=3))  # 3 outputs: [price_change, stop_loss, take_profit]
        
        model.compile(optimizer='adam', loss='mean_squared_error')
        logger.info("Model built and compiled")
        self.model = model
        return model
    
    def preprocess_data(self, df):
        """Preprocess data for prediction or training."""
        try:
            # Ensure expected columns are present
            required_cols = ['open', 'high', 'low', 'close', 'volume']
            df.columns = df.columns.str.lower()
            missing_cols = [col for col in required_cols if col not in df.columns]
            
            if missing_cols:
                raise ValueError(f"Missing required columns: {missing_cols}")
            
            # Add technical indicators if not present
            if 'rsi' not in df.columns:
                df = self.add_technical_indicators(df)
            
            # Normalize the data
            if self.scaler is None:
                self.scaler = MinMaxScaler(feature_range=(0, 1))
                data_scaled = self.scaler.fit_transform(df)
                joblib.dump(self.scaler, self.scaler_path)
                logger.info(f"Scaler saved to {self.scaler_path}")
            else:
                data_scaled = self.scaler.transform(df)
            
            return data_scaled
        except Exception as e:
            logger.error(f"Error in data preprocessing: {str(e)}")
            raise
    
    def add_technical_indicators(self, df):
        """Add technical indicators to the dataframe."""
        # Calculate RSI (Relative Strength Index)
        delta = df['close'].diff()
        gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
        loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
        rs = gain / loss
        df['rsi'] = 100 - (100 / (1 + rs))
        
        # Calculate MACD (Moving Average Convergence Divergence)
        exp1 = df['close'].ewm(span=12, adjust=False).mean()
        exp2 = df['close'].ewm(span=26, adjust=False).mean()
        df['macd'] = exp1 - exp2
        
        # Fill NaN values
        df.fillna(0, inplace=True)
        
        return df
    
    def prepare_sequences(self, data, sequence_length=None):
        """Prepare sequences for LSTM model."""
        sequence_length = sequence_length or self.sequence_length
        X = []
        
        for i in range(len(data) - sequence_length):
            X.append(data[i:i + sequence_length])
        
        return np.array(X)
    
    def train(self, df, epochs=50, batch_size=32, validation_split=0.2):
        """Train the model with the given dataframe."""
        try:
            # Build model if it doesn't exist
            if self.model is None:
                self.build_model()
            
            # Preprocess data
            data_scaled = self.preprocess_data(df)
            
            # Prepare sequences
            X = self.prepare_sequences(data_scaled)
            y = data_scaled[self.sequence_length:, 3]  # Close price as target
            
            # Reshape y to match model output
            y = np.column_stack([
                y,  # Price change
                np.zeros_like(y),  # Stop loss placeholder
                np.zeros_like(y)   # Take profit placeholder
            ])
            
            # Setup callbacks
            checkpoint = ModelCheckpoint(
                self.model_path,
                monitor='val_loss',
                save_best_only=True,
                mode='min',
                verbose=1
            )
            
            early_stopping = EarlyStopping(
                monitor='val_loss',
                patience=10,
                restore_best_weights=True,
                verbose=1
            )
            
            # Train the model
            history = self.model.fit(
                X, y,
                epochs=epochs,
                batch_size=batch_size,
                validation_split=validation_split,
                callbacks=[checkpoint, early_stopping],
                verbose=1
            )
            
            logger.info(f"Model trained and saved to {self.model_path}")
            return history
            
        except Exception as e:
            logger.error(f"Error in training: {str(e)}")
            raise
    
    def predict(self, df):
        """Make predictions with the model."""
        try:
            if self.model is None:
                raise ValueError("Model not loaded. Please load or train the model first.")
            
            # Preprocess data
            data_scaled = self.preprocess_data(df)
            
            # Prepare sequence
            X = self.prepare_sequences(data_scaled)
            
            if len(X) == 0:
                raise ValueError("Not enough data points for prediction")
            
            # Make prediction
            predictions = self.model.predict(X)
            
            # Extract predictions
            price_changes = predictions[:, 0]
            stop_losses = predictions[:, 1]
            take_profits = predictions[:, 2]
            
            # Convert to original scale
            last_close = df['close'].values[-1]
            predicted_prices = last_close * (1 + price_changes[-1])
            stop_loss = last_close * (1 - abs(stop_losses[-1]))
            take_profit = last_close * (1 + abs(take_profits[-1]))
            
            # Determine trade direction
            direction = 'LONG' if predicted_prices > last_close else 'SHORT'
            
            # Calculate confidence level (simple example - can be more sophisticated)
            confidence = min(abs(predicted_prices - last_close) / last_close * 100, 100)
            
            return {
                'predicted_price': float(predicted_prices),
                'current_price': float(last_close),
                'direction': direction,
                'stop_loss': float(stop_loss),
                'take_profit': float(take_profit),
                'confidence': float(confidence)
            }
            
        except Exception as e:
            logger.error(f"Error in prediction: {str(e)}")
            raise
    
    def fine_tune(self, df, epochs=10, batch_size=32):
        """Fine-tune the model with new data."""
        try:
            if self.model is None:
                raise ValueError("Model not loaded. Please load or train the model first.")
            
            # Preprocess data
            data_scaled = self.preprocess_data(df)
            
            # Prepare sequences
            X = self.prepare_sequences(data_scaled)
            y = data_scaled[self.sequence_length:, 3]  # Close price as target
            
            # Reshape y to match model output
            y = np.column_stack([
                y,  # Price change
                np.zeros_like(y),  # Stop loss placeholder
                np.zeros_like(y)   # Take profit placeholder
            ])
            
            # Setup callbacks
            checkpoint = ModelCheckpoint(
                self.model_path,
                monitor='loss',
                save_best_only=True,
                mode='min',
                verbose=1
            )
            
            # Fine-tune the model
            history = self.model.fit(
                X, y,
                epochs=epochs,
                batch_size=batch_size,
                callbacks=[checkpoint],
                verbose=1
            )
            
            logger.info("Model fine-tuned and saved")
            return history
            
        except Exception as e:
            logger.error(f"Error in fine-tuning: {str(e)}")
            raise
    
    def evaluate_signal(self, data, threshold=0.7):
        """Evaluate if a trade signal is valid based on confidence threshold."""
        prediction = self.predict(data)
        
        if prediction['confidence'] < threshold * 100:
            return None  # Signal not strong enough
        
        return {
            'direction': prediction['direction'],
            'entry_price': prediction['current_price'],
            'stop_loss': prediction['stop_loss'],
            'take_profit': prediction['take_profit'],
            'confidence': prediction['confidence'] / 100  # Scale to 0-1
        }


# Create a singleton instance
model_instance = None

def get_model_instance():
    global model_instance
    if model_instance is None:
        model_instance = TradingModel()
    return model_instance