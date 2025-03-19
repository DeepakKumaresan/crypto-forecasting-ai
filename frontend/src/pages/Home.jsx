import React from 'react';
import { Link } from 'react-router-dom';

const Home = () => {
  const features = [
    {
      title: 'AI-Based Trade Filtering',
      description: 'Our AI filters out bad signals and removes duplicates, focusing only on high-accuracy trades.',
      icon: '🎯'
    },
    {
      title: 'Real-Time Market Data',
      description: 'WebSockets stream real-time market data for the most relevant USDT pairs.',
      icon: '⚡'
    },
    {
      title: 'Automated & Manual Trading',
      description: 'Choose between fully automated trading or manual execution with a 20-second timer.',
      icon: '🤖'
    },
    {
      title: 'Dynamic Stop Loss & Take Profit',
      description: 'AI-optimized SL & TP levels to maximize profits and minimize losses.',
      icon: '📈'
    },
    {
      title: '15-Minute Candle Focus',
      description: 'Specialized in 15-minute timeframe forecasting for optimal trading opportunities.',
      icon: '⏱️'
    },
    {
      title: 'Live Profit/Loss Tracking',
      description: 'Real-time monitoring of your trading performance with detailed analytics.',
      icon: '💰'
    }
  ];

  return (
    <div className="space-y-12">
      {/* Hero Section */}
      <section className="text-center py-12">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">Crypto Forecasting AI</h1>
        <p className="text-xl md:text-2xl text-gray-300 mb-8 max-w-3xl mx-auto">
          AI-powered cryptocurrency trading with high-accuracy signals and automated execution
        </p>
        <Link 
          to="/trading" 
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg text-lg transition-colors"
        >
          Launch Trading Dashboard
        </Link>
      </section>

      {/* Features Section */}
      <section className="py-12">
        <h2 className="text-3xl font-bold text-center mb-12">Key Features</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {features.map((feature, index) => (
            <div 
              key={index} 
              className="bg-gray-800 rounded-lg p-6 shadow-lg hover:shadow-xl transition-shadow"
            >
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h3 className="text-xl font-semibold mb-2">{feature.title}</h3>
              <p className="text-gray-300">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-gray-800 rounded-lg p-8 text-center">
        <h2 className="text-2xl md:text-3xl font-bold mb-4">Ready to start trading with AI?</h2>
        <p className="text-gray-300 mb-6 max-w-2xl mx-auto">
          Take advantage of our advanced AI models and real-time market data to execute profitable trades.
        </p>
        <Link 
          to="/trading" 
          className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-lg text-lg transition-colors"
        >
          Get Started Now
        </Link>
      </section>
    </div>
  );
};

export default Home;