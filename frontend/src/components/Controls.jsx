import React, { useState, useEffect } from 'react';
import { api } from '../services/api';

const Controls = ({ onToggleAutoTrading, isAutoTrading, onManualTrade }) => {
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [selectedPair, setSelectedPair] = useState('BTC/USDT');
  const [selectedDirection, setSelectedDirection] = useState('long');
  const [availablePairs, setAvailablePairs] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Fetch available trading pairs
    const fetchPairs = async () => {
      try {
        const response = await api.get('/pairs');
        setAvailablePairs(response.data);
      } catch (error) {
        console.error("Failed to fetch trading pairs:", error);
      }
    };

    fetchPairs();
  }, []);

  useEffect(() => {
    let timer;
    if (timeRemaining > 0) {
      timer = setTimeout(() => {
        setTimeRemaining(timeRemaining - 1);
      }, 1000);
    }
    return () => clearTimeout(timer);
  }, [timeRemaining]);

  const handleToggleAutoTrading = () => {
    onToggleAutoTrading(!isAutoTrading);
  };

  const handleManualTrade = async () => {
    setIsLoading(true);
    try {
      await onManualTrade(selectedPair, selectedDirection);
      // Start the timer for manual trading
      setTimeRemaining(20);
    } catch (error) {
      console.error("Error executing manual trade:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="bg-gray-800 p-4 rounded-lg shadow-md">
      <h2 className="text-xl font-bold text-white mb-4">Trading Controls</h2>
      
      <div className="flex flex-col space-y-4 mb-6">
        <div className="flex items-center justify-between">
          <span className="text-white">Auto Trading:</span>
          <button
            onClick={handleToggleAutoTrading}
            className={`px-4 py-2 rounded-md font-bold ${
              isAutoTrading 
                ? 'bg-green-500 hover:bg-green-600' 
                : 'bg-red-500 hover:bg-red-600'
            } transition-colors duration-200`}
          >
            {isAutoTrading ? 'Enabled' : 'Disabled'}
          </button>
        </div>
      </div>

      <div className="border-t border-gray-700 pt-4 mb-4">
        <h3 className="text-lg font-semibold text-white mb-2">Manual Trading</h3>
        
        <div className="flex flex-col space-y-4">
          <div>
            <label className="block text-white mb-1">Trading Pair</label>
            <select
              value={selectedPair}
              onChange={(e) => setSelectedPair(e.target.value)}
              className="w-full p-2 bg-gray-700 text-white rounded-md"
              disabled={timeRemaining > 0 || isLoading}
            >
              {availablePairs.map((pair) => (
                <option key={pair} value={pair}>{pair}</option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-white mb-1">Direction</label>
            <select
              value={selectedDirection}
              onChange={(e) => setSelectedDirection(e.target.value)}
              className="w-full p-2 bg-gray-700 text-white rounded-md"
              disabled={timeRemaining > 0 || isLoading}
            >
              <option value="long">Long</option>
              <option value="short">Short</option>
            </select>
          </div>
          
          <button
            onClick={handleManualTrade}
            disabled={timeRemaining > 0 || isLoading}
            className={`w-full p-3 rounded-md font-bold ${
              timeRemaining > 0 || isLoading
                ? 'bg-gray-600 cursor-not-allowed'
                : 'bg-blue-500 hover:bg-blue-600'
            } transition-colors duration-200`}
          >
            {isLoading ? 'Processing...' : timeRemaining > 0 ? `Wait (${timeRemaining}s)` : 'Execute Trade'}
          </button>
        </div>
      </div>
      
      {timeRemaining > 0 && (
        <div className="bg-blue-900 p-3 rounded-md mt-4">
          <p className="text-white font-semibold">
            Manual trade window open: {timeRemaining} seconds remaining
          </p>
          <p className="text-blue-300 text-sm">
            Enter your trade on Bitget within the remaining time
          </p>
        </div>
      )}
    </div>
  );
};

export default Controls;