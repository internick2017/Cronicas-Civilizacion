import { StorySession } from '../models/StorySession.js';
import AIService from './AIService.js';
import { normalizeLanguage } from './narrativePrompts.js';
import { v4 as uuidv4 } from 'uuid';
import pool from '../config/database.js';
import logger from '../utils/logger.js';
import { generateRoomCode } from '../utils/roomCode.js';

export class NarrativeService {
  constructor(options = {}) {
    this.sessions = new Map(); // Keep memory cache for performance - cleared for fresh start
    this.aiService = AIService;
    this.skipDatabase = options.skipDatabase === true;
  }

  /**
   * Save session to database
   */
  async saveSessionToDatabase(session) {
    if (this.skipDatabase) return;
    try {
      const client = await pool.connect();
      
      // Save main session
      await client.query(`
        INSERT INTO story_sessions (id, title, description, max_players, current_player_index,
                                  turn_number, is_active, world_context, settings, code, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (id) DO UPDATE SET
          current_player_index = $5,
          turn_number = $6,
          is_active = $7,
          world_context = $8,
          code = $10,
          updated_at = $12
      `, [session.id, session.title, session.description, session.maxPlayers,
          session.currentPlayerIndex, session.turnNumber, session.isActive,
          JSON.stringify(session.worldContext), JSON.stringify(session.settings),
          session.code || null, session.createdAt, session.updatedAt]);
      
      // Save players
      await client.query('DELETE FROM story_session_players WHERE session_id = $1', [session.id]);
      for (const player of session.players) {
        await client.query(`
          INSERT INTO story_session_players (id, session_id, player_id, name, character_name, 
                                           character_class, country_name, country_type, world_role, 
                                           turn_order, is_active, joined_at)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        `, [player.id, session.id, player.playerId || null, player.name, player.characterName,
            player.characterClass, player.countryName, player.countryType, player.worldRole,
            player.turnOrder, player.isActive, player.joinedAt]);
      }
      
      client.release();
    } catch (error) {
      logger.error('Error saving session to database:', error);
      throw error;
    }
  }

  /**
   * Shared hydration: build a StorySession from raw DB rows.
   */
  hydrateSessionFromRows(sessionData, players, history) {
    return new StorySession({
      id: sessionData.id,
      title: sessionData.title,
      description: sessionData.description,
      maxPlayers: sessionData.max_players,
      currentPlayerIndex: sessionData.current_player_index,
      turnNumber: sessionData.turn_number,
      isActive: sessionData.is_active,
      worldContext: JSON.parse(sessionData.world_context || '{}'),
      settings: JSON.parse(sessionData.settings || '{}'),
      code: sessionData.code || null,
      createdAt: sessionData.created_at,
      updatedAt: sessionData.updated_at,
      players: players.map(p => ({
        id: p.id,
        playerId: p.player_id,
        name: p.name,
        characterName: p.character_name,
        characterClass: p.character_class,
        countryName: p.country_name,
        countryType: p.country_type,
        worldRole: p.world_role,
        turnOrder: p.turn_order,
        isActive: p.is_active,
        joinedAt: p.joined_at
      })),
      storyHistory: history.map(h => ({
        id: h.id,
        playerId: h.player_id,
        playerName: h.player_name,
        characterName: h.character_name,
        action: h.action,
        narrative: h.narrative,
        turnNumber: h.turn_number,
        type: h.entry_type,
        context: h.context ? JSON.parse(h.context) : {},
        timestamp: h.timestamp
      }))
    });
  }

  /**
   * Load session from database
   */
  async loadSessionFromDatabase(sessionId) {
    if (this.skipDatabase) return null;
    const client = await pool.connect();
    try {
      const sessionResult = await client.query(
        'SELECT * FROM story_sessions WHERE id = $1', [sessionId]
      );

      if (sessionResult.rows.length === 0) return null;

      const sessionData = sessionResult.rows[0];

      const playersResult = await client.query(
        'SELECT * FROM story_session_players WHERE session_id = $1 ORDER BY turn_order',
        [sessionId]
      );

      const historyResult = await client.query(
        'SELECT * FROM story_history WHERE session_id = $1 ORDER BY timestamp',
        [sessionId]
      );

      return this.hydrateSessionFromRows(sessionData, playersResult.rows, historyResult.rows);
    } catch (error) {
      logger.error('Error loading session from database:', error);
      return null;
    } finally {
      client.release();
    }
  }

