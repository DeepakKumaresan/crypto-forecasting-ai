import React, { useState, useEffect } from 'react';
import Dashboard from '../components/Dashboard';
import TradingView from '../components/TradingView';
import TradeList from '../components/TradeList';
import Controls from '../components/Controls';
import { api } from '../services/api';
import Header from '../components/Header';
import Footer from '../components/Footer';

const Trading = () => {
  const [isAutoTrading, setIsAutoTrading] = useState(false);
  const [trades, setTrades] = useState([]);
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [stats, setStats] = useState({
    totalTrades: 0,
    successfulTrades: 0,
    profitLoss: 0,
    winRate: 0,
  });

  // Fetch trades and stats
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      try {
        const [tradesResponse, statsResponse] = await Promise.all([
          api.get('/trades'),
          api.get('/stats')
        ]);
        
        setTrades(tradesResponse.data);
        setStats(statsResponse.data);
        setError(null);
      } catch (err) {
        console.error("Error fetching data:", err);
        setError("Failed to load trading data. Please try again later.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
    
    // Set up polling for real-time updates
    const intervalId = setInterval(fetchData, 30000); // Fetch every 30 seconds
    
    return () => clearInterval(intervalId);
  }, []);

  // Handle toggling auto trading
  const handleToggleAutoTrading = async (enabled) => {
    try {
      await api.post('/trading/auto', { enabled });
      setIsAutoTrading(enabled);
    } catch (err) {
      console.error("Failed to toggle auto trading:", err);
      setError("Failed to update auto trading settings. Please try again.");
    }
  };

  // Handle manual trade execution
  const handleManualTrade = async (pair, direction) => {
    try {
      const response = await api.post('/trading/manual', { 
        pair, 
        direction 
      });
      
      // Add the new trade to the list
      setTrades(prevTrades => [response.data, ...prevTrades]);
      
      return response.data;
    } catch (err) {
      console.error("Failed to execute manual trade:", err);
      throw new Error("Failed to execute trade. Please try again.");
    }
  };

  // Handle symbol change from TradingView
  const handleSymbolChange = (symbol) => {
    setSelectedSymbol(symbol);
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      <Header />
      
      <main className="container mx-auto px-4 py-8">
        {error && (
          <div className="bg-red-600 text-white p-4 rounded-md mb-6">
            {error}
          </div>
        )}
        
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left column - Dashboard and Controls */}
          <div className="lg:col-span-1 space-y-6">
            <Dashboard stats={stats} isLoading={isLoading} />
            <Controls 
              onToggleAutoTrading={handleToggleAutoTrading}
              isAutoTrading={isAutoTrading}
              onManualTrade={handleManualTrade}
            />
          </div>
          
          {/* Right Column - Chart and Trade List */}
          <div className="lg:col-span-2 space-y-6">
            <TradingView 
              symbol={selectedSymbol} 
              onSymbolChange={handleSymbolChange} 
            />
            <TradeList 
              trades={trades} 
              isLoading={isLoading} 
            />
          </div>
        </div>
      </main>
      
      <Footer />
    </div>
  );
};

export default Trading;