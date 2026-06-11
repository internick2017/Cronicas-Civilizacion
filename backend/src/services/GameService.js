import Game from '../models/Game.js';
import Player from '../models/Player.js';
import aiService from './AIService.js';
import pool, { testConnection, getClient } from '../config/database.js';
import { safeRedisDel } from '../utils/redis.js';
import { NotFoundError, GameError, ConflictError } from '../utils/errors.js';
import logger from '../utils/logger.js';

/**
 * Game service for managing multiplayer civilization games
 * Handles game creation, player management, turn processing, and AI integration
 * Singleton pattern to ensure shared state across REST API and Socket
 */
let gameServiceInstance = null;

export class GameService {
  /**
   * Initialize the GameService with in-memory storage and database connection
   * Implements singleton pattern to ensure shared state
   */
  constructor() {
    // Return existing instance if it exists
    if (gameServiceInstance) {
      return gameServiceInstance;
    }
    
    // Keep games in memory for now (fallback when DB is not available)
    this.games = new Map();
    this.players = new Map();
    this.dbAvailable = false;
    this.redisClient = null;
    this.initializeDatabase();
    
    // Store instance for singleton pattern
    gameServiceInstance = this;
    return this;
  }

  /**
   * Get singleton instance of GameService
   * @returns {GameService} The singleton instance
   */
  static getInstance() {
    if (!gameServiceInstance) {
      new GameService();
    }
    return gameServiceInstance;
  }

  /**
   * Set the cache client instance
   * @param {Object} cacheClient - The cache client instance
   */
  setCacheClient(cacheClient) {
    this.redisClient = cacheClient;
  }

  /**
   * Initialize database connection and set availability flag
   * @private
   */
  async initializeDatabase() {
    try {
      // Test database connection
      await pool.query('SELECT 1');
      this.dbAvailable = true;
      logger.info('✅ Database connection established');
      
      // Load existing games from database
      await this.loadGamesFromDB();
    } catch (error) {
      logger.warn('⚠️ Database not available, using in-memory storage:', error.message);
      this.dbAvailable = false;
    }
  }

  /**
   * Get all active games with player information
   * @returns {Promise<Array>} Array of game objects with player lists
   */
  async getAllGames() {
    try {
      logger.info(`[GETALL] Getting all games. DB available: ${this.dbAvailable}, Memory games: ${this.games.size}`);
      
      // If database is not available, use in-memory storage
      if (!this.dbAvailable) {
        const memoryGames = Array.from(this.games.values()).map(game => ({
          id: game.id,
          name: game.name,
          status: game.status,
          players: game.players.length,
          maxPlayers: game.maxPlayers,
          gameMode: game.gameMode,
          createdAt: game.createdAt,
          playerList: game.players.map(p => ({
            id: p.id,
            name: p.name,
            civilizationName: p.civilizationName
          }))
        }));
        logger.info(`[GETALL] Returning ${memoryGames.length} games from memory`);
        return memoryGames;
      }

      const result = await pool.query(`
        SELECT g.*, 
               COUNT(gp.player_id) as player_count,
               COALESCE(
                 json_agg(
                   CASE WHEN p.id IS NOT NULL THEN
                     json_build_object(
                       'id', p.id,
                       'name', p.name,
                       'civilizationName', p.civilization_name
                     )
                   END
                 ) FILTER (WHERE p.id IS NOT NULL),
                 '[]'::json
               ) as players
        FROM games g
        LEFT JOIN game_players gp ON g.id = gp.game_id
        LEFT JOIN players p ON gp.player_id = p.id
        WHERE g.status != 'finished'
        GROUP BY g.id
        ORDER BY g.created_at DESC
      `);

      logger.info(`[GETALL] Database query returned ${result.rows.length} games`);
      
      const dbGames = result.rows.map(row => ({
        id: row.id,
        name: row.name,
        status: row.status,
        players: row.player_count || 0,
        maxPlayers: row.max_players,
        gameMode: row.game_mode,
        createdAt: row.created_at,
        playerList: row.players || []
      }));
      
      logger.info(`[GETALL] Returning ${dbGames.length} games from database`);
      return dbGames;
    } catch (error) {
      logger.error('Error getting games:', error);
      
      // Fallback to in-memory storage
      return Array.from(this.games.values()).map(game => ({
        id: game.id,
        name: game.name,
        status: game.status,
        players: game.players.length,
        maxPlayers: game.maxPlayers,
        gameMode: game.gameMode,
        createdAt: game.createdAt,
        playerList: game.players.map(p => ({
          id: p.id,
          name: p.name,
          civilization_name: p.civilizationName
        }))
      }));
    }
  }

