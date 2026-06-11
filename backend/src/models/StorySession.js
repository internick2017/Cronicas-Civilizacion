import { v4 as uuidv4 } from 'uuid';

export class StorySession {
  constructor(data = {}) {
    this.id = data.id || uuidv4();
    this.title = data.title || 'Nueva Historia';
    this.description = data.description || 'Una aventura épica colaborativa';
    this.createdAt = data.createdAt || new Date();
    this.updatedAt = data.updatedAt || new Date();
    this.isActive = data.isActive !== false;
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
    this.settings = data.settings || {
      aiCreativity: 0.8,
      storyLength: 'medium', // short, medium, long
      genre: 'fantasy', // fantasy, historical, sci-fi, mystery
      gameType: 'character', // character, country, world
      language: 'es'
    };
    this.code = data.code !== undefined ? data.code : null;
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
   * Add a story action and generate narrative
   * @deprecated Use addPlayerAction (does NOT advance index/turn — caller controls those)
   */
  addStoryAction(playerId, actionText) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) {
      throw new Error('Player not found');
    }

    const storyEntry = {
      id: uuidv4(),
      playerId,
      playerName: player.name,
      characterName: player.characterName,
      action: actionText,
      timestamp: new Date(),
      turnNumber: this.turnNumber,
      type: 'player_action'
    };

    this.storyHistory.push(storyEntry);
    this.updatedAt = new Date();

    // Move to next player
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;

    // Increment turn if we've gone through all players
    if (this.currentPlayerIndex === 0) {
      this.turnNumber++;
    }

    return storyEntry;
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
   * Add AI-generated narrative response
   */
  addNarrativeResponse(narrativeText, context = {}) {
    const narrativeEntry = {
      id: uuidv4(),
      narrative: narrativeText,
      timestamp: new Date(),
      turnNumber: this.turnNumber,
      type: 'ai_narrative',
      context
    };

    this.storyHistory.push(narrativeEntry);
    this.updatedAt = new Date();
    return narrativeEntry;
  }

  /**
   * Get current player
   */
  getCurrentPlayer() {
    if (this.players.length === 0) return null;
    return this.players[this.currentPlayerIndex];
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
      settings: this.settings
    };
  }

  /**
   * Create session from JSON data
   */
  static fromJSON(data) {
    return new StorySession(data);
  }
} 