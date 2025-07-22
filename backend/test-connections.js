import dotenv from 'dotenv';
import pkg from 'pg';
import { createClient } from 'redis';

// Load environment variables
dotenv.config();

const { Pool } = pkg;

async function testPostgreSQL() {
  console.log('🔄 Testing PostgreSQL connection...');
  
  // Parse connection string if provided (for Neon)
  const parseConnectionString = (connectionString) => {
    if (!connectionString) return null;
    
    try {
      const url = new URL(connectionString);
      return {
        host: url.hostname,
        port: parseInt(url.port) || 5432,
        database: url.pathname.slice(1),
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

  // Get configuration
  const getConfig = () => {
    if (process.env.DATABASE_URL) {
      const parsed = parseConnectionString(process.env.DATABASE_URL);
      if (parsed) return parsed;
    }
    
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
    connectionTimeoutMillis: 5000,
  });

  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW(), version()');
    console.log('✅ PostgreSQL connected successfully!');
    console.log(`   Time: ${result.rows[0].now}`);
    console.log(`   Version: ${result.rows[0].version.split(' ')[0]} ${result.rows[0].version.split(' ')[1]}`);
    client.release();
    
    // Test if tables exist
    const tablesResult = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);
    
    if (tablesResult.rows.length > 0) {
      console.log(`   Tables found: ${tablesResult.rows.length}`);
      console.log(`   Tables: ${tablesResult.rows.map(row => row.table_name).join(', ')}`);
    } else {
      console.log('⚠️  No tables found. Run the database initialization script:');
      console.log('   psql -U postgres -d cronicas_civilizacion -f setup-local-db.sql');
    }
    
    await pool.end();
    return true;
  } catch (error) {
    console.error('❌ PostgreSQL connection failed:', error.message);
    console.log('💡 Make sure PostgreSQL is running and database exists');
    return false;
  }
}

async function testRedis() {
  console.log('\n🔄 Testing Redis connection...');
  
  const redisClient = createClient({
    socket: {
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      connectTimeout: 5000,
    },
    password: process.env.REDIS_PASSWORD || undefined,
  });

  try {
    await redisClient.connect();
    await redisClient.ping();
    const info = await redisClient.info('server');
    const version = info.match(/redis_version:([^\r\n]+)/)?.[1] || 'unknown';
    
    console.log('✅ Redis connected successfully!');
    console.log(`   Version: ${version}`);
    console.log(`   Host: ${process.env.REDIS_HOST || 'localhost'}:${process.env.REDIS_PORT || 6379}`);
    
    await redisClient.disconnect();
    return true;
  } catch (error) {
    console.error('❌ Redis connection failed:', error.message);
    console.log('💡 Make sure Redis is running');
    console.log('   WSL: sudo service redis-server start');
    console.log('   Windows: Start Memurai service');
    return false;
  }
}

async function main() {
  console.log('🚀 Testing database connections for Cronicas de Civilizacion\n');
  
  const postgresOK = await testPostgreSQL();
  const redisOK = await testRedis();
  
  console.log('\n📊 Connection Summary:');
  console.log(`   PostgreSQL: ${postgresOK ? '✅ OK' : '❌ FAILED'}`);
  console.log(`   Redis: ${redisOK ? '✅ OK' : '❌ FAILED'}`);
  
  if (postgresOK && redisOK) {
    console.log('\n🎉 All connections successful! You can start the server with: npm run dev');
  } else {
    console.log('\n⚠️  Fix the failing connections before starting the server');
    process.exit(1);
  }
}

main().catch(console.error); 