  /**
   * Get a specific game by ID with caching
   * @param {string} gameId - Unique game identifier
   * @returns {Promise<Object|null>} Game object or null if not found
   */
  async getGameById(gameId) {
    try {
      logger.info(`[GETBYID] Getting game by ID: ${gameId}`);
      
      // Check memory first
      const game = this.games.get(gameId);
      if (game) {
        logger.info(`[GETBYID] Found game in memory: ${gameId}, players: ${game.players.length}`);
        return game.getState();
      }

      logger.info(`[GETBYID] Game not in memory, checking database...`);
      if (!this.dbAvailable) {
        logger.warn(`[GETBYID] Database not available for game: ${gameId}`);
        return null;
      }

      // Check cache first (with error handling)
      try {
        if (this.redisClient) {
          const cached = await this.redisClient.get(`game:${gameId}`);
          if (cached) {
            return JSON.parse(cached);
          }
        }
      } catch (cacheError) {
        logger.warn('Cache error, falling back to database:', cacheError.message);
      }

      logger.info(`[GETBYID] Executing database query for game: ${gameId}`);
      const result = await pool.query(`
        SELECT g.*, 
               json_agg(
                 json_build_object(
                   'id', p.id,
                   'name', p.name,
                   'civilizationName', p.civilization_name,
                   'isOnline', p.is_online,
                   'socketId', p.socket_id,
                   'lastSeen', p.last_seen,
                   'player_index', gp.player_index
                 ) ORDER BY gp.player_index
               ) as players
        FROM games g
        LEFT JOIN game_players gp ON g.id = gp.game_id
        LEFT JOIN players p ON gp.player_id = p.id
        WHERE g.id = $1
        GROUP BY g.id
      `, [gameId]);

      logger.info(`[GETBYID] Database query returned ${result.rows.length} rows`);
      
      if (result.rows.length === 0) {
        logger.warn(`[GETBYID] No game found in database for ID: ${gameId}`);
        return null;
      }

      const gameData = result.rows[0];
      logger.info(`[GETBYID] Database returned game: ${gameData.id}, players count: ${gameData.players?.length || 0}`);
      
      // Load game state from database or create new Game instance
      let gameInstance = this.games.get(gameId);
      if (!gameInstance) {
        // Load map from database first if it exists
        const savedMap = await this.loadMapFromDB(gameId);
        
        gameInstance = new Game({
          id: gameData.id,
          name: gameData.name,
          maxPlayers: gameData.max_players,
          mapSize: gameData.map_size,
          gameMode: gameData.game_mode,
          status: gameData.status,
          currentTurn: gameData.current_turn,
          currentPlayerIndex: gameData.current_player_index,
          map: savedMap  // Pass saved map directly to constructor
        });
        
        if (savedMap) {
          logger.info(`[GETBYID] Loaded saved map from database for game ${gameId}`);
          
          // Check if this is a playing game without starting cities (needs initialization)
          if (gameData.status === 'playing') {
            logger.info(`[GETBYID] Checking if playing game needs territory initialization`);
            const hasPlayerTerritories = this.checkMapHasPlayerTerritories(savedMap);
            logger.info(`[GETBYID] Has player territories: ${hasPlayerTerritories}`);
            if (!hasPlayerTerritories) {
              logger.info(`[GETBYID] Playing game without player territories detected, initializing starting positions`);
              this.initializeStartingPositions(gameInstance);
              // Save the updated map
              await this.saveMapToDB(gameInstance);
              logger.info(`[GETBYID] Starting positions initialized and saved to database`);
            }
          }
        } else {
          logger.info(`[GETBYID] No saved map found, using generated map for game ${gameId}`);
        }
        
        // Load players
        if (gameData.players && gameData.players.length > 0) {
          logger.info(`[GETBYID] Loading ${gameData.players.length} players from database`);
          gameInstance.players = gameData.players
            .filter(p => p && p.id) // Filter out null entries
            .map(p => {
              logger.info(`[GETBYID] Creating player: ${p.id} - ${p.civilizationName || p.civilization_name}`);
              const player = new Player({
                id: p.id,
                name: p.name,
                civilizationName: p.civilizationName || p.civilization_name
              });
              
              // Set correct online status from database
              player.isOnline = p.isOnline || false;
              if (p.socketId) {
                player.socketId = p.socketId;
              }
              if (p.lastSeen) {
                player.lastSeen = new Date(p.lastSeen);
              }
              
              return player;
            });
          logger.info(`[GETBYID] Successfully loaded ${gameInstance.players.length} players`);
        } else {
          logger.warn(`[GETBYID] No players found in database data`);
        }
        
        this.games.set(gameId, gameInstance);
        logger.info(`[GETBYID] Game instance created and stored in memory with ${gameInstance.players.length} players`);
      }

      const gameState = gameInstance.getState();
      
      // Cache the result (with error handling)
      try {
        if (this.redisClient) {
          await this.redisClient.setEx(`game:${gameId}`, 60, JSON.stringify(gameState));
        }
      } catch (cacheError) {
        logger.warn('Failed to cache game state:', cacheError.message);
      }
      
      return gameState;
    } catch (error) {
      logger.error('Error getting game by ID:', error);
      
      // Fallback to memory
      const game = this.games.get(gameId);
      return game ? game.getState() : null;
    }
  }

