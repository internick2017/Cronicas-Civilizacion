// Environment configuration for frontend
export const config = {
  // API Configuration
  api: {
    baseUrl: import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000',
    timeout: import.meta.env.VITE_API_TIMEOUT || 10000
  },
  
  // Socket.io Configuration
  socket: {
    url: import.meta.env.VITE_SOCKET_URL || 'http://localhost:3000',
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