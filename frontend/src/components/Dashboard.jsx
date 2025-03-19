import React, { useState, useEffect } from 'react';
import TradingView from './TradingView';
import TradeList from './TradeList';
import Controls from './Controls';
import { fetchMarketData, subscribeToTradeSignals } from '../services/api';

const Dashboard = () => {
  const [marketData, setMarketData] = useState([]);
  const [tradeSignals, setTradeSignals] = useState([]);
  const [isAutoTrading, setIsAutoTrading] = useState(false);
  const [selectedPair, setSelectedPair] = useState('BTCUSDT');
  const [activeTrades, setActiveTrades] = useState([]);
  const [profitLoss, setProfitLoss] = useState({
    totalProfit: 0,
    todayProfit: 0,
    winRate: 0,
  });

  // Fetch initial market data
  useEffect(() => {
    const fetchData = async () => {
      try {
        const data = await fetchMarketData();
        setMarketData(data);
      } catch (error) {
        console.error('Failed to fetch market data:', error);
      }
    };

    fetchData();

    // Set up WebSocket connection for real-time updates
    const unsubscribe = subscribeToTradeSignals((signal) => {
      setTradeSignals((prevSignals) => {
        // Filter out duplicate signals (same pair, direction, and timeframe)
        const isDuplicate = prevSignals.some(
          (s) => 
            s.pair === signal.pair && 
            s.direction === signal.direction && 
            s.timeframe === signal.timeframe &&
            // Only consider as duplicate if within last 15 minutes
            new Date(s.time).getTime() > new Date().getTime() - 15 * 60 * 1000
        );
        
        if (isDuplicate) return prevSignals;
        
        // Add the new signal with timestamp
        return [...prevSignals, { ...signal, time: new Date().toISOString() }];
      });
    });

    // Clean up WebSocket connection on component unmount
    return () => {
      unsubscribe();
    };
  }, []);

  // Update profit/loss calculations whenever active trades change
  useEffect(() => {
    const calculateProfitLoss = () => {
      const totalProfit = activeTrades.reduce(
        (sum, trade) => sum + (trade.profitLoss || 0), 
        0
      );
      
      const todayTrades = activeTrades.filter(
        (trade) => new Date(trade.closeTime).toDateString() === new Date().toDateString()
      );
      
      const todayProfit = todayTrades.reduce(
        (sum, trade) => sum + (trade.profitLoss || 0), 
        0
      );
      
      const completedTrades = activeTrades.filter(trade => trade.status === 'closed');
      const winningTrades = completedTrades.filter(trade => trade.profitLoss > 0);
      const winRate = completedTrades.length > 0 
        ? (winningTrades.length / completedTrades.length) * 100 
        : 0;
      
      setProfitLoss({
        totalProfit,
        todayProfit,
        winRate: Math.round(winRate * 100) / 100,
      });
    };
    
    calculateProfitLoss();
  }, [activeTrades]);

  const handleToggleAutoTrading = () => {
    setIsAutoTrading(!isAutoTrading);
  };

  const handleSelectPair = (pair) => {
    setSelectedPair(pair);
  };

  const handleExecuteTrade = async (signal, isManual = false) => {
    // Only execute if auto-trading is on or if manually triggered
    if (!isAutoTrading && !isManual) return;
    
    try {
      // In a real implementation, this would call your API to execute the trade
      console.log(`Executing ${isManual ? 'manual' : 'auto'} trade:`, signal);
      
      // Add trade to active trades with pending status
      const newTrade = {
        id: `trade-${Date.now()}`,
        pair: signal.pair,
        direction: signal.direction,
        entryPrice: signal.price,
        time: new Date().toISOString(),
        stopLoss: signal.stopLoss,
        takeProfit: signal.takeProfit,
        status: 'pending',
        isManual,
      };
      
      setActiveTrades((prevTrades) => [...prevTrades, newTrade]);
      
      // In a real app, you would update this trade based on actual execution from your API
      setTimeout(() => {
        setActiveTrades((prevTrades) => 
          prevTrades.map(trade => 
            trade.id === newTrade.id 
              ? { ...trade, status: 'open', executedPrice: signal.price } 
              : trade
          )
        );
      }, 1000);
    } catch (error) {
      console.error('Failed to execute trade:', error);
    }
  };

  const handleCloseTrade = async (tradeId) => {
    try {
      // In a real implementation, this would call your API to close the trade
      console.log(`Closing trade: ${tradeId}`);
      
      // Update trade status to 'closing'
      setActiveTrades((prevTrades) => 
        prevTrades.map(trade => 
          trade.id === tradeId 
            ? { ...trade, status: 'closing' } 
            : trade
        )
      );
      
      // Simulate trade closing with a profit/loss calculation
      setTimeout(() => {
        setActiveTrades((prevTrades) => 
          prevTrades.map(trade => {
            if (trade.id === tradeId) {
              // Simulate a profit/loss value
              const profitLoss = trade.direction === 'LONG' 
                ? (Math.random() * 5) + 1  // Positive for demo purposes
                : (Math.random() * 5) + 1;
                
              return { 
                ...trade, 
                status: 'closed', 
                closeTime: new Date().toISOString(),
                profitLoss,
              };
            }
            return trade;
          })
        );
      }, 1000);
    } catch (error) {
      console.error('Failed to close trade:', error);
    }
  };

  return (
    <div className="dashboard-container">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <TradingView 
            selectedPair={selectedPair}
            onSelectPair={handleSelectPair}
          />
        </div>
        <div className="lg:col-span-1">
          <Controls 
            isAutoTrading={isAutoTrading} 
            onToggleAutoTrading={handleToggleAutoTrading}
            profitLoss={profitLoss}
          />
          <TradeList 
            signals={tradeSignals}
            activeTrades={activeTrades}
            onExecuteTrade={handleExecuteTrade}
            onCloseTrade={handleCloseTrade}
            isAutoTrading={isAutoTrading}
          />
        </div>
      </div>
    </div>
  );
};

export default Dashboard;