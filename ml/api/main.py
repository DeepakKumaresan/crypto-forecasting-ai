from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Dict, Any, Optional
import numpy as np
import pandas as pd
import tensorflow as tf
import os
import logging
from datetime import datetime
import json
import uvicorn
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# Initialize Sentry
sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN", ""),
    integrations=[FastApiIntegration()],
    traces_sample_rate=0.5
)

app = FastAPI(title="Crypto Forecasting AI API")

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust this in production to specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load the model on startup
model = None

class PredictionRequest(BaseModel):
    symbol: str
    timeframe: str = "15m"
    features: Dict[str, List[float]]
    current_price: float

class TradeSignal(BaseModel):
    symbol: str
    timeframe: str
    signal_type: str  # "LONG" or "SHORT"
    entry_price: float
    confidence: float
    stop_loss: float
    take_profit: float
    timestamp: str

@app.on_event("startup")
async def load_model():
    global model
    try:
        model_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "models", "trading_model.h5")
        model = tf.keras.models.load_model(model_path)
        logger.info(f"Model loaded successfully from {model_path}")
    except Exception as e:
        logger.error(f"Error loading model: {str(e)}")
        sentry_sdk.capture_exception(e)

@app.get("/")
async def root():
    return {"message": "Crypto Forecasting AI API is running"}

@app.get("/health")
async def health_check():
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    return {"status": "healthy", "model_loaded": True}

@app.post("/predict", response_model=TradeSignal)
async def predict(request: PredictionRequest):
    if model is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    
    try:
        # Prepare features for prediction
        features = []
        for feature_name, values in request.features.items():
            features.extend(values)
        
        # Convert to numpy array and reshape for model
        features_array = np.array(features).reshape(1, -1)
        
        # Make prediction
        prediction = model.predict(features_array)
        
        # Extract prediction results
        direction = "LONG" if prediction[0][0] > 0.5 else "SHORT"
        confidence = float(prediction[0][0]) if direction == "LONG" else float(1 - prediction[0][0])
        
        # Calculate dynamic stop loss and take profit based on confidence and volatility
        volatility = calculate_volatility(request.features.get("close", []), request.features.get("high", []), request.features.get("low", []))
        
        if direction == "LONG":
            stop_loss = round(request.current_price * (1 - (volatility * 1.5)), 4)
            take_profit = round(request.current_price * (1 + (volatility * 2.5 * confidence)), 4)
        else:
            stop_loss = round(request.current_price * (1 + (volatility * 1.5)), 4)
            take_profit = round(request.current_price * (1 - (volatility * 2.5 * confidence)), 4)
        
        # Filter low confidence signals
        if confidence < 0.65:
            raise HTTPException(status_code=200, detail="Low confidence signal filtered out")
        
        # Create trade signal response
        trade_signal = TradeSignal(
            symbol=request.symbol,
            timeframe=request.timeframe,
            signal_type=direction,
            entry_price=request.current_price,
            confidence=round(confidence * 100, 2),
            stop_loss=stop_loss,
            take_profit=take_profit,
            timestamp=datetime.now().isoformat()
        )
        
        # Log the prediction
        logger.info(f"Generated trade signal: {trade_signal.dict()}")
        
        return trade_signal
    
    except Exception as e:
        logger.error(f"Prediction error: {str(e)}")
        sentry_sdk.capture_exception(e)
        raise HTTPException(status_code=500, detail=f"Prediction failed: {str(e)}")

def calculate_volatility(close_prices, high_prices, low_prices, lookback=14):
    """Calculate market volatility based on recent price action"""
    if not close_prices or len(close_prices) < lookback:
        return 0.02  # Default value if not enough data
    
    # Calculate Average True Range (ATR) as volatility measure
    true_ranges = []
    
    for i in range(1, min(lookback, len(close_prices))):
        high = high_prices[i] if i < len(high_prices) else close_prices[i]
        low = low_prices[i] if i < len(low_prices) else close_prices[i]
        prev_close = close_prices[i-1]
        
        tr1 = abs(high - low)
        tr2 = abs(high - prev_close)
        tr3 = abs(low - prev_close)
        
        true_ranges.append(max(tr1, tr2, tr3))
    
    atr = sum(true_ranges) / len(true_ranges) if true_ranges else 0.02
    volatility = atr / close_prices[-1]  # Normalize by current price
    
    return max(0.005, min(0.05, volatility))  # Cap between 0.5% and 5%

@app.post("/backtest")
async def backtest(request: Request):
    """Endpoint for backtesting model performance"""
    try:
        data = await request.json()
        historical_data = data.get("historical_data", [])
        
        if not historical_data:
            raise HTTPException(status_code=400, detail="Historical data is required")
        
        # Convert to DataFrame for easier processing
        df = pd.DataFrame(historical_data)
        
        # Implement backtesting logic
        results = {
            "total_trades": 0,
            "winning_trades": 0,
            "losing_trades": 0,
            "win_rate": 0,
            "profit_factor": 0,
            "average_profit": 0,
            "average_loss": 0,
            "max_drawdown": 0,
            "detailed_trades": []
        }
        
        # Placeholder for detailed backtesting logic
        # In a real implementation, this would simulate trades using the model
        
        return results
    
    except Exception as e:
        logger.error(f"Backtesting error: {str(e)}")
        sentry_sdk.capture_exception(e)
        raise HTTPException(status_code=500, detail=f"Backtesting failed: {str(e)}")

@app.post("/finetune")
async def finetune_model(request: Request):
    """Endpoint to trigger model fine-tuning with new data"""
    try:
        data = await request.json()
        training_data = data.get("training_data", [])
        
        if not training_data or len(training_data) < 100:
            raise HTTPException(status_code=400, detail="Insufficient training data")
        
        # In a real implementation, this would:
        # 1. Process the new training data
        # 2. Perform incremental model training
        # 3. Save the updated model
        
        return {"status": "success", "message": "Model fine-tuning started"}
    
    except Exception as e:
        logger.error(f"Fine-tuning error: {str(e)}")
        sentry_sdk.capture_exception(e)
        raise HTTPException(status_code=500, detail=f"Fine-tuning failed: {str(e)}")

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", 8000)), log_level="info")