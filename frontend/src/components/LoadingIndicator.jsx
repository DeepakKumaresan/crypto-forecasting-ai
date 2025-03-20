import React from 'react';

const LoadingIndicator = ({ size = 'md', color = 'primary', text = 'Loading...', fullScreen = false }) => {
  // Size classes
  const sizeClasses = {
    sm: 'w-6 h-6',
    md: 'w-10 h-10',
    lg: 'w-16 h-16',
    xl: 'w-24 h-24'
  };
  
  // Color classes
  const colorClasses = {
    primary: 'text-blue-600',
    secondary: 'text-gray-600',
    success: 'text-green-600',
    danger: 'text-red-600',
    warning: 'text-yellow-600',
    info: 'text-cyan-600'
  };
  
  const containerClasses = fullScreen 
    ? 'fixed inset-0 flex items-center justify-center bg-gray-900 bg-opacity-50 z-50' 
    : 'flex flex-col items-center justify-center';
  
  return (
    <div className={containerClasses}>
      <div className="flex flex-col items-center">
        <svg 
          className={`animate-spin ${sizeClasses[size]} ${colorClasses[color]}`} 
          xmlns="http://www.w3.org/2000/svg" 
          fill="none" 
          viewBox="0 0 24 24"
        >
          <circle 
            className="opacity-25" 
            cx="12" 
            cy="12" 
            r="10" 
            stroke="currentColor" 
            strokeWidth="4"
          ></circle>
          <path 
            className="opacity-75" 
            fill="currentColor" 
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          ></path>
        </svg>
        
        {text && (
          <span className={`mt-3 ${fullScreen ? 'text-white' : 'text-gray-700'} font-medium`}>
            {text}
          </span>
        )}
      </div>
    </div>
  );
};

export default LoadingIndicator;