  /**
   * Create a new game with specified settings
   * @param {Object} gameData - Game configuration
   * @param {string} gameData.name - Game name
   * @param {number} [gameData.maxPlayers=4] - Maximum number of players
   * @param {number} [gameData.mapSize=20] - Map size (width/height)
   * @param {string} [gameData.gameMode='domination'] - Game mode
   * @returns {Promise<Object>} Created game object
   */
  async createGame(gameData) {
    try {
      const game = new Game(gameData);
      
      if (this.dbAvailable) {
        // Save to database
        const result = await pool.query(`
          INSERT INTO games (id, name, max_players, map_size, game_mode, status, current_turn, current_player_index)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING *
        `, [
          game.id,
          game.name,
          game.maxPlayers,
          game.mapSize,
          game.gameMode,
          game.status,
          game.currentTurn,
          game.currentPlayerIndex
        ]);

              // Clear cache
      await safeRedisDel(`game:${game.id}`);
      }

      // Store in memory
      this.games.set(game.id, game);
      
      return game.getState();
    } catch (error) {
      logger.error('Error creating game:', error);
      
      // Fallback to memory only
      const game = new Game(gameData);
      this.games.set(game.id, game);
      return game.getState();
    }
  }

  /**
   * Add a player to an existing game
   * @param {string} gameId - Game identifier
   * @param {string} playerId - Player identifier
   * @param {string} civilizationName - Player's civilization name
   * @returns {Promise<Object>} Updated game object
   * @throws {NotFoundError} When game not found
   * @throws {GameError} When game is full or already started
   */
  async joinGame(gameId, playerId, civilizationName) {
    try {
      logger.info(`[JOIN] Attempting to join game ${gameId} with player ${playerId}`);
      
      // First try to get from memory
      let game = this.games.get(gameId);
      logger.info(`[JOIN] Game in memory: ${!!game}`);
      
      // If not in memory, try to load from DB only if DB is available
      if (!game && this.dbAvailable) {
        try {
          logger.info(`[JOIN] Loading game from database...`);
          game = await this.loadGameFromDB(gameId);
          logger.info(`[JOIN] Game loaded from DB: ${!!game}`);
        } catch (dbError) {
          logger.warn('Database error in joinGame, continuing with memory-only mode:', dbError.message);
          this.dbAvailable = false; // Disable DB for this session
        }
      }
      
      if (!game) {
        logger.error(`[JOIN] Game not found: ${gameId}`);
        throw new NotFoundError('Game', gameId);
      }

      // Check if player already exists
      let player = this.players.get(playerId);
      if (!player) {
        logger.info(`[JOIN] Creating new player: ${playerId}`);
        // Create new player
        player = new Player({
          id: playerId,
          name: `Player ${this.players.size + 1}`,
          civilizationName
        });
        
        if (this.dbAvailable) {
          try {
            logger.info(`[JOIN] Saving player to database...`);
            // Save player to database
            await pool.query(`
              INSERT INTO players (id, name, civilization_name)
              VALUES ($1, $2, $3)
              ON CONFLICT (id) DO UPDATE SET
                civilization_name = $3,
                updated_at = CURRENT_TIMESTAMP
            `, [player.id, player.name, player.civilizationName]);
            logger.info(`[JOIN] Player saved to database successfully`);
          } catch (playerDbError) {
            logger.warn('Database error saving player, continuing with memory-only mode:', playerDbError.message);
            this.dbAvailable = false;
          }
        }
        
        this.players.set(player.id, player);
      } else {
        logger.info(`[JOIN] Player already exists, updating civilization name`);
        // Update civilization name
        player.civilizationName = civilizationName;
        
        if (this.dbAvailable) {
          try {
            await pool.query(`
              UPDATE players 
              SET civilization_name = $2, updated_at = CURRENT_TIMESTAMP
              WHERE id = $1
            `, [player.id, civilizationName]);
          } catch (updateError) {
            logger.warn('Database error updating player, continuing with memory-only mode:', updateError.message);
            this.dbAvailable = false;
          }
        }
      }

      // Add player to game
      const playerIndex = game.players.length;
      logger.info(`[JOIN] Adding player to game at index ${playerIndex}`);
      game.addPlayer(player);
      
      if (this.dbAvailable) {
        try {
          logger.info(`[JOIN] Saving game-player relationship to database...`);
          // Save game-player relationship
          await pool.query(`
            INSERT INTO game_players (game_id, player_id, player_index)
            VALUES ($1, $2, $3)
            ON CONFLICT (game_id, player_id) DO NOTHING
          `, [gameId, player.id, playerIndex]);

          // Update game in database
          await this.updateGameInDB(game);
          
          // Clear cache
          try {
            if (this.redisClient) {
              await this.redisClient.del(`game:${gameId}`);
            }
          } catch (cacheError) {
            logger.warn('Cache error:', cacheError.message);
          }
          
          logger.info(`[JOIN] Database operations completed successfully`);
        } catch (dbError) {
          logger.warn('Database error in final join operations, continuing with memory-only mode:', dbError.message);
          this.dbAvailable = false;
        }
      }
      
      logger.info(`[JOIN] Join completed successfully`);
      return {
        success: true,
        game: game.getState(),
        player: player
      };
    } catch (error) {
      logger.error('Error joining game:', error);
      throw error;
    }
  }

