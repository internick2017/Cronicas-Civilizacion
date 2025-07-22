import pkg from 'pg';
import dotenv from 'dotenv';

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
    console.error('Error parsing connection string:', error);
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
});

// Test database connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
  if (config.ssl) {
    console.log('🔒 SSL connection enabled');
  }
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL connection error:', err);
});

export default pool; 