import React from 'react';
import { Link, useLocation } from 'react-router-dom';

const Header = () => {
  const location = useLocation();
  
  return (
    <header className="bg-gray-900 text-white shadow-lg">
      <div className="container mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Link to="/" className="text-xl font-bold">
              Crypto Forecasting AI
            </Link>
          </div>
          
          <nav className="hidden md:flex space-x-4">
            <Link 
              to="/" 
              className={`px-3 py-2 rounded-md ${location.pathname === '/' ? 'bg-blue-700' : 'hover:bg-gray-700'}`}
            >
              Home
            </Link>
            <Link 
              to="/trading" 
              className={`px-3 py-2 rounded-md ${location.pathname === '/trading' ? 'bg-blue-700' : 'hover:bg-gray-700'}`}
            >
              Trading Dashboard
            </Link>
          </nav>
          
          <div className="md:hidden">
            {/* Mobile menu button - in a real app, this would toggle a mobile menu */}
            <button className="text-gray-400 hover:text-white focus:outline-none">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;