import numpy as np
import pandas as pd
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Dense, Dropout, BatchNormalization, LSTM
from tensorflow.keras.optimizers import Adam
from tensorflow.keras.callbacks import EarlyStopping, ModelCheckpoint, ReduceLROnPlateau
from sklearn.preprocessing import StandardScaler
from sklearn.model_selection import train_test_split
import matplotlib.pyplot as plt
import os
import joblib
import json
from datetime import datetime
import logging
import sentry_sdk

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Sentry if DSN is available
sentry_dsn = os.getenv("SENTRY_DSN", "")
if sentry_dsn:
    sentry_sdk.init(dsn=sentry_dsn, traces_sample_rate=0.5)

def load_data(file_path=None, data=None):
    """
    Load and prepare data either from a file or directly from data parameter
    """
    try:
        if file_path:
            if file_path.endswith('.csv'):
                df = pd.read_csv(file_path)
            elif file_path.endswith('.json'):
                df = pd.read_json(file_path)
            else:
                raise ValueError("Unsupported file format. Use CSV or JSON.")
        elif data is not None:
            if isinstance(data, list):
                df = pd.DataFrame(data)
            elif isinstance(data, pd.DataFrame):
                df = data
            else:
                raise ValueError("Invalid data format. Use list of dicts or DataFrame.")
        else:
            raise ValueError("Either file_path or data must be provided")
        
        logger.info(f"Data loaded successfully with {len(df)} rows")
        return df
    
    except Exception as e:
        logger.error(f"Error loading data: {str(e)}")
        if sentry_dsn:
            sentry_sdk.capture_exception(e)
        raise

def engineer_features(df):
    """
    Create technical indicators and features from price data
    """
    # Ensure required columns exist
    required_cols = ['open', 'high', 'low', 'close', 'volume']
    missing_cols = [col for col in required_cols if col not in df.columns]
    
    if missing_cols:
        logger.error(f"Missing required columns: {missing_cols}")
        raise ValueError(f"DataFrame missing required columns: {missing_cols}")
    
    # Make sure columns are lowercase
    df.columns = [col.lower() for col in df.columns]
    
    # Calculate basic features
    df['return'] = df['close'].pct_change()
    df['log_return'] = np.log(df['close'] / df['close'].shift(1))
    
    # Moving averages
    for period in [7, 14, 21, 50]:
        df[f'ma_{period}'] = df['close'].rolling(window=period).mean()
        df[f'ma_ratio_{period}'] = df['close'] / df[f'ma_{period}']
    
    # Bollinger Bands
    df['ma_20'] = df['close'].rolling(window=20).mean()
    df['std_20'] = df['close'].rolling(window=20).std()
    df['upper_band'] = df['ma_20'] + (df['std_20'] * 2)
    df['lower_band'] = df['ma_20'] - (df['std_20'] * 2)
    df['bb_width'] = (df['upper_band'] - df['lower_band']) / df['ma_20']
    df['bb_position'] = (df['close'] - df['lower_band']) / (df['upper_band'] - df['lower_band'])
    
    # RSI (Relative Strength Index)
    delta = df['close'].diff()
    gain = (delta.where(delta > 0, 0)).rolling(window=14).mean()
    loss = (-delta.where(delta < 0, 0)).rolling(window=14).mean()
    rs = gain / loss
    df['rsi_14'] = 100 - (100 / (1 + rs))
    
    # MACD (Moving Average Convergence Divergence)
    df['ema_12'] = df['close'].ewm(span=12, adjust=False).mean()
    df['ema_26'] = df['close'].ewm(span=26, adjust=False).mean()
    df['macd'] = df['ema_12'] - df['ema_26']
    df['signal_line'] = df['macd'].ewm(span=9, adjust=False).mean()
    df['macd_histogram'] = df['macd'] - df['signal_line']
    
    # Volume features
    df['volume_ma_5'] = df['volume'].rolling(window=5).mean()
    df['volume_ratio'] = df['volume'] / df['volume_ma_5']
    
    # Volatility
    df['true_range'] = np.maximum(
        df['high'] - df['low'],
        np.maximum(
            abs(df['high'] - df['close'].shift(1)),
            abs(df['low'] - df['close'].shift(1))
        )
    )
    df['atr_14'] = df['true_range'].rolling(window=14).mean()
    df['atr_ratio'] = df['atr_14'] / df['close']
    
    # Target: Price direction for next candle (1 for up, 0 for down)
    df['target'] = (df['close'].shift(-1) > df['close']).astype(int)
    
    # Drop NaN values
    df = df.dropna()
    
    logger.info(f"Feature engineering completed. Data shape: {df.shape}")
    
    return df

