import React from 'react';

const Footer = () => {
  return (
    <footer className="bg-gray-900 text-white py-6">
      <div className="container mx-auto px-4">
        <div className="flex flex-col md:flex-row justify-between items-center">
          <div className="mb-4 md:mb-0">
            <h3 className="text-lg font-semibold">Crypto Forecasting AI</h3>
            <p className="text-gray-400 text-sm">AI-powered trading signals & automation</p>
          </div>
          
          <div className="text-center md:text-right text-sm text-gray-400">
            <p>&copy; {new Date().getFullYear()} Crypto Forecasting AI. All rights reserved.</p>
            <p>Powered by AI + Bitget API</p>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;