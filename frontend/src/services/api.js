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
  getPairs: () => apiClient.get('/pairs'),

  // ✅ Fallback API for market data
  getFallbackMarketData: () => apiClient.get('/market/fallback'),
  
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
    };
    
    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        callback(data);
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
