import os
import tensorflow as tf
from tensorflow.keras.models import Sequential, load_model
from tensorflow.keras.layers import LSTM, Dense, Dropout, BatchNormalization
from tensorflow.keras.callbacks import ModelCheckpoint, EarlyStopping, ReduceLROnPlateau
from tensorflow.keras.optimizers import Adam
import numpy as np
import logging

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

class TradingModel:
    def __init__(self, sequence_length=60, feature_dim=17):
        """
        Initialize the trading model
        
        Args:
            sequence_length (int): Length of input sequences
            feature_dim (int): Number of features per time step
        """
        self.sequence_length = sequence_length
        self.feature_dim = feature_dim
        self.model = None
        self.model_path = os.path.join(os.path.dirname(__file__), 'trading_model.h5')
        
    def build_model(self):
        """Build the LSTM model architecture"""
        model = Sequential([
            # First LSTM layer
            LSTM(128, return_sequences=True, input_shape=(self.sequence_length, self.feature_dim)),
            BatchNormalization(),
            Dropout(0.2),
            
            # Second LSTM layer
            LSTM(64, return_sequences=False),
            BatchNormalization(),
            Dropout(0.2),
            
            # Dense layers
            Dense(32, activation='relu'),
            BatchNormalization(),
            Dropout(0.2),
            
            # Output layer (sigmoid for binary classification)
            Dense(1, activation='sigmoid')
        ])
        
        # Compile model
        model.compile(
            optimizer=Adam(learning_rate=0.001),
            loss='binary_crossentropy',
            metrics=['accuracy']
        )
        
        self.model = model
        logger.info("Model built successfully")
        return model
    
    def train(self, X_train, y_train, X_val=None, y_val=None, epochs=50, batch_size=32):
        """
        Train the model on the provided data
        
        Args:
            X_train (np.ndarray): Training sequences
            y_train (np.ndarray): Training labels
            X_val (np.ndarray): Validation sequences (optional)
            y_val (np.ndarray): Validation labels (optional)
            epochs (int): Number of training epochs
            batch_size (int): Batch size for training
        
        Returns:
            History object containing training metrics
        """
        if self.model is None:
            self.build_model()
        
        # Create model directory if it doesn't exist
        model_dir = os.path.dirname(self.model_path)
        if not os.path.exists(model_dir):
            os.makedirs(model_dir)
        
        # Set up callbacks
        callbacks = [
            ModelCheckpoint(
                self.model_path,
                save_best_only=True,
                monitor='val_accuracy' if X_val is not None else 'accuracy',
                mode='max',
                verbose=1
            ),
            EarlyStopping(
                monitor='val_loss' if X_val is not None else 'loss',
                patience=10,
                restore_best_weights=True,
                verbose=1
            ),
            ReduceLROnPlateau(
                monitor='val_loss' if X_val is not None else 'loss',
                factor=0.5,
                patience=5,
                min_lr=0.00001,
                verbose=1
            )
        ]
        
        # Train the model
        validation_data = (X_val, y_val) if X_val is not None and y_val is not None else None
        history = self.model.fit(
            X_train, y_train,
            epochs=epochs,
            batch_size=batch_size,
            validation_data=validation_data,
            callbacks=callbacks,
            verbose=1
        )
        
        logger.info(f"Model trained for {len(history.epoch)} epochs")
        return history
    
    def load(self):
        """Load the trained model from disk"""
        try:
            self.model = load_model(self.model_path)
            logger.info(f"Model loaded from {self.model_path}")
            return True
        except (OSError, IOError) as e:
            logger.error(f"Error loading model: {str(e)}")
            return False
    
    def predict(self, X):
        """
        Make predictions with the model
        
        Args:
            X (np.ndarray): Input sequences to predict on
            
        Returns:
            np.ndarray: Predicted probabilities
        """
        if self.model is None:
            success = self.load()
            if not success:
                logger.error("Model could not be loaded for prediction")
                return None
        
        # Predict and return probabilities
        return self.model.predict(X)
    
    def evaluate(self, X_test, y_test):
        """
        Evaluate the model on test data
        
        Args:
            X_test (np.ndarray): Test sequences
            y_test (np.ndarray): Test labels
            
        Returns:
            tuple: (loss, accuracy)
        """
        if self.model is None:
            success = self.load()
            if not success:
                logger.error("Model could not be loaded for evaluation")
                return None
        
        # Evaluate the model
        loss, accuracy = self.model.evaluate(X_test, y_test, verbose=0)
        logger.info(f"Test loss: {loss:.4f}, Test accuracy: {accuracy:.4f}")
        return loss, accuracy
    
    def fine_tune(self, X_new, y_new, epochs=10, batch_size=32):
        """
        Fine-tune the model on new data
        
        Args:
            X_new (np.ndarray): New training sequences
            y_new (np.ndarray): New training labels
            epochs (int): Number of fine-tuning epochs
            batch_size (int): Batch size for fine-tuning
            
        Returns:
            History object containing training metrics
        """
        if self.model is None:
            success = self.load()
            if not success:
                logger.error("Model could not be loaded for fine-tuning")
                return None
        
        # Set a lower learning rate for fine-tuning
        self.model.optimizer.learning_rate = 0.0001
        
        # Fine-tune the model
        history = self.model.fit(
            X_new, y_new,
            epochs=epochs,
            batch_size=batch_size,
            callbacks=[
                ModelCheckpoint(
                    self.model_path,
                    save_best_only=True,
                    monitor='accuracy',
                    mode='max',
                    verbose=1
                )
            ],
            verbose=1
        )
        
        logger.info(f"Model fine-tuned for {len(history.epoch)} epochs")
        return history