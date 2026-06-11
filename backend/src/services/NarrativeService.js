import { StorySession } from '../models/StorySession.js';
import AIService from './AIService.js';
import { normalizeLanguage } from './narrativePrompts.js';
import { v4 as uuidv4 } from 'uuid';
import { getDatabaseConnection } from '../config/index.js';
import logger from '../utils/logger.js';
import { generateRoomCode } from '../utils/roomCode.js';

export class NarrativeService {
  constructor(options = {}) {
    this.sessions = new Map(); // Keep memory cache for performance - cleared for fresh start
    this.aiService = AIService;
    this.skipDatabase = options.skipDatabase === true;
    this._pool = null;
  }

  /**
   * Lazily resolve the database pool using the dynamic config selector.
   * Respects DATABASE_TYPE at startup; result is cached for the lifetime of the service.
   */
  async getPool() {
    if (!this._pool) this._pool = await getDatabaseConnection();
    return this._pool;
  }

  /**
   * Save session to database
   */
  async saveSessionToDatabase(session) {
    if (this.skipDatabase) return;
    try {
      const pool = await this.getPool();
      const client = await pool.connect();
      
      // Save main session
      await client.query(`
        INSERT INTO story_sessions (id, title, description, max_players, current_player_index,
                                  turn_number, is_active, world_context, settings, code, summary, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (id) DO UPDATE SET
          current_player_index = $5,
          turn_number = $6,
          is_active = $7,
          world_context = $8,
          code = $10,
          summary = $11,
          updated_at = $13
      `, [session.id, session.title, session.description, session.maxPlayers,
          session.currentPlayerIndex, session.turnNumber, session.isActive,
          JSON.stringify(session.worldContext), JSON.stringify(session.settings),
          session.code || null, session.summary ?? '', session.createdAt, session.updatedAt]);
      
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
      isActive: Boolean(sessionData.is_active),
      worldContext: JSON.parse(sessionData.world_context || '{}'),
      settings: JSON.parse(sessionData.settings || '{}'),
      code: sessionData.code || null,
      summary: sessionData.summary ?? '',
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
        isActive: Boolean(p.is_active),
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
    const pool = await this.getPool();
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
      const pool = await this.getPool();
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

    // Normalise mode and maxRounds
    const VALID_MODES = ['narrador-activo', 'colaborativo'];
    sessionData.settings = sessionData.settings || {};
    sessionData.settings.mode = VALID_MODES.includes(sessionData.settings.mode)
      ? sessionData.settings.mode : 'narrador-activo';
    const mr = Number(sessionData.settings.maxRounds);
    sessionData.settings.maxRounds = Number.isInteger(mr) && mr >= 3 && mr <= 50 ? mr : null;

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
    const pool = await this.getPool();
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
    if (this.skipDatabase) {
      return Array.from(this.sessions.values())
        .filter(session => session.isActive)
        .map(session => session.getSummary());
    }
    try {
      const pool = await this.getPool();
      const client = await pool.connect();
      
      // Get active sessions with player counts and story lengths.
      // Uses only narrative tables (story_sessions / story_session_players / story_history)
      // so the query works on both PostgreSQL and SQLite (is_active stored as 1 on SQLite).
      const result = await client.query(`
        SELECT
          ss.*,
          COALESCE(player_counts.player_count, 0) as player_count,
          COALESCE(story_counts.story_length, 0) as story_length
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
        WHERE ss.is_active = 1
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
        isActive: Boolean(row.is_active),
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

    // Allow joining a lobby (isActive=false, not yet started) OR an active session for reconnects.
    // Only block if the story is already in progress AND the player is not a known reconnect.
    // (isActive=true + storyHistory has content = game running; checked after reconnect short-circuit)

    // Reconnect: if a player with the same name (case-insensitive) already exists, return them
    const existing = session.players.find(
      p => p.name.trim().toLowerCase() === String(playerData.name || '').trim().toLowerCase()
    );
    if (existing) {
      existing.isActive = true;
      return { session: session.toJSON(), player: existing, message: 'Reconectado a la sesión' };
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
  async leaveSession(sessionId, playerId) {
    const session = await this.getSession(sessionId);
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
   * Start a session: activates it (lobby → active), generates the AI opening narrative.
   * Requires at least 2 players.
   */
  async startSession(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error('Sesión no encontrada');
    if (session.isActive) throw new Error('La sesión ya está en curso');
    if (session.players.length < 2) throw new Error('Se necesitan al menos 2 jugadores');

    const aiOpening = await this.aiService.generateOpening({
      language: session.settings.language,
      genre: session.settings.genre,
    });
    const opening = aiOpening ?? this.getFallbackNarrative({ characterName: 'los héroes' });

    session.isActive = true;
    session.currentPlayerIndex = 0;
    const entry = session.addAINarrative(opening);

    if (!this.skipDatabase) {
      await this.saveStoryEntryToDatabase(sessionId, entry);
      await this.saveSessionToDatabase(session);
    }

    return { session: session.toJSON(), opening };
  }

  /**
   * Close a round: call AI with all round actions, record narrative, advance turnNumber.
   * Throws if AI throws (turnNumber is left unincremented so the round can be retried).
   */
  async closeRound(session) {
    const roundActions = session.storyHistory.filter(
      e => e.type === 'player_action' && e.turnNumber === session.turnNumber
    );
    const prompt = this.buildRoundPrompt(session, roundActions);
    const language = (session.settings && session.settings.language) || 'es';
    const genre = (session.settings && session.settings.genre) || 'fantasy';

    // Throws → propagates with AI_NARRATION_FAILED marker; turnNumber is NOT incremented yet
    let aiText;
    try {
      aiText = await this.aiService.generateStoryNarrative(prompt, { language, genre });
    } catch (err) {
      err.code = 'AI_NARRATION_FAILED';
      throw err;
    }

    // null means unconfigured — use local fallback so the round always gets some narrative
    const narrative = aiText ?? this.getFallbackNarrative({ characterName: 'los héroes' });

    const aiEntry = session.addAINarrative(narrative);
    if (!this.skipDatabase) await this.saveStoryEntryToDatabase(session.id, aiEntry);
    session.turnNumber += 1;
    if (!this.skipDatabase) await this.saveSessionToDatabase(session);
    return narrative;
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

    const alreadyActed = session.storyHistory.some(
      e => e.type === 'player_action' && e.turnNumber === session.turnNumber && e.playerId === playerId
    );
    if (alreadyActed) throw new Error('Ya enviaste tu acción en esta ronda');

    const entry = session.addPlayerAction(playerId, text);
    if (!this.skipDatabase) await this.saveStoryEntryToDatabase(sessionId, entry);

    session.currentPlayerIndex = (session.currentPlayerIndex + 1) % session.players.length;
    const roundComplete = session.currentPlayerIndex === 0;

    let narrative = null;
    if (roundComplete) {
      // Persist advanced index before the AI call so a crash re-hydrates consistent turn state
      if (!this.skipDatabase) await this.saveSessionToDatabase(session);

      // closeRound throws → propagate (action+index already mutated; turnNumber not yet incremented)
      narrative = await this.closeRound(session);
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
   * Retry narration for the current round (when AI failed previously).
   * Only valid if there are player_actions for the current turnNumber and no ai_narrative yet.
   */
  async retryNarration(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error('Sesión no encontrada');

    const roundActions = session.storyHistory.filter(
      e => e.type === 'player_action' && e.turnNumber === session.turnNumber
    );
    if (roundActions.length === 0) throw new Error('No hay ronda pendiente de narrar');

    // Guard against double-narration: if this turn already has an ai_narrative, nothing to retry
    const alreadyNarrated = session.storyHistory.some(
      e => e.type === 'ai_narrative' && e.turnNumber === session.turnNumber
    );
    if (alreadyNarrated) throw new Error('No hay ronda pendiente de narrar');

    const narrative = await this.closeRound(session);
    return { narrative, turnNumber: session.turnNumber };
  }

  /**
   * Skip the current player's turn, advancing to the next player.
   * If advancing wraps back to index 0 (round complete), close the round.
   */
  async skipTurn(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session || !session.isActive) throw new Error('Sesión no activa');

    session.currentPlayerIndex = (session.currentPlayerIndex + 1) % session.players.length;
    const roundComplete = session.currentPlayerIndex === 0;

    if (!this.skipDatabase) await this.saveSessionToDatabase(session);

    let narrative = null;
    if (roundComplete) {
      const roundActions = session.storyHistory.filter(
        e => e.type === 'player_action' && e.turnNumber === session.turnNumber
      );
      if (roundActions.length > 0) {
        // There are actions this round — generate AI narrative
        narrative = await this.closeRound(session);
      } else {
        // Nobody acted this round — just advance turnNumber without narrating
        session.turnNumber += 1;
        if (!this.skipDatabase) await this.saveSessionToDatabase(session);
      }
    }

    return {
      roundComplete,
      narrative,
      nextPlayer: session.players[session.currentPlayerIndex],
      turnNumber: session.turnNumber,
    };
  }

  /**
   * Build a prompt summarising all actions of a round for the AI narrator.
   * Includes the opening narrative (world anchor) + the last 4 ai_narrative entries
   * for coherence, deduplicating overlap between them.
   */
  buildRoundPrompt(session, roundActions) {
    const allNarratives = session.storyHistory.filter(e => e.type === 'ai_narrative');
    const opening = allNarratives[0] ?? null;
    const recent = allNarratives.slice(-4);

    const actions = roundActions
      .map(e => `${e.playerName ?? '?'}: ${e.action}`)
      .join('\n');

    if (!opening) {
      // No narratives yet — story is just beginning
      return `ACCIONES DE ESTA RONDA:\n${actions}\n\nTu tarea: continúa la historia narrando SOLO el resultado de las acciones de esta ronda (100-180 palabras), como si fuera el siguiente párrafo del libro.`;
    }

    // Deduplicate: if the opening is already within the recent slice, avoid repeating it
    const recentWithoutOpening = recent.filter(e => e !== opening);
    const recentText = recentWithoutOpening.map(e => e.narrative).join('\n');

    let prompt = `CONTEXTO — YA NARRADO ANTES (solo para tu memoria, NO lo repitas):\n[INICIO DE LA HISTORIA]\n${opening.narrative}`;
    if (recentText) {
      prompt += `\n[ÚLTIMAS RONDAS]\n${recentText}`;
    }
    prompt += `\n\nACCIONES DE ESTA RONDA:\n${actions}\n\nTu tarea: continúa la historia narrando SOLO el resultado de las acciones de esta ronda (100-180 palabras), como si fuera el siguiente párrafo del libro.`;
    return prompt;
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
  async getSessionHistory(sessionId, limit = 20) {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    return session.storyHistory.slice(-limit);
  }

  /**
   * Update session settings
   */
  async updateSessionSettings(sessionId, newSettings) {
    const session = await this.getSession(sessionId);
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
  async updateWorldContext(sessionId, newContext) {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    session.updateWorldContext(newContext);
    return session.worldContext;
  }

  /**
   * End a session: generates an AI epilogue, records it, deactivates the session.
   */
  async endSession(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('Sesión no encontrada');
    }

    const summary = session.storyHistory
      .filter(e => e.type === 'ai_narrative')
      .map(e => e.narrative)
      .join('\n');

    const aiEpilogue = await this.aiService.generateEpilogue(summary, {
      language: session.settings.language,
      genre: session.settings.genre,
    });
    const epilogue = aiEpilogue ?? this.getFallbackNarrative({ characterName: 'los héroes' });

    const entry = session.addAINarrative(epilogue);
    entry.type = 'ai_epilogue';

    session.isActive = false;
    session.updatedAt = new Date();

    if (!this.skipDatabase) {
      await this.saveStoryEntryToDatabase(sessionId, entry);
      await this.saveSessionToDatabase(session);
    }

    console.log(`🏁 Session ${session.title} ended`);

    return {
      session: session.toJSON(),
      epilogue,
      message: 'Historia finalizada',
    };
  }

  /**
   * Get session statistics
   */
  async getSessionStats(sessionId) {
    const session = await this.getSession(sessionId);
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
  async exportSession(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    return {
      session: session.toJSON(),
      stats: await this.getSessionStats(sessionId),
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