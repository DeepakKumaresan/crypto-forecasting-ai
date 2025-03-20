import React from 'react';
import { useTradingContext } from '../context/TradingContext';

/**
 * AutoTrading component to toggle automatic trading.
 * Displays status and a toggle switch for enabling/disabling auto trading.
 */
const AutoTrading = () => {
  const { isAutoTradingEnabled, toggleAutoTrading, isConnected } = useTradingContext();

  return (
    <div className="bg-white dark:bg-gray-800 shadow rounded-lg p-4 mb-4">
      <h2 className="text-lg font-semibold text-gray-800 dark:text-white mb-4">
        Auto Trading
      </h2>
      
      <div className="flex items-center justify-between">
        <div>
          <p className="text-gray-600 dark:text-gray-300">
            Status: 
            <span className={`ml-2 font-medium ${isAutoTradingEnabled ? 'text-green-500' : 'text-red-500'}`}>
              {isAutoTradingEnabled ? 'Enabled' : 'Disabled'}
            </span>
          </p>
          
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {isAutoTradingEnabled 
              ? 'AI is automatically executing trades based on signals' 
              : 'Manual trading mode - you need to execute trades yourself'}
          </p>
        </div>
        
        <div className="relative inline-block w-12 mr-2 align-middle select-none">
          <input 
            type="checkbox" 
            name="toggle" 
            id="autoTradeToggle" 
            className="sr-only"
            checked={isAutoTradingEnabled}
            onChange={toggleAutoTrading}
            disabled={!isConnected}
          />
          <label 
            htmlFor="autoTradeToggle" 
            className={`block overflow-hidden h-6 rounded-full bg-gray-300 cursor-pointer ${!isConnected ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <span 
              className={`block h-6 w-6 rounded-full bg-white border-2 transform transition-transform duration-200 ease-in ${isAutoTradingEnabled ? 'translate-x-6 border-green-500' : 'translate-x-0 border-red-500'}`}
            />
          </label>
        </div>
      </div>
      
      {!isConnected && (
        <div className="mt-2 p-2 bg-yellow-100 dark:bg-yellow-800 text-yellow-700 dark:text-yellow-200 text-sm rounded">
          <i className="fas fa-exclamation-triangle mr-2"></i>
          WebSocket disconnected. Auto-trading unavailable until reconnected.
        </div>
      )}
      
      <div className="mt-4">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">Auto Trading Features:</h3>
        <ul className="mt-2 text-sm text-gray-600 dark:text-gray-400 list-disc pl-5">
          <li>AI-filtered trade signals with high accuracy</li>
          <li>Automatic stop loss and take profit optimization</li>
          <li>No duplicate signals per timeframe</li>
          <li>Risk management to prevent losses</li>
        </ul>
      </div>
    </div>
  );
};

export default AutoTrading;