  async leaveGame(gameId, playerId) {
    try {
      const game = this.games.get(gameId);
      if (!game) {
        throw new NotFoundError('Game', gameId);
      }

      game.removePlayer(playerId);
      
      if (this.dbAvailable) {
        // Remove from database
        await pool.query(`
          DELETE FROM game_players 
          WHERE game_id = $1 AND player_id = $2
        `, [gameId, playerId]);

        // Update game in database
        await this.updateGameInDB(game);
        
        // Clear cache
        await safeRedisDel(`game:${gameId}`);
      }
      
      return {
        success: true,
        game: game.getState()
      };
    } catch (error) {
      logger.error('Error leaving game:', error);
      throw error;
    }
  }

  async deleteGame(gameId) {
    try {
      logger.info(`[DELETE] Attempting to delete game: ${gameId}`);
      
      // First try to get from memory
      let game = this.games.get(gameId);
      
      // If not in memory, try to load from DB
      if (!game && this.dbAvailable) {
        try {
          game = await this.loadGameFromDB(gameId);
        } catch (dbError) {
          logger.warn('Database error in deleteGame:', dbError.message);
          this.dbAvailable = false; // Disable DB for this operation
        }
      }
      
      if (!game) {
        throw new NotFoundError('Game', gameId);
      }

      // Only allow deletion of waiting games or games with no players
      if (game.status !== 'waiting' && game.players && game.players.length > 0) {
        throw new Error('Cannot delete active game with players');
      }

      // Remove from memory first
      this.games.delete(gameId);
      logger.info(`[DELETE] Game removed from memory: ${gameId}`);

      // Remove from database with retry logic
      if (this.dbAvailable) {
        try {
          // Test connection first
          const isConnected = await testConnection();
          if (!isConnected) {
            logger.warn('[DELETE] Database not connected, skipping DB deletion');
            return { success: true, message: 'Game deleted from memory only' };
          }

          // Get client with retry logic
          const client = await getClient();
          
          try {
            logger.info(`[DELETE] Starting database deletion for game: ${gameId}`);
            
            // Delete related data first (foreign key constraints)
            await client.query('DELETE FROM game_players WHERE game_id = $1', [gameId]);
            logger.info(`[DELETE] Deleted game_players for game: ${gameId}`);
            
            await client.query('DELETE FROM map_tiles WHERE game_id = $1', [gameId]);
            logger.info(`[DELETE] Deleted map_tiles for game: ${gameId}`);
            
            await client.query('DELETE FROM game_history WHERE game_id = $1', [gameId]);
            logger.info(`[DELETE] Deleted game_history for game: ${gameId}`);
            
            await client.query('DELETE FROM ai_narratives WHERE game_id = $1', [gameId]);
            logger.info(`[DELETE] Deleted ai_narratives for game: ${gameId}`);
            
            await client.query('DELETE FROM chat_messages WHERE game_id = $1', [gameId]);
            logger.info(`[DELETE] Deleted chat_messages for game: ${gameId}`);
            
            // Finally delete the game
            await client.query('DELETE FROM games WHERE id = $1', [gameId]);
            logger.info(`[DELETE] Deleted game from database: ${gameId}`);
            
            // Clear cache
            try {
              if (this.redisClient) {
                await this.redisClient.del(`game:${gameId}`);
                logger.info(`[DELETE] Cleared cache for game: ${gameId}`);
              }
            } catch (cacheError) {
              logger.warn('[DELETE] Cache error:', cacheError.message);
            }
            
            logger.info(`[DELETE] Successfully deleted game from database: ${gameId}`);
          } finally {
            client.release();
          }
        } catch (dbError) {
          logger.error('[DELETE] Database error deleting game:', dbError.message);
          // Don't disable DB completely, just log the error
          // The game was already removed from memory
        }
      }

      return { success: true, message: 'Game deleted successfully' };
    } catch (error) {
      logger.error('Error deleting game:', error);
      throw error;
    }
  }

