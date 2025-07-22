import { Pool } from 'pg';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

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

console.log('🚀 Starting Neon database migration...');
console.log(`📡 Connecting to: ${config.host}:${config.port}/${config.database}`);

const pool = new Pool(config);

async function migrateDatabase() {
  const client = await pool.connect();
  
  try {
    console.log('✅ Connected to Neon database');
    
    // Read the SQL file
    const sqlPath = join(__dirname, '../database/init.sql');
    const sqlContent = readFileSync(sqlPath, 'utf8');
    
    console.log('📖 Reading migration file...');
    
    // Split SQL into individual statements
    const allStatements = sqlContent
      .split(';')
      .map(stmt => stmt.trim())
      .filter(stmt => stmt.length > 0 && !stmt.startsWith('--'));
    
    // Separate statements by type
    const createTableStatements = allStatements.filter(stmt => 
      stmt.toUpperCase().startsWith('CREATE TABLE') || 
      stmt.toUpperCase().startsWith('CREATE EXTENSION')
    );
    
    const functionStatements = allStatements.filter(stmt => 
      stmt.toUpperCase().startsWith('CREATE OR REPLACE FUNCTION')
    );
    
    const indexStatements = allStatements.filter(stmt => 
      stmt.toUpperCase().startsWith('CREATE INDEX')
    );
    
    const triggerStatements = allStatements.filter(stmt => 
      stmt.toUpperCase().startsWith('CREATE TRIGGER')
    );
    
    const insertStatements = allStatements.filter(stmt => 
      stmt.toUpperCase().startsWith('INSERT INTO')
    );
    
    console.log(`🔧 Executing ${createTableStatements.length} CREATE TABLE statements...`);
    
    // Step 1: Create tables and extensions
    for (let i = 0; i < createTableStatements.length; i++) {
      const statement = createTableStatements[i];
      try {
        await client.query(statement);
        console.log(`✅ Table/Extension ${i + 1}/${createTableStatements.length} created successfully`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`⚠️  Table/Extension ${i + 1}/${createTableStatements.length} already exists`);
        } else {
          console.error(`❌ Error creating table/extension ${i + 1}/${createTableStatements.length}:`, error.message);
          throw error;
        }
      }
    }
    
    console.log(`🔧 Executing ${functionStatements.length} function statements...`);
    
    // Step 2: Create functions
    for (let i = 0; i < functionStatements.length; i++) {
      const statement = functionStatements[i];
      try {
        await client.query(statement);
        console.log(`✅ Function ${i + 1}/${functionStatements.length} created successfully`);
      } catch (error) {
        console.log(`⚠️  Function ${i + 1}/${functionStatements.length} already exists or error:`, error.message);
      }
    }
    
    console.log(`🔧 Executing ${indexStatements.length} index statements...`);
    
    // Step 3: Create indexes
    for (let i = 0; i < indexStatements.length; i++) {
      const statement = indexStatements[i];
      try {
        await client.query(statement);
        console.log(`✅ Index ${i + 1}/${indexStatements.length} created successfully`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`⚠️  Index ${i + 1}/${indexStatements.length} already exists`);
        } else {
          console.log(`⚠️  Index ${i + 1}/${indexStatements.length} error:`, error.message);
        }
      }
    }
    
    console.log(`🔧 Executing ${triggerStatements.length} trigger statements...`);
    
    // Step 4: Create triggers
    for (let i = 0; i < triggerStatements.length; i++) {
      const statement = triggerStatements[i];
      try {
        await client.query(statement);
        console.log(`✅ Trigger ${i + 1}/${triggerStatements.length} created successfully`);
      } catch (error) {
        if (error.message.includes('already exists')) {
          console.log(`⚠️  Trigger ${i + 1}/${triggerStatements.length} already exists`);
        } else {
          console.log(`⚠️  Trigger ${i + 1}/${triggerStatements.length} error:`, error.message);
        }
      }
    }
    
    console.log(`🔧 Executing ${insertStatements.length} insert statements...`);
    
    // Step 5: Insert sample data
    for (let i = 0; i < insertStatements.length; i++) {
      const statement = insertStatements[i];
      try {
        await client.query(statement);
        console.log(`✅ Sample data ${i + 1}/${insertStatements.length} inserted successfully`);
      } catch (error) {
        if (error.message.includes('duplicate key') || error.message.includes('already exists')) {
          console.log(`⚠️  Sample data ${i + 1}/${insertStatements.length} already exists`);
        } else {
          console.log(`⚠️  Sample data ${i + 1}/${insertStatements.length} error:`, error.message);
        }
      }
    }
    
    console.log('🎉 Database migration completed successfully!');
    console.log('📊 Tables created:');
    console.log('   - users');
    console.log('   - players');
    console.log('   - player_stats');
    console.log('   - games');
    console.log('   - game_players');
    console.log('   - player_resources');
    console.log('   - map_tiles');
    console.log('   - cities');
    console.log('   - armies');
    console.log('   - game_history');
    console.log('   - ai_narratives');
    console.log('   - chat_messages');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run migration
migrateDatabase(); 