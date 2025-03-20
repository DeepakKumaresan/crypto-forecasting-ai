// frontend/src/utils/websocketHandler.js
import { API_BASE_URL } from '../services/api';

class WebSocketHandler {
  constructor(onMessageCallback, onErrorCallback, onCloseCallback) {
    this.socket = null;
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    this.reconnectTimeout = 2000; // Start with 2 seconds
    this.onMessageCallback = onMessageCallback;
    this.onErrorCallback = onErrorCallback;
    this.onCloseCallback = onCloseCallback;
    this.activeSymbols = new Set();
  }

  connect() {
    // Close existing connection if any
    if (this.socket) {
      this.socket.close();
    }

    // Create new WebSocket connection
    const wsUrl = API_BASE_URL.replace('http', 'ws') + '/websocket';
    this.socket = new WebSocket(wsUrl);

    this.socket.onopen = () => {
      console.log('WebSocket connection established');
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.reconnectTimeout = 2000;
      
      // Subscribe to active symbols
      if (this.activeSymbols.size > 0) {
        this.subscribeToSymbols(Array.from(this.activeSymbols));
      }
    };

    this.socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (this.onMessageCallback) {
          this.onMessageCallback(data);
        }
      } catch (error) {
        console.error('Error parsing WebSocket message:', error);
      }
    };

    this.socket.onerror = (error) => {
      console.error('WebSocket error:', error);
      if (this.onErrorCallback) {
        this.onErrorCallback(error);
      }
    };

    this.socket.onclose = (event) => {
      console.log('WebSocket connection closed:', event.code, event.reason);
      this.isConnected = false;
      
      if (this.onCloseCallback) {
        this.onCloseCallback(event);
      }
      
      // Attempt to reconnect
      this.reconnect();
    };
  }

  reconnect() {
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
      
      setTimeout(() => {
        this.connect();
      }, this.reconnectTimeout);
      
      // Exponential backoff
      this.reconnectTimeout = Math.min(this.reconnectTimeout * 1.5, 30000);
    } else {
      console.error('Maximum reconnection attempts reached. Please refresh the page.');
    }
  }

  disconnect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
      this.isConnected = false;
    }
  }

  subscribeToSymbols(symbols) {
    if (!Array.isArray(symbols)) {
      symbols = [symbols];
    }
    
    // Add symbols to active set
    symbols.forEach(symbol => this.activeSymbols.add(symbol));
    
    if (this.isConnected && symbols.length > 0) {
      const message = {
        type: 'subscribe',
        symbols: symbols,
        timeframe: '15m' // Default to 15m as per requirements
      };
      
      this.socket.send(JSON.stringify(message));
    }
  }

  unsubscribeFromSymbols(symbols) {
    if (!Array.isArray(symbols)) {
      symbols = [symbols];
    }
    
    // Remove symbols from active set
    symbols.forEach(symbol => this.activeSymbols.delete(symbol));
    
    if (this.isConnected && symbols.length > 0) {
      const message = {
        type: 'unsubscribe',
        symbols: symbols
      };
      
      this.socket.send(JSON.stringify(message));
    }
  }

  sendMessage(message) {
    if (this.isConnected) {
      this.socket.send(JSON.stringify(message));
    } else {
      console.error('Cannot send message. WebSocket is not connected.');
    }
  }
}

export default WebSocketHandler;