  async clearAllGames() {
    try {
      logger.info('[CLEAR] Attempting to clear all games');
      
      // Get all game IDs from memory
      const gameIds = Array.from(this.games.keys());
      logger.info(`[CLEAR] Found ${gameIds.length} games in memory to delete`);
      
      // Delete each game individually
      const results = [];
      for (const gameId of gameIds) {
        try {
          const result = await this.deleteGame(gameId);
          results.push({ gameId, success: true, message: result.message });
          logger.info(`[CLEAR] Successfully deleted game: ${gameId}`);
        } catch (error) {
          results.push({ gameId, success: false, error: error.message });
          logger.error(`[CLEAR] Failed to delete game ${gameId}:`, error.message);
        }
      }
      
      // Clear memory completely
      this.games.clear();
      this.players.clear();
      logger.info('[CLEAR] Cleared all games from memory');
      
      // Clear database completely if available
      if (this.dbAvailable) {
        try {
          const isConnected = await testConnection();
          if (!isConnected) {
            logger.warn('[CLEAR] Database not connected, skipping DB cleanup');
            return { success: true, message: 'All games cleared from memory', results };
          }

          const client = await getClient();
          
          try {
            logger.info('[CLEAR] Starting complete database cleanup');
            
            // Delete all data from all tables
            await client.query('DELETE FROM game_players');
            await client.query('DELETE FROM map_tiles');
            await client.query('DELETE FROM game_history');
            await client.query('DELETE FROM ai_narratives');
            await client.query('DELETE FROM chat_messages');
            await client.query('DELETE FROM games');
            
            logger.info('[CLEAR] Successfully cleared all data from database');
          } finally {
            client.release();
          }
        } catch (dbError) {
          logger.error('[CLEAR] Database error during cleanup:', dbError.message);
        }
      }
      
      return { success: true, message: 'All games cleared successfully', results };
    } catch (error) {
      logger.error('Error clearing all games:', error);
      throw error;
    }
  }

