import { v4 as uuidv4 } from 'uuid';

export class Game {
  constructor({
    name,
    maxPlayers = 4,
    mapSize = 20,
    gameMode = 'domination'
  }) {
    this.id = uuidv4();
    this.name = name;
    this.maxPlayers = maxPlayers;
    this.mapSize = mapSize;
    this.gameMode = gameMode;
    this.status = 'waiting'; // waiting, playing, finished
    this.currentTurn = 0;
    this.currentPlayerIndex = 0;
    this.players = [];
    this.map = this.generateMap();
    this.history = [];
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }

  generateMap() {
    const map = [];
    for (let x = 0; x < this.mapSize; x++) {
      map[x] = [];
      for (let y = 0; y < this.mapSize; y++) {
        map[x][y] = {
          x,
          y,
          terrain: this.getRandomTerrain(),
          resources: this.getRandomResources(),
          city: null,
          army: null,
          owner: null,
          discovered: false
        };
      }
    }
    return map;
  }

  getRandomTerrain() {
    const terrains = ['plains', 'forest', 'mountains', 'desert', 'water', 'hills'];
    return terrains[Math.floor(Math.random() * terrains.length)];
  }

  getRandomResources() {
    const resources = ['food', 'gold', 'wood', 'stone', 'science'];
    const hasResource = Math.random() < 0.3; // 30% chance of having a resource
    if (hasResource) {
      return resources[Math.floor(Math.random() * resources.length)];
    }
    return null;
  }

  addPlayer(player) {
    if (this.players.length >= this.maxPlayers) {
      throw new Error('Game is full');
    }
    if (this.status !== 'waiting') {
      throw new Error('Game has already started');
    }
    
    this.players.push(player);
    this.updatedAt = new Date();
    
    // Assign starting position
    this.assignStartingPosition(player);
  }

  assignStartingPosition(player) {
    // Find a suitable starting position
    const startingPositions = this.findStartingPositions();
    const position = startingPositions[this.players.length - 1];
    
    if (position) {
      this.map[position.x][position.y].city = {
        name: `${player.civilizationName} Capital`,
        level: 1,
        population: 1000,
        buildings: ['palace']
      };
      this.map[position.x][position.y].owner = player.id;
      this.map[position.x][position.y].discovered = true;
      
      // Discover surrounding tiles
      this.discoverSurroundingTiles(position.x, position.y, player.id);
    }
  }

  findStartingPositions() {
    const positions = [];
    const spacing = Math.floor(this.mapSize / 3);
    
    for (let i = 0; i < this.maxPlayers; i++) {
      const angle = (i / this.maxPlayers) * 2 * Math.PI;
      const x = Math.floor(this.mapSize / 2 + Math.cos(angle) * spacing);
      const y = Math.floor(this.mapSize / 2 + Math.sin(angle) * spacing);
      
      // Ensure position is within bounds and on land
      if (x >= 0 && x < this.mapSize && y >= 0 && y < this.mapSize) {
        if (this.map[x][y].terrain !== 'water') {
          positions.push({ x, y });
        }
      }
    }
    
    return positions;
  }

  discoverSurroundingTiles(centerX, centerY, playerId) {
    const radius = 2;
    for (let x = centerX - radius; x <= centerX + radius; x++) {
      for (let y = centerY - radius; y <= centerY + radius; y++) {
        if (x >= 0 && x < this.mapSize && y >= 0 && y < this.mapSize) {
          this.map[x][y].discovered = true;
        }
      }
    }
  }

  removePlayer(playerId) {
    this.players = this.players.filter(p => p.id !== playerId);
    this.updatedAt = new Date();
  }

  start() {
    if (this.players.length < 2) {
      throw new Error('Need at least 2 players to start');
    }
    if (this.status !== 'waiting') {
      throw new Error('Game has already started');
    }
    
    this.status = 'playing';
    this.currentTurn = 1;
    this.currentPlayerIndex = 0;
    this.updatedAt = new Date();
    
    // Initialize player resources
    this.players.forEach(player => {
      player.resources = {
        food: 100,
        gold: 50,
        wood: 50,
        stone: 30,
        science: 10,
        culture: 10,
        army: 1
      };
    });
  }

  getCurrentPlayer() {
    return this.players[this.currentPlayerIndex];
  }