def prepare_model_data(df, test_size=0.2):
    """
    Prepare data for model training and testing
    """
    # Define features and target
    feature_columns = [
        'return', 'log_return', 'ma_ratio_7', 'ma_ratio_14', 'ma_ratio_21', 'ma_ratio_50',
        'bb_width', 'bb_position', 'rsi_14', 'macd', 'macd_histogram',
        'volume_ratio', 'atr_ratio'
    ]
    
    X = df[feature_columns].values
    y = df['target'].values
    
    # Split data into training and testing sets
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=test_size, shuffle=False)
    
    # Scale features
    scaler = StandardScaler()
    X_train_scaled = scaler.fit_transform(X_train)
    X_test_scaled = scaler.transform(X_test)
    
    # Save the scaler for future use
    os.makedirs("models", exist_ok=True)
    joblib.dump(scaler, "models/feature_scaler.joblib")
    
    logger.info(f"Data prepared for model training. Training set: {X_train_scaled.shape}, Test set: {X_test_scaled.shape}")
    
    return X_train_scaled, X_test_scaled, y_train, y_test, feature_columns

def build_model(input_shape):
    """
    Build and compile a deep learning model for price prediction
    """
    model = Sequential([
        Dense(64, activation='relu', input_shape=(input_shape,)),
        BatchNormalization(),
        Dropout(0.3),
        
        Dense(32, activation='relu'),
        BatchNormalization(),
        Dropout(0.2),
        
        Dense(16, activation='relu'),
        BatchNormalization(),
        
        Dense(1, activation='sigmoid')
    ])
    
    model.compile(
        optimizer=Adam(learning_rate=0.001),
        loss='binary_crossentropy',
        metrics=['accuracy']
    )
    
    logger.info("Model built and compiled successfully")
    model.summary(print_fn=logger.info)
    
    return model

def build_lstm_model(input_shape):
    """
    Build and compile an LSTM model for sequential price prediction
    """
    # Reshape input for LSTM [samples, timesteps, features]
    input_shape = (input_shape[0], 1, input_shape[1])
    
    model = Sequential([
        LSTM(64, input_shape=input_shape[1:], return_sequences=True),
        Dropout(0.3),
        
        LSTM(32, return_sequences=False),
        Dropout(0.2),
        
        Dense(16, activation='relu'),
        BatchNormalization(),
        
        Dense(1, activation='sigmoid')
    ])
    
    model.compile(
        optimizer=Adam(learning_rate=0.001),
        loss='binary_crossentropy',
        metrics=['accuracy']
    )
    
    logger.info("LSTM Model built and compiled successfully")
    model.summary(print_fn=logger.info)
    
    return model

def train_model(model, X_train, y_train, X_test, y_test, batch_size=32, epochs=100):
    """
    Train the model with early stopping and learning rate reduction
    """
    # Define callbacks
    early_stopping = EarlyStopping(
        monitor='val_loss',
        patience=10,
        restore_best_weights=True
    )
    
    reduce_lr = ReduceLROnPlateau(
        monitor='val_loss',
        factor=0.5,
        patience=5,
        min_lr=0.00001
    )
    
    model_checkpoint = ModelCheckpoint(
        "models/trading_model.h5",
        monitor='val_accuracy',
        save_best_only=True,
        mode='max'
    )
    
    # Train the model
    history = model.fit(
        X_train, y_train,
        validation_data=(X_test, y_test),
        epochs=epochs,
        batch_size=batch_size,
        callbacks=[early_stopping, reduce_lr, model_checkpoint],
        verbose=1
    )
    
    logger.info("Model training completed")
    
    return model, history