  async startGame(gameId) {
    const startTime = Date.now();
    try {
      const game = this.games.get(gameId);
      if (!game) {
        throw new NotFoundError('Game', gameId);
      }

      // Debug log current game state
      logger.info(`[START] Game ${gameId} current state: status=${game.status}, players=${game.players.length}`);
      
      logger.info(`[START] Starting game initialization...`);
      game.startGame();
      logger.info(`[START] Game initialization completed in ${Date.now() - startTime}ms`);
      
      if (this.dbAvailable) {
        const dbStartTime = Date.now();
        logger.info(`[START] Updating database...`);
        
        // Update game in database (critical)
        await this.updateGameInDB(game);
        logger.info(`[START] Game updated in database`);
        
        // Clear cache
        await safeRedisDel(`game:${gameId}`);
        
        // Save map to database asynchronously (non-blocking)
        this.saveMapToDB(game).then(() => {
          logger.info(`[START] Map saved to database in ${Date.now() - dbStartTime}ms`);
        }).catch(error => {
          logger.error('Error saving map to database:', error);
        });
        
        logger.info(`[START] Critical database operations completed in ${Date.now() - dbStartTime}ms`);
      }
      
      logger.info(`[START] Total game start time: ${Date.now() - startTime}ms`);
      
      return {
        success: true,
        game: game.getState()
      };
    } catch (error) {
      logger.error('Error starting game:', error);
      throw error;
    }
  }

  /**
   * Process a player's game action and update game state
   * @param {string} gameId - Game identifier
   * @param {string} playerId - Player identifier
   * @param {Object} action - Action object with type and parameters
   * @returns {Promise<Object>} Action result with game state updates
   * @throws {NotFoundError} When game or player not found
   * @throws {GameError} When action is invalid or not player's turn
   */
  async processAction(gameId, playerId, action) {
    try {
      const game = this.games.get(gameId);
      if (!game) {
        throw new NotFoundError('Game', gameId);
      }

      const player = game.players.find(p => p.id === playerId);
      if (!player) {
        throw new NotFoundError('Player', playerId);
      }

      const result = game.processAction(playerId, action);
      
      // Generate AI narrative for the action
      const narrative = await aiService.generateActionNarrative(
        { action, player, result },
        {
          currentTurn: game.currentTurn,
          mapSize: game.mapSize,
          totalPlayers: game.players.length
        }
      );
      
      if (this.dbAvailable) {
        // Update game in database
        await this.updateGameInDB(game);
        
        // Save action to history
        await pool.query(`
          INSERT INTO game_history (game_id, player_id, action_type, action_data, turn_number, narrative)
          VALUES ($1, $2, $3, $4, $5, $6)
        `, [gameId, playerId, action.type, JSON.stringify(action), game.currentTurn, narrative.narrative]);
        
        // Clear cache
        await safeRedisDel(`game:${gameId}`);
      }
      
      return {
        success: true,
        action: result,
        game: game.getState(),
        narrative: narrative
      };
    } catch (error) {
      logger.error('Error processing action:', error);
      throw error;
    }
  }

  async getGameState(gameId) {
    return await this.getGameById(gameId);
  }

  async getPlayerView(gameId, playerId) {
    try {
      const game = this.games.get(gameId) || await this.loadGameFromDB(gameId);
      if (!game) {
        throw new NotFoundError('Game', gameId);
      }

      return game.getPlayerView(playerId);
    } catch (error) {
      logger.error('Error getting player view:', error);
      throw error;
    }
  }

  /**
   * Generate world events periodically
   */
  async generateWorldEvent(gameId) {
    try {
      const game = this.games.get(gameId);
      if (!game) {
        throw new NotFoundError('Game', gameId);
      }

      const worldEvent = await aiService.generateWorldEvent({
        currentTurn: game.currentTurn,
        players: game.players,
        mapSize: game.mapSize
      });

      // Add to game history
      game.history.push({
        type: 'world_event',
        event: worldEvent,
        turn: game.currentTurn,
        timestamp: new Date()
      });

      if (this.dbAvailable) {
        // Save world event to database
        await pool.query(`
          INSERT INTO game_history (game_id, action_type, action_data, turn_number, narrative)
          VALUES ($1, $2, $3, $4, $5)
        `, [gameId, 'world_event', JSON.stringify(worldEvent), game.currentTurn, worldEvent.event]);
      }

      return worldEvent;
    } catch (error) {
      logger.error('Error generating world event:', error);
      throw error;
    }
  }

