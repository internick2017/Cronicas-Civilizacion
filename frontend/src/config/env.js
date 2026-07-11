// Environment configuration for frontend
export const API_BASE_URL = import.meta.env.VITE_API_URL || '';

export const config = {
  // API Configuration — empty string means same-origin; Vite proxies /api → backend
  api: {
    baseUrl: API_BASE_URL,
    timeout: import.meta.env.VITE_API_TIMEOUT || 10000
  },

  // Socket.io Configuration — connect to same origin so Vite proxy handles /socket.io
  socket: {
    url: typeof window !== 'undefined' ? window.location.origin : '',
    options: {
      transports: ['websocket'],
      autoConnect: false,
      timeout: import.meta.env.VITE_SOCKET_TIMEOUT || 5000
    }
  },
  
  // Application Configuration
  app: {
    name: import.meta.env.VITE_APP_NAME || 'Crónicas de Civilización',
    version: import.meta.env.VITE_APP_VERSION || '1.0.0',
    environment: import.meta.env.NODE_ENV || 'development'
  },
  
  // Feature Flags
  features: {
    enableDevTools: import.meta.env.VITE_ENABLE_DEV_TOOLS === 'true',
    enableAnalytics: import.meta.env.VITE_ENABLE_ANALYTICS === 'true',
    enableLogging: import.meta.env.VITE_ENABLE_LOGGING !== 'false'
  }
};

// Validate required environment variables
const requiredEnvVars = [];

const missingEnvVars = requiredEnvVars.filter(envVar => !import.meta.env[envVar]);

if (missingEnvVars.length > 0) {
  console.error('Missing required environment variables:', missingEnvVars);
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

export default config;