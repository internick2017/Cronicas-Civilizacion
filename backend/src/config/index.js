import dotenv from 'dotenv';

dotenv.config();

// Dynamic configuration based on environment variables
const config = {
  database: {
    type: process.env.DATABASE_TYPE || 'postgresql',
    postgresql: {
      host: process.env.DB_HOST || 'localhost',
      port: process.env.DB_PORT || 5432,
      database: process.env.DB_NAME || 'cronicas_civilizacion',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
    },
    sqlite: {
      path: process.env.SQLITE_PATH || './data/cronicas.db'
    }
  },
  
  cache: {
    type: process.env.CACHE_TYPE || 'redis',
    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      password: process.env.REDIS_PASSWORD || undefined,
    }
  },
  
  server: {
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',
    frontendUrl: process.env.FRONTEND_URL || 'http://localhost:5173'
  },
  
  openai: {
    apiKey: process.env.OPENAI_API_KEY,
    model: process.env.OPENAI_MODEL || 'gpt-4'
  },
  
  jwt: {
    secret: process.env.JWT_SECRET || 'cronicas_jwt_secret_2024',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d'
  },
  
  game: {
    maxPlayers: parseInt(process.env.MAX_PLAYERS) || 8,
    mapSize: parseInt(process.env.MAP_SIZE) || 20,
    turnTimeout: parseInt(process.env.TURN_TIMEOUT) || 300000
  }
};

// Dynamic imports based on configuration
export async function getDatabaseConnection() {
  if (config.database.type === 'sqlite') {
    const { default: pool } = await import('./database-sqlite.js');
    return pool;
  } else {
    const { default: pool } = await import('./database.js');
    return pool;
  }
}

export async function getCacheConnection() {
  if (config.cache.type === 'memory' || config.database.type === 'sqlite') {
    const { default: redisClient } = await import('./redis-memory.js');
    await redisClient.connect();
    return redisClient;
  } else {
    const { default: redisClient } = await import('./redis.js');
    return redisClient;
  }
}

export default config; 