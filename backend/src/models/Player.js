import { v4 as uuidv4 } from 'uuid';

export class Player {
  constructor({ name, civilizationName, avatar = null, socketId = null }) {
    this.id = uuidv4();
    this.name = name;
    this.civilizationName = civilizationName;
    this.avatar = avatar;
    this.socketId = socketId;
    this.resources = {
      food: 0,
      gold: 0,
      wood: 0,
      stone: 0,
      science: 0,
      culture: 0,
      army: 0
    };
    this.stats = {
      gamesPlayed: 0,
      gamesWon: 0,
      totalTurns: 0,
      citiesFounded: 0,
      territoriesConquered: 0
    };
    this.isOnline = true;
    this.lastSeen = new Date();
    this.createdAt = new Date();
  }

  updateStats(gameResult) {
    this.stats.gamesPlayed++;
    this.stats.totalTurns += gameResult.turns;
    this.stats.citiesFounded += gameResult.citiesFounded || 0;
    this.stats.territoriesConquered += gameResult.territoriesConquered || 0;
    
    if (gameResult.victory) {
      this.stats.gamesWon++;
    }
  }

  setOnline(socketId) {
    this.isOnline = true;
    this.socketId = socketId;
    this.lastSeen = new Date();
  }

  setOffline() {
    this.isOnline = false;
    this.socketId = null;
    this.lastSeen = new Date();
  }

  getWinRate() {
    return this.stats.gamesPlayed > 0 ? 
      (this.stats.gamesWon / this.stats.gamesPlayed) * 100 : 0;
  }

  toJSON() {
    return {
      id: this.id,
      name: this.name,
      civilizationName: this.civilizationName,
      avatar: this.avatar,
      isOnline: this.isOnline,
      stats: this.stats,
      createdAt: this.createdAt,
      lastSeen: this.lastSeen
    };
  }
}

export default Player; 