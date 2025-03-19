import React, { useState } from 'react';

const TradeList = ({ signals, activeTrades, onExecuteTrade, onCloseTrade, isAutoTrading }) => {
  const [activeTab, setActiveTab] = useState('signals');
  const [countdownTimers, setCountdownTimers] = useState({});

  const startCountdown = (signalId) => {
    // Initialize 20 second countdown
    setCountdownTimers(prev => ({
      ...prev,
      [signalId]: 20
    }));

    // Update countdown every second
    const interval = setInterval(() => {
      setCountdownTimers(prev => {
        const newTime = prev[signalId] - 1;
        if (newTime <= 0) {
          clearInterval(interval);
        }
        return {
          ...prev,
          [signalId]: Math.max(0, newTime)
        };
      });
    }, 1000);

    // Auto-clear after 20 seconds
    setTimeout(() => {
      clearInterval(interval);
    }, 21000);
  };

  const handleManualExecute = (signal) => {
    // Start the countdown timer
    startCountdown(signal.id || `${signal.pair}-${signal.direction}-${Date.now()}`);
    // Execute the trade
    onExecuteTrade(signal, true);
  };

  const formatTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', { 
      hour: '2-digit', 
      minute: '2-digit',
      second: '2-digit'
    });
  };

  const formatDate = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: '2-digit'
    });
  };

  return (
    <div className="trade-list bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md mt-4">
      <div className="flex mb-4 border-b border-gray-200 dark:border-gray-700">
        <button
          className={`py-2 px-4 ${
            activeTab === 'signals'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 dark:text-gray-400'
          }`}
          onClick={() => setActiveTab('signals')}
        >
          Trade Signals
        </button>
        <button
          className={`py-2 px-4 ${
            activeTab === 'active'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 dark:text-gray-400'
          }`}
          onClick={() => setActiveTab('active')}
        >
          Active Trades
        </button>
        <button
          className={`py-2 px-4 ${
            activeTab === 'history'
              ? 'text-blue-600 border-b-2 border-blue-600'
              : 'text-gray-500 dark:text-gray-400'
          }`}
          onClick={() => setActiveTab('history')}
        >
          Trade History
        </button>
      </div>

      {activeTab === 'signals' && (
        <div className="overflow-y-auto max-h-96">
          {signals.length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400 py-4">
              No trade signals available
            </p>
          ) : (
            signals.map((signal, index) => (
              <div
                key={`${signal.pair}-${signal.direction}-${index}`}
                className="border-b border-gray-200 dark:border-gray-700 py-3 flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center space-x-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        signal.direction === 'LONG' ? 'bg-green-500' : 'bg-red-500'
                      }`}
                    ></span>
                    <span className="font-medium">{signal.pair}</span>
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        signal.direction === 'LONG'
                          ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                          : 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'
                      }`}
                    >
                      {signal.direction}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {formatTime(signal.time)}
                    </span>
                  </div>
                  <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    <span>Entry: ${signal.price?.toFixed(2)}</span>
                    <span className="ml-2">SL: ${signal.stopLoss?.toFixed(2)}</span>
                    <span className="ml-2">TP: ${signal.takeProfit?.toFixed(2)}</span>
                  </div>
                  <div className="mt-1 text-xs">
                    <span className="text-blue-600 dark:text-blue-400">
                      AI Confidence: {signal.confidence || 'High'}
                    </span>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  {isAutoTrading ? (
                    <span className="text-xs text-gray-500 dark:text-gray-400">Auto-executing</span>
                  ) : (
                    <>
                      <button
                        className="bg-blue-600 text-white text-xs px-3 py-1 rounded hover:bg-blue-700 transition-colors"
                        onClick={() => handleManualExecute(signal)}
                        disabled={countdownTimers[signal.id] !== undefined && countdownTimers[signal.id] > 0}
                      >
                        Execute
                      </button>
                      {countdownTimers[signal.id] !== undefined && countdownTimers[signal.id] > 0 && (
                        <span className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {countdownTimers[signal.id]}s to enter
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {activeTab === 'active' && (
        <div className="overflow-y-auto max-h-96">
          {activeTrades.filter(trade => trade.status !== 'closed').length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400 py-4">
              No active trades
            </p>
          ) : (
            activeTrades
              .filter(trade => trade.status !== 'closed')
              .map((trade) => (
                <div
                  key={trade.id}
                  className="border-b border-gray-200 dark:border-gray-700 py-3 flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          trade.direction === 'LONG' ? 'bg-green-500' : 'bg-red-500'
                        }`}
                      ></span>
                      <span className="font-medium">{trade.pair}</span>
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          trade.direction === 'LONG'
                            ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                            : 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'
                        }`}
                      >
                        {trade.direction}
                      </span>
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          trade.status === 'pending'
                            ? 'bg-yellow-100 dark:bg-yellow-900 text-yellow-700 dark:text-yellow-300'
                            : trade.status === 'open'
                            ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                            : 'bg-blue-100 dark:bg-blue-900 text-blue-700 dark:text-blue-300'
                        }`}
                      >
                        {trade.status.toUpperCase()}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <span>Entry: ${trade.entryPrice?.toFixed(2)}</span>
                      <span className="ml-2">SL: ${trade.stopLoss?.toFixed(2)}</span>
                      <span className="ml-2">TP: ${trade.takeProfit?.toFixed(2)}</span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(trade.time)} {formatTime(trade.time)} | {trade.isManual ? 'Manual' : 'Auto'}
                    </div>
                  </div>
                  <div className="flex flex-col items-end">
                    {trade.status !== 'closing' && (
                      <button
                        className="bg-red-600 text-white text-xs px-3 py-1 rounded hover:bg-red-700 transition-colors"
                        onClick={() => onCloseTrade(trade.id)}
                      >
                        Close
                      </button>
                    )}
                    {trade.status === 'closing' && (
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        Closing...
                      </span>
                    )}
                  </div>
                </div>
              ))
          )}
        </div>
      )}

      {activeTab === 'history' && (
        <div className="overflow-y-auto max-h-96">
          {activeTrades.filter(trade => trade.status === 'closed').length === 0 ? (
            <p className="text-center text-gray-500 dark:text-gray-400 py-4">
              No trade history
            </p>
          ) : (
            activeTrades
              .filter(trade => trade.status === 'closed')
              .map((trade) => (
                <div
                  key={trade.id}
                  className="border-b border-gray-200 dark:border-gray-700 py-3 flex items-center justify-between"
                >
                  <div>
                    <div className="flex items-center space-x-2">
                      <span
                        className={`w-2 h-2 rounded-full ${
                          trade.direction === 'LONG' ? 'bg-green-500' : 'bg-red-500'
                        }`}
                      ></span>
                      <span className="font-medium">{trade.pair}</span>
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          trade.direction === 'LONG'
                            ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                            : 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'
                        }`}
                      >
                        {trade.direction}
                      </span>
                      <span
                        className={`text-xs px-2 py-1 rounded ${
                          trade.profitLoss > 0
                            ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300'
                            : 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'
                        }`}
                      >
                        {trade.profitLoss > 0 ? 'PROFIT' : 'LOSS'}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <span>Entry: ${trade.entryPrice?.toFixed(2)}</span>
                      <span className="ml-2">
                        P&L: {trade.profitLoss > 0 ? '+' : ''}${trade.profitLoss?.toFixed(2)}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(trade.time)} {formatTime(trade.time)} | {trade.isManual ? 'Manual' : 'Auto'}
                    </div>
                  </div>
                </div>
              ))
          )}
        </div>
      )}
    </div>
  );
};

export default TradeList;