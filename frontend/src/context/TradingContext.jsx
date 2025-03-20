import React, { createContext, useContext, useState, useEffect } from 'react';
import WebSocketClient from '../utils/websocketClient';
import api from '../services/api';

// Create context
const TradingContext = createContext(null);

// Custom hook to use the trading context
export const useTradingContext = () => useContext(TradingContext);

export const TradingProvider = ({ children }) => {
  // State for trade signals
  const [tradeSignals, setTradeSignals] = useState([]);
  
  // State for active trades
  const [activeTrades, setActiveTrades] = useState([]);
  
  // State for trade history
  const [tradeHistory, setTradeHistory] = useState([]);
  
  // State for the selected symbol
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');
  
  // State for available symbols
  const [availableSymbols, setAvailableSymbols] = useState([]);
  
  // State for auto trading
  const [isAutoTradingEnabled, setIsAutoTradingEnabled] = useState(false);
  
  // State for WebSocket connection status
  const [isConnected, setIsConnected] = useState(false);
  
  // State for loading status
  const [isLoading, setIsLoading] = useState(true);
  
  // State for errors
  const [error, setError] = useState(null);
  
  // WebSocket client
  const [wsClient, setWsClient] = useState(null);

  // Initialize WebSocket when component mounts
  useEffect(() => {
    const WEBSOCKET_URL = process.env.REACT_APP_WS_URL || 'ws://localhost:5000/ws';
    
    const handleWebSocketMessage = (data) => {
      if (data.type === 'trade_signal') {
        // Handle new trade signal
        setTradeSignals(prev => [data.signal, ...prev].slice(0, 50));
      } else if (data.type === 'market_update') {
        // Handle market update
        // You might update price data or other market information
      } else if (data.type === 'trade_executed') {
        // Handle trade execution confirmation
        setActiveTrades(prev => {
          // Add the new trade to active trades
          return [data.trade, ...prev];
        });
      } else if (data.type === 'trade_closed') {
        // Handle trade closure
        setActiveTrades(prev => prev.filter(trade => trade.id !== data.trade.id));
        setTradeHistory(prev => [data.trade, ...prev].slice(0, 50));
      }
    };
    
    const handleWebSocketOpen = () => {
      setIsConnected(true);
      setError(null);
      
      // Subscribe to the selected symbol
      wsClient.subscribe([selectedSymbol]);
    };
    
    const handleWebSocketClose = () => {
      setIsConnected(false);
    };
    
    const handleWebSocketError = (error) => {
      setError(`WebSocket error: ${error.message}`);
      setIsConnected(false);
    };
    
    const client = new WebSocketClient(
      WEBSOCKET_URL,
      handleWebSocketMessage,
      handleWebSocketOpen,
      handleWebSocketClose,
      handleWebSocketError
    );
    
    setWsClient(client);
    client.connect();
    
    // Cleanup on unmount
    return () => {
      if (client) {
        client.disconnect();
      }
    };
  }, []);

  // Effect to subscribe to a different symbol when selectedSymbol changes
  useEffect(() => {
    if (wsClient && isConnected) {
      // Unsubscribe from all current symbols
      if (availableSymbols.length > 0) {
        wsClient.unsubscribe(availableSymbols);
      }
      
      // Subscribe to the new symbol
      wsClient.subscribe([selectedSymbol]);
    }
  }, [selectedSymbol, wsClient, isConnected, availableSymbols]);

  // Effect to fetch available symbols on mount
  useEffect(() => {
    const fetchSymbols = async () => {
      try {
        setIsLoading(true);
        const response = await api.getAvailableSymbols();
        setAvailableSymbols(response.data);
        setIsLoading(false);
      } catch (err) {
        setError(`Failed to fetch symbols: ${err.message}`);
        setIsLoading(false);
      }
    };
    
    fetchSymbols();
  }, []);

  // Effect to fetch initial data (active trades, trade history)
  useEffect(() => {
    const fetchInitialData = async () => {
      try {
        setIsLoading(true);
        
        // Fetch active trades
        const activeTradesResponse = await api.getActiveTrades();
        setActiveTrades(activeTradesResponse.data);
        
        // Fetch trade history
        const tradeHistoryResponse = await api.getTradeHistory();
        setTradeHistory(tradeHistoryResponse.data);
        
        setIsLoading(false);
      } catch (err) {
        setError(`Failed to fetch initial data: ${err.message}`);
        setIsLoading(false);
      }
    };
    
    fetchInitialData();
  }, []);

  // Handle toggling auto trading
  const toggleAutoTrading = async () => {
    try {
      const newState = !isAutoTradingEnabled;
      
      // Call API to update auto trading state on the backend
      await api.setAutoTrading(newState);
      
      // Update local state
      setIsAutoTradingEnabled(newState);
    } catch (err) {
      setError(`Failed to toggle auto trading: ${err.message}`);
    }
  };

  // Execute a trade manually
  const executeManualTrade = async (symbol, direction, amount) => {
    try {
      const response = await api.executeTrade(symbol, direction, amount);
      
      // Update active trades if successful
      if (response.data.success) {
        setActiveTrades(prev => [response.data.trade, ...prev]);
      }
      
      return response.data;
    } catch (err) {
      setError(`Failed to execute trade: ${err.message}`);
      throw err;
    }
  };

  // Close a trade manually
  const closeManualTrade = async (tradeId) => {
    try {
      const response = await api.closeTrade(tradeId);
      
      // Update active trades and history if successful
      if (response.data.success) {
        setActiveTrades(prev => prev.filter(trade => trade.id !== tradeId));
        setTradeHistory(prev => [response.data.trade, ...prev].slice(0, 50));
      }
      
      return response.data;
    } catch (err) {
      setError(`Failed to close trade: ${err.message}`);
      throw err;
    }
  };

  const updateStopLossAndTakeProfit = async (tradeId, stopLoss, takeProfit) => {
    try {
      const response = await api.updateTradeSettings(tradeId, { stopLoss, takeProfit });
      
      // Update trade in active trades if successful
      if (response.data.success) {
        setActiveTrades(prev => prev.map(trade => 
          trade.id === tradeId ? { ...trade, stopLoss, takeProfit } : trade
        ));
      }
      
      return response.data;
    } catch (err) {
      setError(`Failed to update stop loss and take profit: ${err.message}`);
      throw err;
    }
  };

  // The value to be provided to consumers of this context
  const value = {
    tradeSignals,
    activeTrades,
    tradeHistory,
    selectedSymbol,
    setSelectedSymbol,
    availableSymbols,
    isAutoTradingEnabled,
    toggleAutoTrading,
    executeManualTrade,
    closeManualTrade,
    updateStopLossAndTakeProfit,
    isConnected,
    isLoading,
    error,
    wsClient
  };

  return (
    <TradingContext.Provider value={value}>
      {children}
    </TradingContext.Provider>
  );
};

export default TradingContext;