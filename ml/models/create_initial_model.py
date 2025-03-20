import os
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import LSTM, Dense, Dropout, BatchNormalization
import numpy as np
import logging

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

def create_initial_model(input_shape=(60, 5), output_shape=3):
    """
    Creates and saves an initial LSTM model for cryptocurrency forecasting.
    
    Args:
        input_shape: Tuple of (sequence_length, features) - default 60 timeframes with 5 features
        output_shape: Number of output classes (e.g., buy, sell, hold) - default 3
    
    Returns:
        The path to the saved model
    """
    logger.info(f"Creating initial model with input shape {input_shape} and output shape {output_shape}")
    
    # Define the model architecture
    model = Sequential([
        LSTM(100, return_sequences=True, input_shape=input_shape),
        BatchNormalization(),
        Dropout(0.2),
        
        LSTM(100, return_sequences=False),
        BatchNormalization(),
        Dropout(0.2),
        
        Dense(50, activation='relu'),
        BatchNormalization(),
        Dropout(0.2),
        
        Dense(output_shape, activation='softmax')
    ])
    
    # Compile the model
    model.compile(
        optimizer=tf.keras.optimizers.Adam(learning_rate=0.001),
        loss='categorical_crossentropy',
        metrics=['accuracy']
    )
    
    # Summary
    model.summary()
    
    # Create directory if it doesn't exist
    os.makedirs(os.path.dirname(os.path.abspath(__file__)), exist_ok=True)
    
    # Save model
    model_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'trading_model.h5')
    model.save(model_path)
    
    logger.info(f"Initial model saved to {model_path}")
    
    # Also generate and save a small dummy weights file to prevent file not found errors
    # in case the real model hasn't been trained yet
    logger.info("Creating dummy weights file for initial model")
    
    # Create a dummy array of random values
    dummy_data = np.random.rand(10, 60, 5).astype(np.float32)
    dummy_labels = np.random.rand(10, 3).astype(np.float32)
    
    # Train model for one step just to initialize weights properly
    model.fit(dummy_data, dummy_labels, epochs=1, verbose=0)
    model.save(model_path)
    
    return model_path

if __name__ == "__main__":
    try:
        model_path = create_initial_model()
        print(f"Successfully created initial model at: {model_path}")
    except Exception as e:
        logger.error(f"Error creating initial model: {str(e)}")
        raise