  /**
   * Get AI service status
   */
  getAIStatus() {
    return aiService.getStatus();
  }

  // Helper methods
  async loadGameFromDB(gameId) {
    if (!this.dbAvailable) {
      return null;
    }
    
    const gameData = await this.getGameById(gameId);
    if (!gameData) return null;
    
    const game = new Game(gameData);
    this.games.set(gameId, game);
    return game;
  }

  async loadGamesFromDB() {
    try {
      logger.info('Loading existing games from database...');
      
      // Get all active games
      const result = await pool.query(`
        SELECT id FROM games 
        WHERE status != 'finished' 
        ORDER BY created_at DESC
      `);
      
      logger.info(`Found ${result.rows.length} active games in database`);
      
      // Load each game
      for (const row of result.rows) {
        try {
          await this.loadGameFromDB(row.id);
          logger.info(`Loaded game: ${row.id}`);
        } catch (error) {
          logger.error(`Failed to load game ${row.id}:`, error.message);
        }
      }
      
      logger.info(`Successfully loaded ${this.games.size} games into memory`);
    } catch (error) {
      logger.error('Error loading games from DB:', error);
      // Don't throw error, just log it
    }
  }

  async updateGameInDB(game) {
    if (!this.dbAvailable) {
      return;
    }
    
    try {
      await pool.query(`
        UPDATE games 
        SET status = $2, current_turn = $3, current_player_index = $4, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [game.id, game.status, game.currentTurn, game.currentPlayerIndex]);
      
      // Update player resources
      for (const player of game.players) {
        await pool.query(`
          INSERT INTO player_resources (game_id, player_id, food, gold, wood, stone, science, culture, army)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (game_id, player_id) DO UPDATE SET
            food = $3, gold = $4, wood = $5, stone = $6, science = $7, culture = $8, army = $9,
            updated_at = CURRENT_TIMESTAMP
        `, [
          game.id, player.id,
          player.resources.food, player.resources.gold, player.resources.wood,
          player.resources.stone, player.resources.science, player.resources.culture,
          player.resources.army
        ]);
      }
      
      // Clear cache (with error handling)
      try {
        if (this.redisClient) {
          await this.redisClient.del(`game:${game.id}`);
        }
      } catch (cacheError) {
        logger.warn('Failed to clear cache:', cacheError.message);
      }
    } catch (error) {
      logger.error('Error updating game in DB:', error);
    }
  }

  /**
   * Reset game to waiting state (for development)
   */
  async resetGameToWaiting(gameId) {
    try {
      const game = this.games.get(gameId);
      if (!game) {
        throw new NotFoundError('Game', gameId);
      }

      game.resetToWaiting();
      
      if (this.dbAvailable) {
        // Update game in database
        await this.updateGameInDB(game);
        
        // Clear cache
        await safeRedisDel(`game:${gameId}`);
      }
      
      return {
        success: true,
        game: game.getState()
      };
    } catch (error) {
      logger.error('Error resetting game to waiting:', error);
      throw error;
    }
  }

  // Clean up finished games
  async cleanupGames() {
    try {
      const now = new Date();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      if (this.dbAvailable) {
        // Clean up from database
        await pool.query(`
          DELETE FROM games 
          WHERE status = 'finished' AND updated_at < $1
        `, [new Date(now - maxAge)]);
      }

      // Clean up from memory
      for (const [gameId, game] of this.games) {
        if (game.status === 'finished' && 
            (now - game.updatedAt) > maxAge) {
          this.games.delete(gameId);
        }
      }
    } catch (error) {
      logger.error('Error cleaning up games:', error);
    }
  }

  async saveMapToDB(game) {
    if (!this.dbAvailable) {
      return;
    }
    
    try {
      // Clear existing map tiles
      await pool.query('DELETE FROM map_tiles WHERE game_id = $1', [game.id]);
      
      // Prepare batch insert data
      const values = [];
      const valueStrings = [];
      let paramIndex = 1;
      
      for (let x = 0; x < game.mapSize; x++) {
        for (let y = 0; y < game.mapSize; y++) {
          const tile = game.map[x][y];
          values.push(
            game.id, 
            x, 
            y, 
            tile.terrain,
            JSON.stringify(tile.resources), 
            tile.owner || null,
            tile.discovered || false
          );
          valueStrings.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4}, $${paramIndex + 5}, $${paramIndex + 6})`);
          paramIndex += 7;
        }
      }
      