  /**
   * Save story entry to database
   */
  async saveStoryEntryToDatabase(sessionId, entry) {
    if (this.skipDatabase) return;
    try {
      const client = await pool.connect();
      
      await client.query(`
        INSERT INTO story_history (id, session_id, player_id, player_name, character_name, 
                                 action, narrative, turn_number, entry_type, context, timestamp)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [entry.id, sessionId, entry.playerId, entry.playerName, entry.characterName,
          entry.action, entry.narrative, entry.turnNumber, entry.type,
          JSON.stringify(entry.context || {}), entry.timestamp]);
      
      client.release();
    } catch (error) {
      logger.error('Error saving story entry to database:', error);
    }
  }

  /**
   * Create a new story session
   */
  async createSession(sessionData = {}) {
    // Normalise language: only 'es' and 'pt' are supported
    if (sessionData.settings) {
      sessionData.settings.language = normalizeLanguage(sessionData.settings.language);
    }

    const session = new StorySession(sessionData);
    session.code = generateRoomCode(c =>
      [...this.sessions.values()].some(s => s.code === c)
    );
    this.sessions.set(session.id, session);

    // Save to database with retry on unique-code collision (DB state after restart)
    const MAX_CODE_RETRIES = 3;
    for (let attempt = 0; attempt < MAX_CODE_RETRIES; attempt++) {
      try {
        await this.saveSessionToDatabase(session);
        break;
      } catch (error) {
        const isCodeCollision =
          /UNIQUE constraint failed[\s\S]*code/i.test(error.message) ||
          error.code === '23505';
        if (isCodeCollision && attempt < MAX_CODE_RETRIES - 1) {
          session.code = generateRoomCode(c =>
            [...this.sessions.values()].some(s => s !== session && s.code === c)
          );
        } else {
          throw error;
        }
      }
    }

    logger.info(`Created new story session: ${session.title} (${session.id})`);
    return session;
  }

  /**
   * Get a session by room code (case-insensitive)
   */
  async getSessionByCode(code) {
    const target = String(code || '').trim().toUpperCase();
    for (const session of this.sessions.values()) {
      if (session.code === target) return session;
    }
    // Fallback to DB for sessions not in cache (survives restart)
    if (this.skipDatabase) return null;
    return await this.loadSessionByCodeFromDatabase(target);
  }

  /**
   * Load session from database by room code
   */
  async loadSessionByCodeFromDatabase(code) {
    if (this.skipDatabase) return null;
    const client = await pool.connect();
    try {
      const sessionResult = await client.query(
        'SELECT * FROM story_sessions WHERE code = $1', [code]
      );

      if (sessionResult.rows.length === 0) return null;

      const sessionData = sessionResult.rows[0];

      const playersResult = await client.query(
        'SELECT * FROM story_session_players WHERE session_id = $1 ORDER BY turn_order',
        [sessionData.id]
      );

      const historyResult = await client.query(
        'SELECT * FROM story_history WHERE session_id = $1 ORDER BY timestamp',
        [sessionData.id]
      );

      const session = this.hydrateSessionFromRows(sessionData, playersResult.rows, historyResult.rows);
      this.sessions.set(session.id, session);
      return session;
    } catch (error) {
      logger.error('Error loading session by code from database:', error);
      return null;
    } finally {
      client.release();
    }
  }

  /**
   * Get a session by ID
   */
  async getSession(sessionId) {
    // Try memory first
    let session = this.sessions.get(sessionId);
    
    // If not in memory, try loading from database
    if (!session) {
      session = await this.loadSessionFromDatabase(sessionId);
      if (session) {
        this.sessions.set(sessionId, session);
        console.log(`📚 Loaded session from database: ${session.title} (${session.id})`);
      }
    }
    
    return session;
  }

  /**
   * Get all active sessions
   */
  async getAllSessions() {
    try {
      const client = await pool.connect();
      
      // Get sessions with player counts, story lengths, and current player info
      const result = await client.query(`
        SELECT 
          ss.*,
          COALESCE(player_counts.player_count, 0) as player_count,
          COALESCE(story_counts.story_length, 0) as story_length,
          current_players.player_name as current_player_name,
          current_players.player_id as current_player_id
        FROM story_sessions ss
        LEFT JOIN (
          SELECT session_id, COUNT(*) as player_count 
          FROM story_session_players 
          GROUP BY session_id
        ) player_counts ON ss.id = player_counts.session_id
        LEFT JOIN (
          SELECT session_id, COUNT(*) as story_length 
          FROM story_history 
          GROUP BY session_id
        ) story_counts ON ss.id = story_counts.session_id
        LEFT JOIN (
          SELECT ssp.session_id, p.name as player_name, p.id as player_id
          FROM story_session_players ssp
          JOIN players p ON ssp.player_id = p.id
          WHERE ssp.session_id IN (
            SELECT id FROM story_sessions WHERE current_turn_player_id = ssp.player_id
          )
        ) current_players ON ss.id = current_players.session_id
        WHERE ss.is_active = true 
        ORDER BY ss.created_at DESC
      `);
      
      client.release();
      
      return result.rows.map(row => ({
        id: row.id,
        title: row.title,
        description: row.description,
        maxPlayers: row.max_players,
        playerCount: parseInt(row.player_count) || 0,
        turnNumber: row.turn_number,
        storyLength: parseInt(row.story_length) || 0,
        currentPlayer: row.current_player_name ? {
          id: row.current_player_id,
          name: row.current_player_name
        } : null,
        isActive: row.is_active,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      }));
    } catch (error) {
      console.error('Error getting all sessions:', error);
      // Fallback to memory
      return Array.from(this.sessions.values())
        .filter(session => session.isActive)
        .map(session => session.getSummary());
    }
  }

  /**
   * Join a session
   */
  async joinSession(sessionId, playerData) {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    if (!session.isActive) {
      throw new Error('Session is not active');
    }

    const player = session.addPlayer(playerData);
    console.log(`👤 ${player.name} joined session ${session.title}`);
    
    // Save to database
    await this.saveSessionToDatabase(session);
    
    return {
      session: session.toJSON(), // Return full session data for resuming
      player,
      message: `¡Bienvenido a la historia, ${player.characterName}!`
    };
  }

  /**
   * Leave a session
   */
  leaveSession(sessionId, playerId) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const player = session.players.find(p => p.id === playerId);
    if (!player) {
      throw new Error('Player not found in session');
    }

    session.removePlayer(playerId);
    console.log(`👋 ${player.name} left session ${session.title}`);

    // If no players left, close session
    if (session.players.length === 0) {
      session.isActive = false;
      console.log(`🔚 Session ${session.title} closed (no players)`);
    }

    return {
      session: session.getSummary(),
      message: `${player.characterName} ha abandonado la historia.`
    };
  }

  /**
   * Submit a player action.
   * Saves the action and advances turn order. Only when the LAST player of the round
   * submits does the service call the AI ONCE with ALL the round's actions.
   */
  async submitAction(sessionId, playerId, actionText) {
    const session = await this.getSession(sessionId);
    if (!session || !session.isActive) throw new Error('Sesión no activa');

    const text = String(actionText || '').trim();
    if (!text) throw new Error('La acción no puede estar vacía');
    if (text.length > 280) throw new Error('La acción supera los 280 caracteres');

    const current = session.players[session.currentPlayerIndex];
    if (!current || current.id !== playerId) {
      throw new Error(`No es tu turno — le toca a ${current?.name ?? 'otro jugador'}`);
    }

    const entry = session.addPlayerAction(playerId, text);
    if (!this.skipDatabase) await this.saveStoryEntryToDatabase(sessionId, entry);

    session.currentPlayerIndex = (session.currentPlayerIndex + 1) % session.players.length;
    const roundComplete = session.currentPlayerIndex === 0;

    let narrative = null;
    if (roundComplete) {
      const roundActions = session.storyHistory.filter(
        e => e.type === 'player_action' && e.turnNumber === session.turnNumber
      );
      const prompt = this.buildRoundPrompt(session, roundActions);
      const language = (session.settings && session.settings.language) || 'es';
      const genre = (session.settings && session.settings.genre) || 'fantasy';

      // generateStoryNarrative throws → propagate (action+index already mutated; turnNumber not yet incremented)
      const aiText = await this.aiService.generateStoryNarrative(prompt, { language, genre });

      // null means unconfigured — use local fallback so the round always gets some narrative
      narrative = aiText ?? this.getFallbackNarrative({ characterName: 'los héroes' });

      const aiEntry = session.addAINarrative(narrative);
      if (!this.skipDatabase) await this.saveStoryEntryToDatabase(sessionId, aiEntry);
      session.turnNumber += 1;
    }

    if (!this.skipDatabase) await this.saveSessionToDatabase(session);
    return {
      action: entry,
      narrative,
      nextPlayer: session.players[session.currentPlayerIndex],
      turnNumber: session.turnNumber,
      roundComplete,
    };
  }

  /**
   * Build a prompt summarising all actions of a round for the AI narrator.
   */
  buildRoundPrompt(session, roundActions) {
    const lastNarratives = session.storyHistory
      .filter(e => e.type === 'ai_narrative').slice(-2)
      .map(e => e.narrative).join('\n');
    const actions = roundActions
      .map(e => `${session.players.find(p => p.id === e.playerId)?.name}: ${e.action}`)
      .join('\n');
    return `HISTORIA RECIENTE:\n${lastNarratives || '(la historia recién comienza)'}\n\nACCIONES DE ESTA RONDA:\n${actions}\n\nNarra el resultado de la ronda.`;
  }

  /**
   * Build prompt for narrative generation
   */
  buildNarrativePrompt(session, storyEntry) {
    const { worldContext, settings, storyHistory } = session;
    const recentHistory = session.getRecentHistory(5);
    
    let prompt = `Eres el narrador de una historia colaborativa llamada "${session.title}".\n\n`;
    prompt += `Tipo de juego: ${settings.gameType || 'character'}\n`;
    prompt += `Género: ${settings.genre || 'fantasy'}\n`;
    prompt += `Contexto del mundo: ${worldContext.setting}\n`;
    prompt += `Ubicación actual: ${worldContext.currentLocation}\n`;
    prompt += `Hora del día: ${worldContext.timeOfDay}\n`;
    prompt += `Clima: ${worldContext.weather}\n`;
    prompt += `Ambiente: ${worldContext.mood}\n\n`;
    
    if (recentHistory.length > 0) {
      prompt += `Historia reciente:\n`;
      recentHistory.forEach(entry => {
        if (entry.type === 'player_action') {
          const playerName = this.getPlayerDisplayName(entry, session);
          prompt += `- ${playerName}: ${entry.action}\n`;
        } else if (entry.type === 'ai_narrative') {
          prompt += `- ${entry.narrative}\n`;
        }
      });
      prompt += '\n';
    }
    
    const playerName = this.getPlayerDisplayName(storyEntry, session);
    prompt += `Ahora ${playerName} dice: "${storyEntry.action}"\n\n`;
    
    // Add specific instructions based on game type
    if (settings.gameType === 'character') {
      prompt += `Narra las consecuencias de esta acción de manera épica y envolvente, enfocándote en el personaje y sus aventuras. `;
    } else if (settings.gameType === 'country') {
      prompt += `Narra las consecuencias de esta acción desde la perspectiva de un país/nación, incluyendo aspectos políticos, económicos y militares. `;
    } else if (settings.gameType === 'world') {
      prompt += `Narra las consecuencias de esta acción desde una perspectiva mundial, incluyendo impactos en civilizaciones, continentes y el mundo entero. `;
    } else {
      prompt += `Narra las consecuencias de esta acción de manera épica y envolvente. `;
    }
    
    prompt += `Mantén la continuidad con la historia anterior y actualiza el contexto del mundo si es necesario. `;
    prompt += `Responde en español con un tono narrativo y dramático.`;
    
    return prompt;
  }

  getPlayerDisplayName(storyEntry, session) {
    const player = session.players.find(p => p.id === storyEntry.playerId);
    if (!player) return storyEntry.characterName || 'Jugador';
    
    const gameType = session.settings.gameType || 'character';
    
    if (gameType === 'character') {
      return `${storyEntry.characterName} (${player.characterClass})`;
    } else if (gameType === 'country') {
      return `${player.countryName} (${player.countryType})`;
    } else if (gameType === 'world') {
      return `${player.worldRole} (${player.worldType})`;
    }
    
    return storyEntry.characterName || player.name;
  }

  /**
   * Get fallback narrative when AI is not available
   */
  getFallbackNarrative(storyEntry) {
    const fallbacks = [
      `Las palabras de ${storyEntry.characterName} resuenan en el aire, creando ondas de cambio en el mundo que les rodea.`,
      `La acción de ${storyEntry.characterName} desencadena una serie de eventos que alterarán el curso de la historia.`,
      `Con determinación, ${storyEntry.characterName} toma el control de su destino, y el mundo responde a su voluntad.`,
      `El momento es crucial, y ${storyEntry.characterName} actúa con precisión, marcando un punto de inflexión en la narrativa.`,
      `La decisión de ${storyEntry.characterName} se convierte en el catalizador de una nueva era en esta historia épica.`
    ];
    
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  /**
   * Get session story history
   */
  getSessionHistory(sessionId, limit = 20) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    return session.storyHistory.slice(-limit);
  }

  /**
   * Update session settings
   */
  updateSessionSettings(sessionId, newSettings) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.settings = { ...session.settings, ...newSettings };
    session.updatedAt = new Date();
    
    return session.settings;
  }

  /**
   * Update world context
   */
  updateWorldContext(sessionId, newContext) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.updateWorldContext(newContext);
    return session.worldContext;
  }

  /**
   * End a session
   */
  endSession(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.isActive = false;
    session.updatedAt = new Date();
    
    console.log(`🏁 Session ${session.title} ended`);
    
    return {
      session: session.getSummary(),
      message: 'La historia ha llegado a su fin.'
    };
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const playerActions = session.storyHistory.filter(entry => entry.type === 'player_action');
    const aiNarratives = session.storyHistory.filter(entry => entry.type === 'ai_narrative');
    
    return {
      totalEntries: session.storyHistory.length,
      playerActions: playerActions.length,
      aiNarratives: aiNarratives.length,
      averageActionsPerTurn: session.turnNumber > 0 ? playerActions.length / session.turnNumber : 0,
      sessionDuration: new Date() - session.createdAt,
      activePlayers: session.players.filter(p => p.isActive).length
    };
  }

  /**
   * Export session data
   */
  exportSession(sessionId) {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    return {
      session: session.toJSON(),
      stats: this.getSessionStats(sessionId),
      fullStory: session.getFullStory()
    };
  }

  /**
   * Clear memory cache (useful for testing)
   */
  clearMemoryCache() {
    const count = this.sessions.size;
    this.sessions.clear();
    console.log(`🗑️ Cleared ${count} sessions from memory cache`);
    return count;
  }

  /**
   * Clean up old sessions
   */
  cleanupOldSessions(maxAge = 24 * 60 * 60 * 1000) { // 24 hours
    const now = new Date();
    const toDelete = [];

    for (const [sessionId, session] of this.sessions.entries()) {
      if (!session.isActive && (now - session.updatedAt) > maxAge) {
        toDelete.push(sessionId);
      }
    }

    toDelete.forEach(sessionId => {
      this.sessions.delete(sessionId);
      console.log(`🗑️ Cleaned up old session: ${sessionId}`);
    });

    return toDelete.length;
  }
}

export default new NarrativeService(); 