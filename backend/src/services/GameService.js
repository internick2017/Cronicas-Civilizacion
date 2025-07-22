import Game from '../models/Game.js';
import Player from '../models/Player.js';
import aiService from './AIService.js';
import pool from '../config/database.js';
import redisClient from '../config/redis.js';

export class GameService {
  constructor() {
    // Keep games in memory for now (fallback when DB is not available)
    this.games = new Map();
    this.players = new Map();
    this.dbAvailable = false;
    this.initializeDatabase();
  }

  async initializeDatabase() {
    try {
      // Test database connection
      await pool.query('SELECT 1');
      this.dbAvailable = true;
      console.log('✅ Database connection established');
    } catch (error) {
      console.warn('⚠️ Database not available, using in-memory storage:', error.message);
      this.dbAvailable = false;
    }
  }

  async getAllGames() {
    try {
      // If database is not available, use in-memory storage
      if (!this.dbAvailable) {
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

      const result = await pool.query(`
        SELECT g.*, 
               COUNT(gp.player_id) as player_count,
               json_agg(
                 json_build_object(
                   'id', p.id,
                   'name', p.name,
                   'civilization_name', p.civilization_name
                 )
               ) as players
        FROM games g
        LEFT JOIN game_players gp ON g.id = gp.game_id
        LEFT JOIN players p ON gp.player_id = p.id
        WHERE g.status != 'finished'
        GROUP BY g.id
        ORDER BY g.created_at DESC
      `);

      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        status: row.status,
        players: row.player_count || 0,
        maxPlayers: row.max_players,
        gameMode: row.game_mode,
        createdAt: row.created_at,
        playerList: row.players || []
      }));
    } catch (error) {
      console.error('Error getting games:', error);
      
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

  async getGameById(gameId) {
    try {
      // Check memory first
      const game = this.games.get(gameId);
      if (game) {
        return game.getState();
      }

      if (!this.dbAvailable) {
        return null;
      }

      // Check cache first
      const cached = await redisClient.get(`game:${gameId}`);
      if (cached) {
        return JSON.parse(cached);
      }

      const result = await pool.query(`
        SELECT g.*, 
               json_agg(
                 json_build_object(
                   'id', p.id,
                   'name', p.name,
                   'civilization_name', p.civilization_name,
                   'player_index', gp.player_index
                 ) ORDER BY gp.player_index
               ) as players
        FROM games g
        LEFT JOIN game_players gp ON g.id = gp.game_id
        LEFT JOIN players p ON gp.player_id = p.id
        WHERE g.id = $1
        GROUP BY g.id
      `, [gameId]);

      if (result.rows.length === 0) {
        return null;
      }

      const gameData = result.rows[0];
      
      // Load game state from database or create new Game instance
      let gameInstance = this.games.get(gameId);
              if (!gameInstance) {
        gameInstance = new Game({
          id: gameData.id,
          name: gameData.name,
          maxPlayers: gameData.max_players,
          mapSize: gameData.map_size,
          gameMode: gameData.game_mode,
          status: gameData.status,
          currentTurn: gameData.current_turn,
          currentPlayerIndex: gameData.current_player_index
        });
        
        // Load players
        if (gameData.players && gameData.players[0].id) {
          gameInstance.players = gameData.players.map(p => new Player({
            id: p.id,
            name: p.name,
            civilizationName: p.civilization_name
          }));
        }
        
        this.games.set(gameId, gameInstance);
      }

      const gameState = gameInstance.getState();
      
      // Cache the result
      await redisClient.setEx(`game:${gameId}`, 60, JSON.stringify(gameState));
      
      return gameState;
    } catch (error) {
      console.error('Error getting game by ID:', error);
      
      // Fallback to memory
      const game = this.games.get(gameId);
      return game ? game.getState() : null;
    }
  }

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
        await redisClient.del(`game:${game.id}`);
      }

      // Store in memory
      this.games.set(game.id, game);
      
      return game.getState();
    } catch (error) {
      console.error('Error creating game:', error);
      
      // Fallback to memory only
      const game = new Game(gameData);
      this.games.set(game.id, game);
      return game.getState();
    }
  }

  async joinGame(gameId, playerId, civilizationName) {
    try {
      const game = this.games.get(gameId) || await this.loadGameFromDB(gameId);
      if (!game) {
        throw new Error('Game not found');
      }

      // Check if player already exists
      let player = this.players.get(playerId);
      if (!player) {
        // Create new player
        player = new Player({
          id: playerId,
          name: `Player ${this.players.size + 1}`,
          civilizationName
        });
        
        if (this.dbAvailable) {
          // Save player to database
          await pool.query(`
            INSERT INTO players (id, name, civilization_name)
            VALUES ($1, $2, $3)
            ON CONFLICT (id) DO UPDATE SET
              civilization_name = $3,
              updated_at = CURRENT_TIMESTAMP
          `, [player.id, player.name, player.civilizationName]);
        }
        
        this.players.set(player.id, player);
      } else {
        // Update civilization name
        player.civilizationName = civilizationName;
        
        if (this.dbAvailable) {
          await pool.query(`
            UPDATE players 
            SET civilization_name = $2, updated_at = CURRENT_TIMESTAMP
            WHERE id = $1
          `, [player.id, civilizationName]);
        }
      }

      // Add player to game
      const playerIndex = game.players.length;
      game.addPlayer(player);
      
      if (this.dbAvailable) {
        // Save game-player relationship
        await pool.query(`
          INSERT INTO game_players (game_id, player_id, player_index)
          VALUES ($1, $2, $3)
          ON CONFLICT (game_id, player_id) DO NOTHING
        `, [gameId, player.id, playerIndex]);

        // Update game in database
        await this.updateGameInDB(game);
        
        // Clear cache
        await redisClient.del(`game:${gameId}`);
      }
      
      return {
        success: true,
        game: game.getState(),
        player: player
      };
    } catch (error) {
      console.error('Error joining game:', error);
      throw error;
    }
  }

  async leaveGame(gameId, playerId) {
    try {
      const game = this.games.get(gameId);
      if (!game) {
        throw new Error('Game not found');
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
        await redisClient.del(`game:${gameId}`);
      }
      
      return {
        success: true,
        game: game.getState()
      };
    } catch (error) {
      console.error('Error leaving game:', error);
      throw error;
    }
  }

  async startGame(gameId) {
    try {
      const game = this.games.get(gameId);
      if (!game) {
        throw new Error('Game not found');
      }

      game.startGame();
      
      if (this.dbAvailable) {
        // Update game in database
        await this.updateGameInDB(game);
        
        // Save map to database
        await this.saveMapToDB(game);
        
        // Clear cache
        await redisClient.del(`game:${gameId}`);
      }
      
      return {
        success: true,
        game: game.getState()
      };
    } catch (error) {
      console.error('Error starting game:', error);
      throw error;
    }
  }

  async processAction(gameId, playerId, action) {
    try {
      const game = this.games.get(gameId);
      if (!game) {
        throw new Error('Game not found');
      }

      const player = game.players.find(p => p.id === playerId);
      if (!player) {
        throw new Error('Player not found');
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
        await redisClient.del(`game:${gameId}`);
      }
      
      return {
        success: true,
        action: result,
        game: game.getState(),
        narrative: narrative
      };
    } catch (error) {
      console.error('Error processing action:', error);
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
        throw new Error('Game not found');
      }

      return game.getPlayerView(playerId);
    } catch (error) {
      console.error('Error getting player view:', error);
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
        throw new Error('Game not found');
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
      console.error('Error generating world event:', error);
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
      
      // Clear cache
      await redisClient.del(`game:${game.id}`);
    } catch (error) {
      console.error('Error updating game in DB:', error);
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
      console.error('Error cleaning up games:', error);
    }
  }

  async saveMapToDB(game) {
    if (!this.dbAvailable) {
      return;
    }
    
    try {
      // Clear existing map tiles
      await pool.query('DELETE FROM map_tiles WHERE game_id = $1', [game.id]);
      
      // Save new map tiles
      for (let x = 0; x < game.mapSize; x++) {
        for (let y = 0; y < game.mapSize; y++) {
          const tile = game.map[x][y];
          await pool.query(`
            INSERT INTO map_tiles (game_id, x, y, terrain, resources, owner_id, discovered)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
          `, [
            game.id, x, y, tile.terrain,
            JSON.stringify(tile.resources), 
            tile.owner || null,
            tile.discovered || false
          ]);
        }
      }
    } catch (error) {
      console.error('Error saving map to DB:', error);
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
      console.error('Error loading map from DB:', error);
      return null;
    }
  }
}

export default GameService; 