  nextTurn() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    if (this.currentPlayerIndex === 0) {
      this.currentTurn++;
    }
    this.updatedAt = new Date();
  }

  processAction(playerId, action) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) {
      throw new Error('Player not found');
    }
    
    const currentPlayer = this.getCurrentPlayer();
    if (currentPlayer.id !== playerId) {
      throw new Error('Not your turn');
    }
    
    if (this.status !== 'playing') {
      throw new Error('Game is not active');
    }
    
    // Process the action based on type
    const result = this.executeAction(player, action);
    
    // Add to history
    this.history.push({
      turn: this.currentTurn,
      playerId,
      action,
      result,
      timestamp: new Date()
    });
    
    // Move to next turn
    this.nextTurn();
    
    // Check victory conditions
    this.checkVictoryConditions();
    
    return result;
  }

  nextTurn() {
    this.currentPlayerIndex = (this.currentPlayerIndex + 1) % this.players.length;
    if (this.currentPlayerIndex === 0) {
      this.currentTurn++;
      
      // End of round - apply passive effects
      this.applyEndOfRoundEffects();
    }
  }

  applyEndOfRoundEffects() {
    // Apply resource generation from cities
    this.players.forEach(player => {
      const playerTiles = this.getPlayerTiles(player.id);
      
      playerTiles.forEach(tile => {
        if (tile.city) {
          // Cities generate resources based on their buildings
          const baseGeneration = {
            food: 5,
            gold: 3,
            culture: 2
          };
          
          // Apply building bonuses
          tile.city.buildings.forEach(building => {
            switch (building) {
              case 'granary':
                baseGeneration.food += 3;
                break;
              case 'market':
                baseGeneration.gold += 5;
                break;
              case 'library':
                baseGeneration.science = (baseGeneration.science || 0) + 3;
                break;
              case 'barracks':
                baseGeneration.army = (baseGeneration.army || 0) + 2;
                break;
            }
          });
          
          // Add resources to player
          Object.entries(baseGeneration).forEach(([resource, amount]) => {
            player.resources[resource] = (player.resources[resource] || 0) + amount;
          });
        }
      });
    });
  }

  getPlayerTiles(playerId) {
    const tiles = [];
    for (let x = 0; x < this.mapSize; x++) {
      for (let y = 0; y < this.mapSize; y++) {
        if (this.map[x][y].owner === playerId) {
          tiles.push({
            ...this.map[x][y],
            x,
            y
          });
        }
      }
    }
    return tiles;
  }

  checkVictoryConditions() {
    // Check different victory conditions based on game mode
    switch (this.gameMode) {
      case 'domination':
        this.checkDominationVictory();
        break;
      case 'science':
        this.checkScienceVictory();
        break;
      case 'culture':
        this.checkCultureVictory();
        break;
      case 'economic':
        this.checkEconomicVictory();
        break;
    }
  }

  checkDominationVictory() {
    // Win by controlling most of the map
    const totalTiles = this.mapSize * this.mapSize;
    const requiredTiles = Math.floor(totalTiles * 0.6); // 60% of the map
    
    for (const player of this.players) {
      const controlledTiles = this.getPlayerTiles(player.id).length;
      if (controlledTiles >= requiredTiles) {
        this.endGame(player.id, 'domination');
        return;
      }
    }
  }

  checkScienceVictory() {
    // Win by reaching a certain science threshold
    const requiredScience = 1000;
    
    for (const player of this.players) {
      if (player.resources.science >= requiredScience) {
        this.endGame(player.id, 'science');
        return;
      }
    }
  }

  checkCultureVictory() {
    // Win by reaching a certain culture threshold
    const requiredCulture = 800;
    
    for (const player of this.players) {
      if (player.resources.culture >= requiredCulture) {
        this.endGame(player.id, 'culture');
        return;
      }
    }
  }

  checkEconomicVictory() {
    // Win by reaching a certain gold threshold
    const requiredGold = 1500;
    
    for (const player of this.players) {
      if (player.resources.gold >= requiredGold) {
        this.endGame(player.id, 'economic');
        return;
      }
    }
  }

  endGame(winnerId, victoryType) {
    this.status = 'finished';
    this.winner = {
      playerId: winnerId,
      player: this.players.find(p => p.id === winnerId),
      victoryType,
      turn: this.currentTurn
    };
    
    this.history.push({
      turn: this.currentTurn,
      type: 'game_end',
      winner: this.winner,
      timestamp: new Date()
    });
    
    this.updatedAt = new Date();
  }

  executeAction(player, action) {
    switch (action.type) {
      case 'found_city':
        return this.foundCity(player, action.position, action.name);
      case 'collect_resource':
        return this.collectResource(player, action.position);
      case 'move_army':
        return this.moveArmy(player, action.from, action.to);
      case 'build_infrastructure':
        return this.buildInfrastructure(player, action.position, action.building);
      case 'diplomacy':
        return this.handleDiplomacy(player, action.targetPlayerId, action.type);
      case 'free_action':
        return this.handleFreeAction(player, action.description);
      default:
        throw new Error('Unknown action type');
    }
  }

  foundCity(player, position, cityName) {
    const { x, y } = position;
    const tile = this.map[x][y];
    
    if (tile.city) {
      throw new Error('There is already a city here');
    }
    if (tile.owner && tile.owner !== player.id) {
      throw new Error('This territory belongs to another player');
    }
    if (tile.terrain === 'water') {
      throw new Error('Cannot found city on water');
    }
    
    // Check if player has enough resources
    const cost = { food: 50, gold: 100, wood: 30 };
    if (!this.canAfford(player, cost)) {
      throw new Error('Not enough resources to found city');
    }
    
    // Deduct resources
    this.deductResources(player, cost);
    
    // Create city
    tile.city = {
      name: cityName,
      level: 1,
      population: 500,
      buildings: ['town_hall']
    };
    tile.owner = player.id;
    
    // Discover surrounding tiles
    this.discoverSurroundingTiles(x, y, player.id);
    
    return {
      success: true,
      message: `Founded city ${cityName} at (${x}, ${y})`,
      city: tile.city
    };
  }

  collectResource(player, position) {
    const { x, y } = position;
    const tile = this.map[x][y];
    
    if (!tile.resources) {
      throw new Error('No resources available at this location');
    }
    if (tile.owner !== player.id) {
      throw new Error('You do not control this territory');
    }
    
    const resourceType = tile.resources;
    const amount = Math.floor(Math.random() * 20) + 10; // 10-30 resources
    
    player.resources[resourceType] += amount;
    
    return {
      success: true,
      message: `Collected ${amount} ${resourceType} from (${x}, ${y})`,
      resource: resourceType,
      amount
    };
  }

  moveArmy(player, from, to) {
    const fromTile = this.map[from.x][from.y];
    const toTile = this.map[to.x][to.y];
    
    if (!fromTile.army || fromTile.owner !== player.id) {
      throw new Error('No army to move from this position');
    }
    
    // Check if destination is adjacent
    const distance = Math.abs(from.x - to.x) + Math.abs(from.y - to.y);
    if (distance > 1) {
      throw new Error('Can only move to adjacent tiles');
    }
    
    // Move army
    toTile.army = fromTile.army;
    fromTile.army = null;
    
    // If moving to enemy territory, initiate combat
    if (toTile.owner && toTile.owner !== player.id) {
      return this.initiateCombat(player, to);
    }
    
    // Claim territory if neutral
    if (!toTile.owner) {
      toTile.owner = player.id;
    }
    
    return {
      success: true,
      message: `Moved army from (${from.x}, ${from.y}) to (${to.x}, ${to.y})`,
      position: to
    };
  }

  buildInfrastructure(player, position, building) {
    const { x, y } = position;
    const tile = this.map[x][y];
    
    if (tile.owner !== player.id) {
      throw new Error('You do not control this territory');
    }
    if (!tile.city) {
      throw new Error('Can only build infrastructure in cities');
    }
    
    const buildingCosts = {
      granary: { food: 30, wood: 20 },
      market: { gold: 50, wood: 30 },
      library: { science: 20, stone: 40 },
      barracks: { gold: 40, stone: 30 }
    };
    
    const cost = buildingCosts[building];
    if (!cost) {
      throw new Error('Unknown building type');
    }
    
    if (!this.canAfford(player, cost)) {
      throw new Error('Not enough resources to build this');
    }
    
    // Deduct resources
    this.deductResources(player, cost);
    
    // Add building to city
    tile.city.buildings.push(building);
    
    return {
      success: true,
      message: `Built ${building} in ${tile.city.name}`,
      building
    };
  }

  handleDiplomacy(player, targetPlayerId, type) {
    const targetPlayer = this.players.find(p => p.id === targetPlayerId);
    if (!targetPlayer) {
      throw new Error('Target player not found');
    }
    
    // Simple diplomacy implementation
    return {
      success: true,
      message: `Diplomatic action ${type} sent to ${targetPlayer.civilizationName}`,
      type,
      target: targetPlayer.civilizationName
    };
  }

  handleFreeAction(player, description) {
    // This will be processed by AI later
    return {
      success: true,
      message: `Free action: ${description}`,
      description,
      needsAIProcessing: true
    };
  }

  canAfford(player, cost) {
    for (const [resource, amount] of Object.entries(cost)) {
      if (player.resources[resource] < amount) {
        return false;
      }
    }
    return true;
  }

  deductResources(player, cost) {
    for (const [resource, amount] of Object.entries(cost)) {
      player.resources[resource] -= amount;
    }
  }

  discoverSurroundingTiles(x, y, playerId) {
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx >= 0 && nx < this.mapSize && ny >= 0 && ny < this.mapSize) {
          this.map[nx][ny].discovered = true;
        }
      }
    }
  }

  getAvailableActions(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) {
      return [];
    }

    const actions = [];
    const playerTiles = this.getPlayerTiles(playerId);

    // Basic actions always available
    actions.push(
      { type: 'found_city', name: 'Found City', cost: { food: 50, gold: 100, wood: 30 } },
      { type: 'collect_resource', name: 'Collect Resources', cost: {} },
      { type: 'move_army', name: 'Move Army', cost: {} },
      { type: 'diplomacy', name: 'Diplomacy', cost: {} },
      { type: 'free_action', name: 'Free Action', cost: {} }
    );

    // Infrastructure actions available if player has cities
    if (playerTiles.some(tile => tile.city)) {
      actions.push(
        { type: 'build_infrastructure', name: 'Build Infrastructure', cost: { varies: true } }
      );
    }

    return actions;
  }

  initiateCombat(attacker, position) {
    // Simple combat resolution
    const attackerStrength = attacker.resources.army;
    const defenderStrength = Math.floor(Math.random() * 10) + 5;
    
    const victory = attackerStrength > defenderStrength;
    
    if (victory) {
      this.map[position.x][position.y].owner = attacker.id;
      return {
        success: true,
        message: `Victory! Conquered territory at (${position.x}, ${position.y})`,
        combat: { victory: true, attackerStrength, defenderStrength }
      };
    } else {
      return {
        success: false,
        message: `Defeat! Failed to conquer territory at (${position.x}, ${position.y})`,
        combat: { victory: false, attackerStrength, defenderStrength }
      };
    }
  }

  getState() {
    return {
      id: this.id,
      name: this.name,
      status: this.status,
      currentTurn: this.currentTurn,
      currentPlayer: this.getCurrentPlayer(),
      players: this.players,
      map: this.map,
      gameMode: this.gameMode,
      maxPlayers: this.maxPlayers,
      createdAt: this.createdAt,
      updatedAt: this.updatedAt
    };
  }

  getPlayerView(playerId) {
    const player = this.players.find(p => p.id === playerId);
    if (!player) {
      throw new Error('Player not found');
    }
    
    // Return only what the player can see
    const visibleMap = this.map.map(row => 
      row.map(tile => ({
        ...tile,
        // Hide information about tiles the player hasn't discovered
        ...(tile.discovered ? {} : {
          resources: null,
          city: null,
          army: null,
          owner: null
        })
      }))
    );
    
    return {
      ...this.getState(),
      map: visibleMap,
      playerResources: player.resources
    };
  }

  addPlayer(player) {
    if (this.players.length >= this.maxPlayers) {
      throw new Error('Game is full');
    }
    
    if (this.status !== 'waiting') {
      throw new Error('Cannot join game that is not waiting');
    }

    // Check if player is already in the game
    const existingPlayer = this.players.find(p => p.id === player.id);
    if (existingPlayer) {
      throw new Error('Player already in game');
    }

    this.players.push(player);
    this.updatedAt = new Date();
  }

  removePlayer(playerId) {
    const playerIndex = this.players.findIndex(p => p.id === playerId);
    if (playerIndex === -1) {
      throw new Error('Player not found in game');
    }

    this.players.splice(playerIndex, 1);
    
    // If current player was removed, advance to next player
    if (this.currentPlayerIndex >= this.players.length) {
      this.currentPlayerIndex = 0;
    }
    
    this.updatedAt = new Date();
    
    // If no players left, mark game as finished
    if (this.players.length === 0) {
      this.status = 'finished';
    }
  }

  startGame() {
    if (this.players.length < 2) {
      throw new Error('Need at least 2 players to start');
    }
    
    if (this.status !== 'waiting') {
      throw new Error('Game is not in waiting state');
    }

    this.status = 'playing';
    this.currentTurn = 1;
    this.currentPlayerIndex = 0;
    this.updatedAt = new Date();
    
    // Initialize player starting positions and resources
    this.players.forEach((player, index) => {
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
      
      // Place starting city at random position
      const startX = Math.floor(Math.random() * this.mapSize);
      const startY = Math.floor(Math.random() * this.mapSize);
      
      this.map[startX][startY].city = {
        name: `${player.civilizationName} Capital`,
        level: 1,
        population: 1000,
        owner: player.id
      };
      this.map[startX][startY].owner = player.id;
      this.map[startX][startY].discovered = true;
      
      // Discover surrounding tiles
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          const nx = startX + dx;
          const ny = startY + dy;
          if (nx >= 0 && nx < this.mapSize && ny >= 0 && ny < this.mapSize) {
            this.map[nx][ny].discovered = true;
          }
        }
      }
    });
  }
}

export default Game; 