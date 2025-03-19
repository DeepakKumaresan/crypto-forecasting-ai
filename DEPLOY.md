# Deployment Guide for Crypto Forecasting AI

This guide contains detailed instructions for deploying the Crypto Forecasting AI application on Render.com.

## Prerequisites

- A [Render.com](https://render.com) account
- A [Bitget](https://www.bitget.com) account with API credentials
- Git repository with your project code

## Deployment Steps

### 1. Deploy the ML API Service

1. Log in to your Render.com account
2. Navigate to the Dashboard and click "New" > "Web Service"
3. Connect your Git repository
4. Configure the service:
   - **Name**: `crypto-forecasting-ml-api`
   - **Environment**: Python 3
   - **Build Command**: `pip install -r ml/requirements.txt`
   - **Start Command**: `cd ml/api && uvicorn main:app --host 0.0.0.0 --port $PORT`
   - **Root Directory**: `/`
   - **Environment Variables**:
     - `PYTHON_VERSION`: `3.10.11`
     - `MODEL_PATH`: `/opt/render/project/src/ml/models/trading_model.h5`
     - `SCALER_PATH`: `/opt/render/project/src/ml/models/scaler.pkl`
     - `SENTRY_DSN`: Your Sentry DSN (if using Sentry)
5. Click "Create Web Service"

### 2. Deploy the Backend Service

1. From your Render.com dashboard, click "New" > "Web Service"
2. Connect your Git repository (same as above)
3. Configure the service:
   - **Name**: `crypto-forecasting-backend`
   - **Environment**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Root Directory**: `/backend`
   - **Environment Variables**:
     - `NODE_ENV`: `production`
     - `PORT`: `8080`
     - `BITGET_API_KEY`: Your Bitget API key
     - `BITGET_SECRET_KEY`: Your Bitget secret key
     - `BITGET_PASSPHRASE`: Your Bitget passphrase
     - `JWT_SECRET`: A secure random string for JWT authentication
     - `ML_API_URL`: The URL of your ML API service (e.g., `https://crypto-forecasting-ml-api.onrender.com`)
     - `ALLOWED_ORIGINS`: Frontend URL (comma-separated if multiple)
     - `SENTRY_DSN`: Your Sentry DSN (if using Sentry)
4. Click "Create Web Service"

### 3. Deploy the Frontend

1. From your Render.com dashboard, click "New" > "Static Site"
2. Connect your Git repository (same as above)
3. Configure the service:
   - **Name**: `crypto-forecasting-frontend`
   - **Build Command**: `cd frontend && npm install && npm run build`
   - **Publish Directory**: `frontend/build`
   - **Environment Variables**:
     - `REACT_APP_API_URL`: The URL of your backend service (e.g., `https://crypto-forecasting-backend.onrender.com`)
     - `REACT_APP_SENTRY_DSN`: Your Sentry DSN for frontend (if using Sentry)
4. Click "Create Static Site"

## Post-Deployment Steps

### Train and Upload ML Model

Since the ML model