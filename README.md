# Crypto Forecasting AI

An AI-powered cryptocurrency trading platform that provides high-accuracy trade signals and automated trading capabilities through Bitget API.

## Project Overview

This platform combines real-time market data from WebSockets with AI/ML models to filter and execute only high-probability trades. It features both automated and manual trading modes, with AI-optimized stop-loss and take-profit levels to maximize returns.

## Core Features

- **AI-Based Trade Filtering & Execution**: Only high-accuracy trades with auto-adjusted SL/TP
- **Real-Time WebSocket Data Streaming**: Instant market data from Bitget
- **Dual Trading Modes**: One-click toggle between automated and manual trading
- **AI-Optimized Risk Management**: Dynamic stop-loss and take-profit adjustments
- **15-Minute Candle Forecasting**: Focused timeframe for optimal results
- **Live Profit/Loss Tracking**: Real-time performance monitoring
- **Error Handling & Monitoring**: Integrated Sentry and Datadog for reliability

## Tech Stack

- **Frontend**: React.js (v18.2.0) with Tailwind CSS (v3.3.3)
- **Backend**: Node.js (v18.x) with Express.js (v4.18.2)
- **AI/ML**: Python (v3.10) with FastAPI (v0.103.1), TensorFlow (v2.13.0) and PyTorch (v2.0.1)
- **Data Handling**: WebSockets for Bitget API
- **Monitoring**: Sentry (v7.73.0) and Datadog

## Installation & Setup

### Prerequisites

- Node.js (v18.x or higher)
- Python 3.10 or higher
- Bitget API credentials
- Sentry and Datadog accounts (optional but recommended)

### Environment Setup

1. **Clone the repository**

```bash
git clone https://github.com/your-username/crypto-forecasting-ai.git
cd crypto-forecasting-ai
```

2. **Install root dependencies**

```bash
npm install
```

3. **Frontend Setup**

```bash
cd frontend
npm install
cp .env.example .env
```

Edit the `.env` file with your backend URL.

4. **Backend Setup**

```bash
cd ../backend
npm install
cp .env.example .env
```

Edit the `.env` file with your Bitget API credentials and other configuration.

5. **ML Setup**

```bash
cd ../ml
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

Edit the `.env` file with ML service configuration.

## Deployment on Render.com

This project is designed to be deployed on Render.com with the following services:

### Frontend Web Service
- **Build Command**: `cd frontend && npm install && npm run build`
- **Publish Directory**: `frontend/build`
- **Environment**: Static Site

### Backend Web Service
- **Build Command**: `cd backend && npm install`
- **Start Command**: `cd backend && node server.js`
- **Environment**: Node.js

### ML API Service
- **Build Command**: `cd ml && pip install -r requirements.txt`
- **Start Command**: `cd ml && uvicorn api.main:app --host 0.0.0.0 --port $PORT`
- **Environment**: Python 3

Ensure you set up the proper environment variables in Render's dashboard for each service.

## Development Workflow

1. **Running locally**

Start each service in separate terminals:

```bash
# Frontend
cd frontend
npm start

# Backend
cd backend
node server.js

# ML API
cd ml
uvicorn api.main:app --reload
```

2. **Testing**

```bash
# Frontend tests
cd frontend
npm test

# Backend tests
cd backend
npm test
```

## Project Structure

The project follows a modular structure:

- `/frontend`: React application with components, pages, and services
- `/backend`: Node.js server with controllers, services, and WebSocket handlers
- `/ml`: Python ML models, training scripts, and FastAPI server
- `/config`: Shared configuration files

## Security Considerations

- API keys and secrets are stored in environment variables
- WebSocket connections use secure protocols
- User authentication is required for all trading operations
- Sentry and Datadog monitor for unusual activity
