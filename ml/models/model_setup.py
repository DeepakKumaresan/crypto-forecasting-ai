import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout, BatchNormalization
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint, ReduceLROnPlateau
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("model_setup")

def create_lstm_model(input_shape, dropout_rate=0.2):
    """
    Create an LSTM model for time series prediction
    
    Args:
        input_shape: Shape of input data (for LSTM should be [samples, time steps, features])
        dropout_rate: Dropout rate for regularization
        
    Returns:
        Compiled Keras LSTM model
    """
    logger.info(f"Creating LSTM model with input shape: {input_shape}")
    
    model = Sequential([
        LSTM(128, return_sequences=True, input_shape=input_shape),
        BatchNormalization(),
        Dropout(dropout_rate),
        
        LSTM(64, return_sequences=False),
        BatchNormalization(),
        Dropout(dropout_rate),
        
        Dense(32, activation='relu'),
        BatchNormalization(),
        Dropout(dropout_rate),
        
        Dense(1, activation='sigmoid')  # Output layer (sigmoid for binary classification: bullish vs bearish)
    ])
    
    # Use Adam optimizer
    optimizer = Adam(learning_rate=0.001)
    
    # Compile model
    model.compile(
        optimizer=optimizer,
        loss='binary_crossentropy',
        metrics=['accuracy']
    )
    
    logger.info("Model created and compiled successfully")
    return model

def create_cnn_lstm_model(input_shape, dropout_rate=0.2):
    """
    Create a hybrid CNN-LSTM model for time series prediction with pattern recognition
    
    Args:
        input_shape: Shape of input data
        dropout_rate: Dropout rate for regularization
        
    Returns:
        Compiled Keras CNN-LSTM model
    """
    logger.info(f"Creating CNN-LSTM model with input shape: {input_shape}")
    
    model = Sequential([
        tf.keras.layers.Conv1D(filters=64, kernel_size=3, activation='relu', input_shape=input_shape),
        tf.keras.layers.MaxPooling1D(pool_size=2),
        tf.keras.layers.Conv1D(filters=128, kernel_size=3, activation='relu'),
        tf.keras.layers.MaxPooling1D(pool_size=2),
        BatchNormalization(),
        
        LSTM(128, return_sequences=True),
        Dropout(dropout_rate),
        BatchNormalization(),
        
        LSTM(64, return_sequences=False),
        Dropout(dropout_rate),
        BatchNormalization(),
        
        Dense(32, activation='relu'),
        Dropout(dropout_rate),
        
        Dense(1, activation='sigmoid')  # Output layer
    ])
    
    # Use Adam optimizer
    optimizer = Adam(learning_rate=0.001)
    
    # Compile model
    model.compile(
        optimizer=optimizer,
        loss='binary_crossentropy',
        metrics=['accuracy']
    )
    
    logger.info("CNN-LSTM model created and compiled successfully")
    return model

def get_callbacks(model_path, patience=10):
    """
    Define callbacks for model training
    
    Args:
        model_path: Path to save the best model
        patience: Number of epochs with no improvement after which training will be stopped
        
    Returns:
        List of Keras callbacks
    """
    callbacks = [
        # Early stopping to prevent overfitting
        EarlyStopping(
            monitor='val_loss',
            patience=patience,
            verbose=1,
            restore_best_weights=True
        ),
        
        # Save the best model
        ModelCheckpoint(
            filepath=model_path,
            monitor='val_loss',
            save_best_only=True,
            verbose=1
        ),
        
        # Reduce learning rate when a metric has stopped improving
        ReduceLROnPlateau(
            monitor='val_loss',
            factor=0.5,
            patience=5,
            min_lr=1e-6,
            verbose=1
        )
    ]
    
    return callbacks