import Database from 'better-sqlite3';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create SQLite database connection
const dbPath = process.env.SQLITE_PATH || join(__dirname, '../../data/cronicas.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('foreign_keys = ON');

console.log('✅ Connected to SQLite database:', dbPath);

// SQLite doesn't support UUIDs natively, so we'll use strings
const initializeTables = () => {
  try {
    // Users table
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        username TEXT UNIQUE NOT NULL,
        email TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        civilization_name TEXT,
        is_active INTEGER DEFAULT 1,
        last_login DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Players table
    db.exec(`
      CREATE TABLE IF NOT EXISTS players (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        name TEXT NOT NULL,
        civilization_name TEXT NOT NULL,
        avatar TEXT,
        socket_id TEXT,
        is_online INTEGER DEFAULT 0,
        last_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Games table
    db.exec(`
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        name TEXT NOT NULL,
        max_players INTEGER DEFAULT 4,
        map_size INTEGER DEFAULT 20,
        game_mode TEXT DEFAULT 'domination',
        status TEXT DEFAULT 'waiting',
        current_turn INTEGER DEFAULT 0,
        current_player_index INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Game players (junction table)
    db.exec(`
      CREATE TABLE IF NOT EXISTS game_players (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        game_id TEXT REFERENCES games(id) ON DELETE CASCADE,
        player_id TEXT REFERENCES players(id) ON DELETE CASCADE,
        player_index INTEGER NOT NULL,
        joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(game_id, player_id),
        UNIQUE(game_id, player_index)
      )
    `);

    // Player resources table
    db.exec(`
      CREATE TABLE IF NOT EXISTS player_resources (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        game_id TEXT REFERENCES games(id) ON DELETE CASCADE,
        player_id TEXT REFERENCES players(id) ON DELETE CASCADE,
        food INTEGER DEFAULT 0,
        gold INTEGER DEFAULT 0,
        wood INTEGER DEFAULT 0,
        stone INTEGER DEFAULT 0,
        science INTEGER DEFAULT 0,
        culture INTEGER DEFAULT 0,
        army INTEGER DEFAULT 0,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(game_id, player_id)
      )
    `);

    // Map tiles table
    db.exec(`
      CREATE TABLE IF NOT EXISTS map_tiles (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        game_id TEXT REFERENCES games(id) ON DELETE CASCADE,
        x INTEGER NOT NULL,
        y INTEGER NOT NULL,
        terrain TEXT NOT NULL,
        resources TEXT DEFAULT '{}',
        owner_id TEXT REFERENCES players(id) ON DELETE SET NULL,
        discovered INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(game_id, x, y)
      )
    `);

    // Cities table
    db.exec(`
      CREATE TABLE IF NOT EXISTS cities (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        game_id TEXT REFERENCES games(id) ON DELETE CASCADE,
        tile_id TEXT REFERENCES map_tiles(id) ON DELETE CASCADE,
        owner_id TEXT REFERENCES players(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        population INTEGER DEFAULT 100,
        founded_turn INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Game history table
    db.exec(`
      CREATE TABLE IF NOT EXISTS game_history (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        game_id TEXT REFERENCES games(id) ON DELETE CASCADE,
        player_id TEXT REFERENCES players(id) ON DELETE CASCADE,
        turn_number INTEGER NOT NULL,
        action_type TEXT NOT NULL,
        action_data TEXT NOT NULL,
        description TEXT,
        effects TEXT DEFAULT '[]',
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Chat messages table
    db.exec(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
        game_id TEXT REFERENCES games(id) ON DELETE CASCADE,
        player_id TEXT REFERENCES players(id) ON DELETE CASCADE,
        message_type TEXT DEFAULT 'public',
        target_player_id TEXT REFERENCES players(id) ON DELETE CASCADE,
        message_text TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert sample data
    const checkPlayers = db.prepare('SELECT COUNT(*) as count FROM players').get();
    if (checkPlayers.count === 0) {
      db.exec(`
        INSERT INTO players (name, civilization_name, avatar, is_online) VALUES
        ('Jugador Demo', 'Imperio Romano', '👑', 1),
        ('IA Básica', 'Civilización Maya', '🏛️', 1)
      `);
      
      db.exec(`
        INSERT INTO games (name, max_players, map_size, game_mode, status) VALUES
        ('Partida de Prueba', 4, 20, 'domination', 'waiting')
      `);
    }

    console.log('✅ SQLite tables initialized successfully');
  } catch (error) {
    console.error('❌ Error initializing SQLite tables:', error);
  }
};

// Initialize tables on startup
initializeTables();

// Create a PostgreSQL-like query interface for compatibility
const pool = {
  query: (text, params = []) => {
    try {
      if (text.includes('RETURNING') || text.startsWith('INSERT') || text.startsWith('UPDATE') || text.startsWith('DELETE')) {
        const stmt = db.prepare(text);
        const result = stmt.run(...params);
        return { rows: [{ id: result.lastInsertRowid }], rowCount: result.changes };
      } else {
        const stmt = db.prepare(text);
        const rows = stmt.all(...params);
        return { rows, rowCount: rows.length };
      }
    } catch (error) {
      console.error('Database query error:', error);
      throw error;
    }
  },
  
  connect: () => ({
    query: pool.query,
    release: () => {}
  }),
  
  end: () => db.close()
};

export default pool; 