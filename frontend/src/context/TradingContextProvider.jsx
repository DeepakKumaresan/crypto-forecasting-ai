import React, { createContext, useState, useEffect, useCallback } from 'react';
import { initializeWebSocket } from '../utils/websocketClient';
import api from '../services/api';

export const TradingContext = createContext();

const TradingContextProvider = ({ children }) => {
  const [trades, setTrades] = useState([]);
  const [isAutoTrading, setIsAutoTrading] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [symbols, setSymbols] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');
  const [timeframe, setTimeframe] = useState('15m');
  const [availableTimeframes] = useState(['15m']);
  const [profitLoss, setProfitLoss] = useState(0);
  const [isConnected, setIsConnected] = useState(false);
  const [currentPrice, setCurrentPrice] = useState(null);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [timerActive, setTimerActive] = useState(false);

  // Connect to WebSocket and handle messages
  useEffect(() => {
    let wsClient;
    const connectWebSocket = async () => {
      try {
        wsClient = await initializeWebSocket({
          onMessage: handleWebSocketMessage,
          onConnect: () => setIsConnected(true),
          onDisconnect: () => setIsConnected(false),
          onError: (err) => setError(`WebSocket error: ${err.message}`)
        });
        
        // Subscribe to selected symbol
        if (wsClient && selectedSymbol) {
          wsClient.subscribe(selectedSymbol, timeframe);
        }
      } catch (err) {
        setError(`Failed to connect to WebSocket: ${err.message}`);
      }
    };

    connectWebSocket();

    return () => {
      if (wsClient) {
        wsClient.disconnect();
      }
    };
  }, [selectedSymbol, timeframe]);

  // Handle WebSocket messages
  const handleWebSocketMessage = useCallback((message) => {
    try {
      const data = JSON.parse(message);
      
      // Handle price updates
      if (data.type === 'price') {
        setCurrentPrice(data.price);
      }
      
      // Handle trade signals
      if (data.type === 'signal') {
        const newTrade = {
          id: Date.now().toString(),
          symbol: data.symbol,
          direction: data.direction,
          entryPrice: data.entryPrice,
          stopLoss: data.stopLoss,
          takeProfit: data.takeProfit,
          timestamp: new Date().toISOString(),
          status: 'pending',
          confidence: data.confidence || 0,
          timeframe: data.timeframe || timeframe
        };
        
        setTrades(prevTrades => [newTrade, ...prevTrades]);
        
        // Start timer for manual trading
        if (!isAutoTrading) {
          setTimerSeconds(20);
          setTimerActive(true);
        } else {
          // Execute trade automatically
          executeTrade(newTrade);
        }
      }
    } catch (err) {
      console.error('Error processing WebSocket message:', err);
    }
  }, [isAutoTrading, timeframe]);

  // Timer countdown effect
  useEffect(() => {
    let interval;
    if (timerActive && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds(prevSeconds => prevSeconds - 1);
      }, 1000);
    } else if (timerSeconds === 0) {
      setTimerActive(false);
    }
    return () => clearInterval(interval);
  }, [timerActive, timerSeconds]);

  // Execute trade via API
  const executeTrade = async (trade) => {
    setIsLoading(true);
    try {
      const response = await api.executeTrade({
        symbol: trade.symbol,
        direction: trade.direction,
        entryPrice: trade.entryPrice,
        stopLoss: trade.stopLoss,
        takeProfit: trade.takeProfit
      });
      
      // Update trade status
      setTrades(prevTrades => 
        prevTrades.map(t => 
          t.id === trade.id 
            ? { ...t, status: 'executed', orderId: response.orderId } 
            : t
        )
      );
    } catch (err) {
      setError(`Failed to execute trade: ${err.message}`);
      // Update trade status to failed
      setTrades(prevTrades => 
        prevTrades.map(t => 
          t.id === trade.id 
            ? { ...t, status: 'failed', error: err.message } 
            : t
        )
      );
    } finally {
      setIsLoading(false);
    }
  };

  // Toggle auto trading
  const toggleAutoTrading = () => {
    setIsAutoTrading(prev => !prev);
  };

  // Manual execution of trade
  const manualExecuteTrade = (tradeId) => {
    const trade = trades.find(t => t.id === tradeId);
    if (trade && trade.status === 'pending') {
      executeTrade(trade);
    }
  };

  // Fetch available symbols
  useEffect(() => {
    const fetchSymbols = async () => {
      try {
        const response = await api.getSymbols();
        setSymbols(response.symbols);
      } catch (err) {
        setError(`Failed to fetch symbols: ${err.message}`);
      }
    };

    fetchSymbols();
  }, []);

  // Calculate total profit/loss
  useEffect(() => {
    const calculateTotalPL = async () => {
      try {
        const response = await api.getProfitLoss();
        setProfitLoss(response.totalProfitLoss);
      } catch (err) {
        console.error('Failed to fetch profit/loss:', err);
      }
    };

    // Update every 30 seconds
    calculateTotalPL();
    const interval = setInterval(calculateTotalPL, 30000);
    
    return () => clearInterval(interval);
  }, []);

  const value = {
    trades,
    isAutoTrading,
    toggleAutoTrading,
    isLoading,
    error,
    symbols,
    selectedSymbol,
    setSelectedSymbol,
    timeframe,
    setTimeframe,
    availableTimeframes,
    profitLoss,
    isConnected,
    currentPrice,
    timerSeconds,
    timerActive,
    manualExecuteTrade,
    executeTrade
  };

  return (
    <TradingContext.Provider value={value}>
      {children}
    </TradingContext.Provider>
  );
};

export default TradingContextProvider;