def evaluate_model(model, X_test, y_test):
    """
    Evaluate model performance and save results
    """
    # Evaluate on test data
    test_loss, test_accuracy = model.evaluate(X_test, y_test)
    logger.info(f"Test accuracy: {test_accuracy:.4f}, Test loss: {test_loss:.4f}")
    
    # Make predictions
    y_pred_proba = model.predict(X_test)
    y_pred = (y_pred_proba > 0.5).astype(int).flatten()
    
    # Calculate performance metrics
    from sklearn.metrics import classification_report, confusion_matrix, accuracy_score, precision_score, recall_score, f1_score
    
    accuracy = accuracy_score(y_test, y_pred)
    precision = precision_score(y_test, y_pred)
    recall = recall_score(y_test, y_pred)
    f1 = f1_score(y_test, y_pred)
    conf_matrix = confusion_matrix(y_test, y_pred)
    
    logger.info(f"Accuracy: {accuracy:.4f}")
    logger.info(f"Precision: {precision:.4f}")
    logger.info(f"Recall: {recall:.4f}")
    logger.info(f"F1 Score: {f1:.4f}")
    logger.info(f"Confusion Matrix:\n{conf_matrix}")
    
    # Save evaluation results
    eval_results = {
        "accuracy": float(accuracy),
        "precision": float(precision),
        "recall": float(recall),
        "f1_score": float(f1),
        "confusion_matrix": conf_matrix.tolist(),
        "test_loss": float(test_loss),
        "timestamp": datetime.now().isoformat()
    }
    
    with open("models/model_evaluation.json", "w") as f:
        json.dump(eval_results, f, indent=4)
    
    return eval_results

def plot_training_history(history):
    """
    Plot training history and save figures
    """
    os.makedirs("models/plots", exist_ok=True)
    
    # Plot accuracy
    plt.figure(figsize=(10, 6))
    plt.plot(history.history['accuracy'], label='Training Accuracy')
    plt.plot(history.history['val_accuracy'], label='Validation Accuracy')
    plt.xlabel('Epoch')
    plt.ylabel('Accuracy')
    plt.title('Model Accuracy')
    plt.legend()
    plt.savefig("models/plots/accuracy_history.png")
    
    # Plot loss
    plt.figure(figsize=(10, 6))
    plt.plot(history.history['loss'], label='Training Loss')
    plt.plot(history.history['val_loss'], label='Validation Loss')
    plt.xlabel('Epoch')
    plt.ylabel('Loss')
    plt.title('Model Loss')
    plt.legend()
    plt.savefig("models/plots/loss_history.png")
    
    logger.info("Training history plots saved")

def save_model_summary(model, feature_columns, eval_results):
    """
    Save model architecture and training summary
    """
    model_info = {
        "model_type": model.__class__.__name__,
        "input_features": feature_columns,
        "performance": eval_results,
        "training_date": datetime.now().isoformat(),
        "model_file": "trading_model.h5"
    }
    
    with open("models/model_info.json", "w") as f:
        json.dump(model_info, f, indent=4)
    
    logger.info("Model summary saved")

def main(data_file=None, data=None, model_type="dense"):
    """
    Main function to train and evaluate the model
    """
    try:
        # Load and prepare data
        df = load_data(file_path=data_file, data=data)
        df = engineer_features(df)
        
        # Prepare model data
        X_train, X_test, y_train, y_test, feature_columns = prepare_model_data(df)
        
        # Build model
        if model_type.lower() == "lstm":
            # Reshape data for LSTM
            X_train = X_train.reshape((X_train.shape[0], 1, X_train.shape[1]))
            X_test = X_test.reshape((X_test.shape[0], 1, X_test.shape[1]))
            model = build_lstm_model((X_train.shape[0], X_train.shape[2]))
        else:
            model = build_model(X_train.shape[1])
        
        # Train model
        model, history = train_model(model, X_train, y_train, X_test, y_test)
        
        # Evaluate model
        eval_results = evaluate_model(model, X_test, y_test)
        
        # Plot and save results
        plot_training_history(history)
        save_model_summary(model, feature_columns, eval_results)
        
        logger.info("Model training and evaluation completed successfully")
        return model, eval_results
    
    except Exception as e:
        logger.error(f"Error in model training pipeline: {str(e)}")
        if sentry_dsn:
            sentry_sdk.capture_exception(e)
        raise

if __name__ == "__main__":
    import argparse
    
    parser = argparse.ArgumentParser(description="Train a deep learning model for crypto price prediction")
    parser.add_argument("--data", required=False, help="Path to data CSV or JSON file")
    parser.add_argument("--model-type", choices=["dense", "lstm"], default="dense", help="Type of model to train")
    args = parser.parse_args()
    
    main(data_file=args.data, model_type=args.model_type)