      // Single batch insert query
      if (valueStrings.length > 0) {
        await pool.query(`
          INSERT INTO map_tiles (game_id, x, y, terrain, resources, owner_id, discovered)
          VALUES ${valueStrings.join(', ')}
        `, values);
      }
      
      logger.info(`[MAP] Saved ${game.mapSize * game.mapSize} tiles to database in batch`);
    } catch (error) {
      logger.error('Error saving map to DB:', error);
    }
  }

  async loadMapFromDB(gameId) {
    if (!this.dbAvailable) {
      return null;
    }
    
    try {
      const result = await pool.query(`
        SELECT x, y, terrain, resources, owner_id, discovered
        FROM map_tiles
        WHERE game_id = $1
        ORDER BY x, y
      `, [gameId]);
      
      if (result.rows.length === 0) {
        return null;
      }
      
      const mapSize = Math.sqrt(result.rows.length);
      const map = Array(mapSize).fill().map(() => Array(mapSize).fill());
      
      for (const row of result.rows) {
        map[row.x][row.y] = {
          terrain: row.terrain,
          resources: row.resources,
          owner: row.owner_id,
          discovered: row.discovered
        };
      }
      
      return map;
    } catch (error) {
      logger.error('Error loading map from DB:', error);
      return null;
    }
  }

  /**
   * Check if map has any player territories (cities or owned tiles)
   */
  checkMapHasPlayerTerritories(map) {
    let totalTiles = 0;
    let ownedTiles = 0;
    let citiesFound = 0;
    
    for (let x = 0; x < map.length; x++) {
      for (let y = 0; y < map[x].length; y++) {
        const tile = map[x][y];
        totalTiles++;
        if (tile.owner) {
          ownedTiles++;
          logger.info(`[CHECK] Found owned tile at (${x}, ${y}) by ${tile.owner}`);
        }
        if (tile.city) {
          citiesFound++;
          logger.info(`[CHECK] Found city at (${x}, ${y}): ${JSON.stringify(tile.city)}`);
        }
      }
    }
    
    logger.info(`[CHECK] Map scan complete: ${totalTiles} total tiles, ${ownedTiles} owned, ${citiesFound} cities`);
    return ownedTiles > 0 || citiesFound > 0;
  }

  /**
   * Initialize starting positions for players in a game
   */
  initializeStartingPositions(game) {
    logger.info(`[INIT] Initializing starting positions for ${game.players.length} players`);
    
    game.players.forEach((player, index) => {
      // Give starting resources
      player.resources = {
        food: 10,
        gold: 10,
        wood: 10,
        stone: 10,
        science: 5,
        culture: 5,
        army: 5
      };
      
      // Find a suitable starting position
      let startX, startY;
      let attempts = 0;
      
      do {
        startX = Math.floor(Math.random() * game.mapSize);
        startY = Math.floor(Math.random() * game.mapSize);
        attempts++;
      } while (
        (game.map[startX][startY].terrain === 'water' || game.map[startX][startY].city) &&
        attempts < 100
      );
      
      // Create starting city
      game.map[startX][startY].city = {
        name: `${player.civilizationName} Capital`,
        level: 1,
        population: 1000,
        owner: player.id
      };
      game.map[startX][startY].owner = player.id;
      game.map[startX][startY].discovered = true;
      
      // Discover surrounding tiles
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const nx = startX + dx;
          const ny = startY + dy;
          if (nx >= 0 && nx < game.mapSize && ny >= 0 && ny < game.mapSize) {
            game.map[nx][ny].discovered = true;
          }
        }
      }
      
      logger.info(`[INIT] Created starting city for ${player.civilizationName} at (${startX}, ${startY})`);
    });
  }
}

export default GameService; 