import dotenv from 'dotenv';
import pkg from 'pg';
import logger from '../utils/logger.js';

// Load environment variables first
dotenv.config();

const { Pool } = pkg;

// Parse connection string if provided (for Neon)
const parseConnectionString = (connectionString) => {
  if (!connectionString) return null;
  
  try {
    const url = new URL(connectionString);
    return {
      host: url.hostname,
      port: parseInt(url.port) || 5432,
      database: url.pathname.slice(1), // Remove leading slash
      user: url.username,
      password: url.password,
      ssl: {
        rejectUnauthorized: false,
        sslmode: 'require'
      }
    };
  } catch (error) {
    logger.error('Error parsing connection string:', error);
    return null;
  }
};

// Get configuration from environment
const getConfig = () => {
  // Priority: DATABASE_URL (Neon) > individual env vars
  if (process.env.DATABASE_URL) {
    const parsed = parseConnectionString(process.env.DATABASE_URL);
    if (parsed) return parsed;
  }
  
  // Fallback to individual environment variables
  return {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    database: process.env.DB_NAME || 'cronicas_civilizacion',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password',
    ssl: process.env.DB_SSL === 'true' ? {
      rejectUnauthorized: false,
      sslmode: 'require'
    } : false
  };
};

const config = getConfig();

const pool = new Pool({
  ...config,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
  // Add connection retry logic
  allowExitOnIdle: false,
  // Keep connections alive longer
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000
});

// Test database connection
pool.on('connect', () => {
  logger.info('✅ Connected to PostgreSQL database');
  if (config.ssl) {
    logger.info('🔒 SSL connection enabled');
  }
});

pool.on('error', (err) => {
  logger.error('❌ PostgreSQL connection error:', err);
  // Don't exit on error, let the pool handle reconnection
});

// Handle pool errors gracefully
pool.on('acquire', (client) => {
  logger.debug('Client acquired from pool');
});

pool.on('release', (client) => {
  logger.debug('Client released to pool');
});

// Function to test connection and reconnect if needed
export const testConnection = async () => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    return true;
  } catch (error) {
    logger.error('Database connection test failed:', error.message);
    return false;
  }
};

// Function to get a client with retry logic
export const getClient = async (retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const client = await pool.connect();
      return client;
    } catch (error) {
      logger.warn(`Failed to get client (attempt ${i + 1}/${retries}):`, error.message);
      if (i === retries - 1) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    }
  }
};

export default pool; 