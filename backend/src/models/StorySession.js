import { v4 as uuidv4 } from 'uuid';

export class StorySession {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.title = data.title || 'Nueva Historia';
    this.description = data.description || 'Una aventura épica colaborativa';
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
    this.isActive = data.isActive === true;
    this.maxPlayers = data.maxPlayers || 6;
    this.currentPlayerIndex = data.currentPlayerIndex || 0;
    this.turnNumber = data.turnNumber || 1;
    this.players = data.players || [];
    this.storyHistory = data.storyHistory || [];
    this.worldContext = data.worldContext || {
      setting: 'Un mundo medieval mágico',
      currentLocation: 'Un valle fértil entre montañas',
      timeOfDay: 'Amanecer',
      weather: 'Despejado',
      mood: 'Pacífico'
    };
    this.settings = {
      aiCreativity: 0.8,
      storyLength: 'medium', // short, medium, long
      genre: 'fantasy', // fantasy, historical, sci-fi, mystery
      gameType: 'character', // character, country, world
      language: 'es',
      ...(data.settings || {}),
      mode: data.settings?.mode ?? 'narrador-activo',
      maxRounds: data.settings?.maxRounds ?? null,
      turnMode: data.settings?.turnMode ?? 'sequential',
    };
    this.code = data.code !== undefined ? data.code : null;
    this.summary = data.summary ?? '';
  }

  /**
   * Add a new player to the session
   */
  addPlayer(playerData) {
    if (this.players.length >= this.maxPlayers) {
      throw new Error('Session is full');
    }

    const player = {
      id: playerData.id || uuidv4(),
      name: playerData.name,
      characterName: playerData.characterName || playerData.name,
      characterClass: playerData.characterClass || 'Aventurero',
      countryName: playerData.countryName || null,
      countryType: playerData.countryType || null,
      worldRole: playerData.worldRole || null,
      joinedAt: new Date(),
      isActive: true,
      turnOrder: this.players.length
    };

    this.players.push(player);
    return player;
  }

  /**
   * Remove a player from the session
   */
  removePlayer(playerId) {
    const index = this.players.findIndex(p => p.id === playerId);
    if (index !== -1) {
      this.players.splice(index, 1);
      // Reorder remaining players
      this.players.forEach((player, i) => {
        player.turnOrder = i;
      });
      return true;
    }
    return false;
  }

  /**
   * Record a player action entry at the current turnNumber.
   * Does NOT advance currentPlayerIndex or turnNumber — the service controls those.
   */
  addPlayerAction(playerId, actionText) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) {
      throw new Error('Player not found');
    }

    const entry = {
      id: uuidv4(),
      playerId,
      playerName: player.name,
      characterName: player.characterName,
      action: actionText,
      narrative: null,
      timestamp: new Date(),
      turnNumber: this.turnNumber,
      type: 'player_action',
      context: {}
    };

    this.storyHistory.push(entry);
    this.updatedAt = new Date();
    return entry;
  }

  /**
   * Record an AI narrative entry at the current turnNumber.
   */
  addAINarrative(narrativeText) {
    const entry = {
      id: uuidv4(),
      playerId: null,
      playerName: null,
      characterName: null,
      action: null,
      narrative: narrativeText,
      timestamp: new Date(),
      turnNumber: this.turnNumber,
      type: 'ai_narrative',
      context: {}
    };

    this.storyHistory.push(entry);
    this.updatedAt = new Date();
    return entry;
  }

  /**
   * Returns true when the round is stuck: all players have acted (currentPlayerIndex === 0)
   * but no ai_narrative was generated AFTER the last player_action of this turn.
   * Uses index comparison so an opening narrative (added before any actions) doesn't
   * falsely satisfy the "already narrated" check.
   */
  isRoundPending() {
    if (!this.isActive || this.currentPlayerIndex !== 0) return false;
    const lastActionIdx = this.storyHistory.reduce((maxIdx, e, i) =>
      (e.type === 'player_action' && e.turnNumber === this.turnNumber) ? i : maxIdx, -1);
    if (lastActionIdx === -1) return false; // no actions this turn yet
    const hasNarrativeAfterActions = this.storyHistory.slice(lastActionIdx + 1).some(
      e => e.type === 'ai_narrative' && e.turnNumber === this.turnNumber
    );
    return !hasNarrativeAfterActions;
  }

  /**
   * Get current player
   */
  getCurrentPlayer() {
    if (this.players.length === 0) return null;
    return this.players[this.currentPlayerIndex];
  }

  /**
   * Ids de jugadores con una acción registrada en el turnNumber actual.
   */
  actedPlayerIds() {
    const ids = new Set();
    for (const e of this.storyHistory) {
      if (e.type === 'player_action' && e.turnNumber === this.turnNumber) ids.add(e.playerId);
    }
    return [...ids];
  }

  /** True si el jugador ya envió su acción en el turnNumber actual. */
  hasActed(playerId) {
    return new Set(this.actedPlayerIds()).has(playerId);
  }

  /**
   * True cuando todos los jugadores de la sesión ya enviaron su acción esta ronda.
   */
  allActed() {
    if (this.players.length === 0) return false;
    const acted = new Set(this.actedPlayerIds());
    return this.players.every(p => acted.has(p.id));
  }

  /**
   * Get recent story history
   */
  getRecentHistory(limit = 10) {
    return this.storyHistory.slice(-limit);
  }

  /**
   * Get full story as text
   */
  getFullStory() {
    return this.storyHistory
      .map(entry => {
        if (entry.type === 'player_action') {
          return `${entry.characterName}: ${entry.action}`;
        } else if (entry.type === 'ai_narrative') {
          return entry.narrative;
        }
        return '';
      })
      .filter(text => text.length > 0)
      .join('\n\n');
  }

  /**
   * Update world context
   */
  updateWorldContext(newContext) {
    this.worldContext = { ...this.worldContext, ...newContext };
    this.updatedAt = new Date();
  }

  /**
   * Get session summary
   */
  getSummary() {
    return {
      id: this.id,
      code: this.code || null,
      title: this.title,
      playerCount: this.players.length,
      turnNumber: this.turnNumber,
      storyLength: this.storyHistory.length,
      currentPlayer: this.getCurrentPlayer(),
      isActive: this.isActive,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  /**
   * Export session data
   */
  toJSON() {
    return {
      id: this.id,
      code: this.code || null,
      title: this.title,
      description: this.description,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt,
      isActive: this.isActive,
      maxPlayers: this.maxPlayers,
      currentPlayerIndex: this.currentPlayerIndex,
      turnNumber: this.turnNumber,
      players: this.players,
      storyHistory: this.storyHistory,
      worldContext: this.worldContext,
      settings: this.settings,
      summary: this.summary,
      roundsRemaining: this.settings.maxRounds
        ? Math.max(0, this.settings.maxRounds - this.turnNumber + 1)
        : null,
      roundPending: this.isRoundPending(),
      actedPlayerIds: this.actedPlayerIds()
    };
  }

  /**
   * Create session from JSON data
   */
  static fromJSON(data) {
    return new StorySession(data);
  }
} 