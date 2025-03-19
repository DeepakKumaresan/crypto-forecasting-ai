import React, { useEffect, useRef } from 'react';

const TradingView = ({ selectedPair, onSelectPair }) => {
  const containerRef = useRef(null);
  const widgetRef = useRef(null);
  
  const availablePairs = [
    'BTCUSDT', 'ETHUSDT', 'SOLUSDT', 'BNBUSDT', 'ADAUSDT',
    'DOGEUSDT', 'XRPUSDT', 'DOTUSDT', 'AVAXUSDT', 'LINKUSDT'
  ];

  useEffect(() => {
    if (!containerRef.current) return;

    const loadTradingViewWidget = () => {
      // Clear existing widget if exists
      if (widgetRef.current) {
        containerRef.current.innerHTML = '';
      }

      // Create script element
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/tv.js';
      script.async = true;
      script.onload = () => {
        if (window.TradingView) {
          widgetRef.current = new window.TradingView.widget({
            width: '100%',
            height: 500,
            symbol: `BITGET:${selectedPair}`,
            interval: '15',
            timezone: 'Etc/UTC',
            theme: 'dark',
            style: '1',
            locale: 'en',
            toolbar_bg: '#f1f3f6',
            enable_publishing: false,
            allow_symbol_change: true,
            container_id: containerRef.current.id,
          });
        }
      };
      document.head.appendChild(script);
    };

    // Generate a unique ID for the container
    if (!containerRef.current.id) {
      containerRef.current.id = `tradingview_${Math.random().toString(36).substring(2, 9)}`;
    }

    loadTradingViewWidget();

    return () => {
      // Clean up the widget when component unmounts
      if (widgetRef.current) {
        widgetRef.current = null;
      }
    };
  }, [selectedPair]);

  return (
    <div className="tradingview-container bg-white dark:bg-gray-800 p-4 rounded-lg shadow-md">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">
          {selectedPair} - 15m Chart
        </h2>
        <div className="flex space-x-2">
          {availablePairs.slice(0, 5).map((pair) => (
            <button
              key={pair}
              className={`px-2 py-1 text-sm rounded ${
                selectedPair === pair
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
              onClick={() => onSelectPair(pair)}
            >
              {pair.replace('USDT', '')}
            </button>
          ))}
          <select
            className="bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded px-2 py-1 text-sm"
            value={selectedPair}
            onChange={(e) => onSelectPair(e.target.value)}
          >
            <option value="" disabled>More pairs</option>
            {availablePairs.slice(5).map((pair) => (
              <option key={pair} value={pair}>
                {pair}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div
        ref={containerRef}
        className="tradingview-chart w-full h-96 bg-gray-100 dark:bg-gray-900"
      ></div>
    </div>
  );
};

export default TradingView;