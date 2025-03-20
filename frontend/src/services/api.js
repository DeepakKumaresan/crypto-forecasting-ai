import axios from 'axios';

// Create axios instance with base URL from environment variables
const apiClient = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor for adding auth token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

// Response interceptor for handling errors
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    // Handle token expiration
    if (error.response && error.response.status === 401) {
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// List of filtered pairs (10 large-cap and 30 mid-cap USDT pairs)
export const filteredPairs = {
  largeCap: [
    'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'XRPUSDT', 'SOLUSDT', 
    'ADAUSDT', 'DOGEUSDT', 'TRXUSDT', 'AVAXUSDT', 'DOTUSDT'
  ],
  midCap: [
    'LINKUSDT', 'MATICUSDT', 'UNIUSDT', 'LTCUSDT', 'ATOMUSDT',
    'ETCUSDT', 'APTUSDT', 'FILUSDT', 'NEARUSDT', 'INJUSDT',
    'ICPUSDT', 'FTMUSDT', 'SANDUSDT', 'FLRUSDT', 'APEUSDT',
    'AAVEUSDT', 'XLMUSDT', 'ALGOUSDT', 'AXSUSDT', 'OPUSDT',
    'CAKEUSDT', 'GRTUSDT', 'MANAUSDT', 'ROSEUSDT', 'RUNEUSDT', 
    'EGLDUSDT', 'MKRUSDT', 'COMPUSDT', 'SUSHIUSDT', 'SNXUSDT'
  ],
  // All filtered pairs combined
  all: []
};

// Combine large-cap and mid-cap pairs for easier access
filteredPairs.all = [...filteredPairs.largeCap, ...filteredPairs.midCap];

// API service methods
export const api = {
  // Auth endpoints
  login: (credentials) => apiClient.post('/auth/login', credentials),
  register: (userData) => apiClient.post('/auth/register', userData),
  logout: () => {
    localStorage.removeItem('auth_token');
    return Promise.resolve();
  },
  
  // Trading endpoints
  get: (endpoint) => apiClient.get(endpoint),
  post: (endpoint, data) => apiClient.post(endpoint, data),
  put: (endpoint, data) => apiClient.put(endpoint, data),
  delete: (endpoint) => apiClient.delete(endpoint),
  
  // Specific trading methods
  getTrades: () => apiClient.get('/trades'),
  getStats: () => apiClient.get('/stats'),
  
  // Get filtered trading pairs
  getPairs: () => {
    // Return only the filtered pairs from our predefined list
    return Promise.resolve({ 
      data: {
        largeCap: filteredPairs.largeCap,
        midCap: filteredPairs.midCap,
        all: filteredPairs.all
      }
    });
  },
  
  // Get specific pairs by category
  getLargeCapPairs: () => Promise.resolve({ data: filteredPairs.largeCap }),
  getMidCapPairs: () => Promise.resolve({ data: filteredPairs.midCap }),

  // ✅ Fallback API for market data (filter to only include our 40 pairs)
  getFallbackMarketData: () => 
    apiClient.get('/market/fallback').then(response => {
      // Filter the response to only include our 40 selected pairs
      if (response.data && Array.isArray(response.data)) {
        response.data = response.data.filter(item => 
          filteredPairs.all.includes(item.pair || item.symbol)
        );
      }
      return response;
    }),
  
  // WebSocket connection
  subscribeToMarketData: (callback) => {
    const wsUrl = process.env.REACT_APP_WS_URL || 'ws://localhost:5000/ws';
    const socket = new WebSocket(wsUrl);
    
    socket.onopen = () => {
      console.log('WebSocket connection established');
      // Send auth token if needed
      const token = localStorage.getItem('auth_token');
      if (token) {
        socket.send(JSON.stringify({ type: 'auth', token }));
      }
      
      // Subscribe only to our filtered pairs
      socket.send(JSON.stringify({ 
        type: 'subscribe', 
        pairs: filteredPairs.all 
      }));
    };
    
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        
        // Only process data for our filtered pairs
        if (data.pair && filteredPairs.all.includes(data.pair)) {
          callback(data);
        } else if (data.type === 'signals' && Array.isArray(data.signals)) {
          // For signal arrays, filter to include only our desired pairs
          data.signals = data.signals.filter(signal => 
            filteredPairs.all.includes(signal.pair)
          );
          callback(data);
        } else {
          // For other data types, pass through without filtering
          callback(data);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };
    
    socket.onerror = (error) => {
      console.error('WebSocket error:', error);
    };
    
    socket.onclose = (event) => {
      console.log('WebSocket connection closed:', event.code, event.reason);
      // Auto-reconnect after 5 seconds
      setTimeout(() => {
        if (socket.readyState === WebSocket.CLOSED) {
          console.log('Attempting to reconnect WebSocket...');
          api.subscribeToMarketData(callback);
        }
      }, 5000);
    };
    
    // Return methods to send messages and close connection
    return {
      send: (message) => {
        if (socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify(message));
        } else {
          console.error('WebSocket is not open. Cannot send message.');
        }
      },
      close: () => {
        socket.close();
      }
    };
  }
};

export default api;