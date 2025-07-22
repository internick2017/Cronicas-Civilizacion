import Player from '../models/Player.js';
import pool from '../config/database.js';
import redisClient from '../config/redis.js';

export class PlayerService {
  constructor() {
    this.players = new Map(); // Keep some players in memory for performance
  }

  async createPlayer(playerData) {
    try {
      const player = new Player(playerData);
      
      // Save to database
      const result = await pool.query(`
        INSERT INTO players (id, name, civilization_name, avatar, is_online)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `, [
        player.id,
        player.name,
        player.civilizationName,
        player.avatar,
        player.isOnline
      ]);

      // Save player stats
      await pool.query(`
        INSERT INTO player_stats (player_id, games_played, games_won, total_turns, cities_founded, territories_conquered)
        VALUES ($1, $2, $3, $4, $5, $6)
      `, [
        player.id,
        player.stats.gamesPlayed,
        player.stats.gamesWon,
        player.stats.totalTurns,
        player.stats.citiesFounded,
        player.stats.territoriesConquered
      ]);

      // Store in memory
      this.players.set(player.id, player);
      
      return player.toJSON();
    } catch (error) {
      console.error('Error creating player:', error);
      throw error;
    }
  }

  async getPlayerById(playerId) {
    try {
      // Check memory first
      let player = this.players.get(playerId);
      if (player) {
        return player.toJSON();
      }

      // Check cache
      const cached = await redisClient.get(`player:${playerId}`);
      if (cached) {
        return JSON.parse(cached);
      }

      // Query database
      const result = await pool.query(`
        SELECT p.*, ps.*
        FROM players p
        LEFT JOIN player_stats ps ON p.id = ps.player_id
        WHERE p.id = $1
      `, [playerId]);

      if (result.rows.length === 0) {
        return null;
      }

      const playerData = result.rows[0];
      player = new Player({
        id: playerData.id,
        name: playerData.name,
        civilizationName: playerData.civilization_name,
        avatar: playerData.avatar,
        socketId: playerData.socket_id,
        isOnline: playerData.is_online
      });

      // Set stats if they exist
      if (playerData.games_played !== null) {
        player.stats = {
          gamesPlayed: playerData.games_played,
          gamesWon: playerData.games_won,
          totalTurns: playerData.total_turns,
          citiesFounded: playerData.cities_founded,
          territoriesConquered: playerData.territories_conquered
        };
      }

      // Store in memory and cache
      this.players.set(playerId, player);
      const playerJson = player.toJSON();
      await redisClient.setEx(`player:${playerId}`, 300, JSON.stringify(playerJson));
      
      return playerJson;
    } catch (error) {
      console.error('Error getting player:', error);
      throw error;
    }
  }

  async updatePlayer(playerId, updates) {
    try {
      const player = this.players.get(playerId) || await this.loadPlayerFromDB(playerId);
      if (!player) {
        throw new Error('Player not found');
      }

      // Update player properties
      if (updates.name) player.name = updates.name;
      if (updates.avatar) player.avatar = updates.avatar;
      if (updates.civilizationName) player.civilizationName = updates.civilizationName;

      // Update in database
      await pool.query(`
        UPDATE players 
        SET name = $2, avatar = $3, civilization_name = $4, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [playerId, player.name, player.avatar, player.civilizationName]);

      // Clear cache
      await redisClient.del(`player:${playerId}`);

      return player.toJSON();
    } catch (error) {
      console.error('Error updating player:', error);
      throw error;
    }
  }

  async getPlayerStats(playerId) {
    try {
      const result = await pool.query(`
        SELECT ps.*, p.name, p.civilization_name
        FROM player_stats ps
        JOIN players p ON ps.player_id = p.id
        WHERE ps.player_id = $1
      `, [playerId]);

      if (result.rows.length === 0) {
        throw new Error('Player not found');
      }

      const stats = result.rows[0];
      const winRate = stats.games_played > 0 ? (stats.games_won / stats.games_played) * 100 : 0;

      return {
        playerId: stats.player_id,
        name: stats.name,
        civilizationName: stats.civilization_name,
        gamesPlayed: stats.games_played,
        gamesWon: stats.games_won,
        totalTurns: stats.total_turns,
        citiesFounded: stats.cities_founded,
        territoriesConquered: stats.territories_conquered,
        winRate: Math.round(winRate * 100) / 100
      };
    } catch (error) {
      console.error('Error getting player stats:', error);
      throw error;
    }
  }

  async getPlayerGames(playerId) {
    try {
      const result = await pool.query(`
        SELECT g.*, gp.player_index, gp.joined_at
        FROM games g
        JOIN game_players gp ON g.id = gp.game_id
        WHERE gp.player_id = $1
        ORDER BY g.created_at DESC
        LIMIT 50
      `, [playerId]);

      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        status: row.status,
        gameMode: row.game_mode,
        playerIndex: row.player_index,
        joinedAt: row.joined_at,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      console.error('Error getting player games:', error);
      throw error;
    }
  }

  async setPlayerOnline(playerId, socketId) {
    try {
      // Update database
      await pool.query(`
        UPDATE players 
        SET is_online = true, socket_id = $2, last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [playerId, socketId]);

      // Update memory if player exists
      const player = this.players.get(playerId);
      if (player) {
        player.setOnline(socketId);
      }

      // Clear cache
      await redisClient.del(`player:${playerId}`);
    } catch (error) {
      console.error('Error setting player online:', error);
      throw error;
    }
  }

  async setPlayerOffline(playerId) {
    try {
      // Update database
      await pool.query(`
        UPDATE players 
        SET is_online = false, socket_id = NULL, last_seen = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [playerId]);

      // Update memory if player exists
      const player = this.players.get(playerId);
      if (player) {
        player.setOffline();
      }

      // Clear cache
      await redisClient.del(`player:${playerId}`);
    } catch (error) {
      console.error('Error setting player offline:', error);
      throw error;
    }
  }

  async updatePlayerStats(playerId, gameResult) {
    try {
      const player = this.players.get(playerId) || await this.loadPlayerFromDB(playerId);
      if (!player) {
        throw new Error('Player not found');
      }

      // Update stats
      player.updateStats(gameResult);

      // Update in database
      await pool.query(`
        UPDATE player_stats 
        SET games_played = $2, games_won = $3, total_turns = $4, 
            cities_founded = $5, territories_conquered = $6, updated_at = CURRENT_TIMESTAMP
        WHERE player_id = $1
      `, [
        playerId,
        player.stats.gamesPlayed,
        player.stats.gamesWon,
        player.stats.totalTurns,
        player.stats.citiesFounded,
        player.stats.territoriesConquered
      ]);

      // Clear cache
      await redisClient.del(`player:${playerId}`);

      return player.stats;
    } catch (error) {
      console.error('Error updating player stats:', error);
      throw error;
    }
  }

  // Helper methods
  async loadPlayerFromDB(playerId) {
    const playerData = await this.getPlayerById(playerId);
    if (!playerData) return null;
    
    const player = new Player(playerData);
    this.players.set(playerId, player);
    return player;
  }

  async getAllOnlinePlayers() {
    try {
      const result = await pool.query(`
        SELECT id, name, civilization_name, socket_id, last_seen
        FROM players 
        WHERE is_online = true
        ORDER BY last_seen DESC
      `);

      return result.rows.map(row => ({
        id: row.id,
        name: row.name,
        civilizationName: row.civilization_name,
        socketId: row.socket_id,
        lastSeen: row.last_seen
      }));
    } catch (error) {
      console.error('Error getting online players:', error);
      throw error;
    }
  }
}

export default PlayerService; 