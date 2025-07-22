import pool from '../config/database.js';

export class ResourceService {
  constructor() {
    this.resourceTypes = {
      food: { name: 'Food', description: 'Essential for population growth', baseProduction: 10 },
      gold: { name: 'Gold', description: 'Currency for trade and construction', baseProduction: 5 },
      wood: { name: 'Wood', description: 'Building material', baseProduction: 8 },
      stone: { name: 'Stone', description: 'Advanced building material', baseProduction: 3 },
      science: { name: 'Science', description: 'Research and technology', baseProduction: 2 },
      culture: { name: 'Culture', description: 'Civilization development', baseProduction: 1 },
      army: { name: 'Army', description: 'Military strength', baseProduction: 0 }
    };
  }

  /**
   * Initialize player resources for a new game
   */
  async initializePlayerResources(gameId, playerId) {
    try {
      const initialResources = {
        food: 100,
        gold: 50,
        wood: 80,
        stone: 30,
        science: 0,
        culture: 0,
        army: 1
      };

      const result = await pool.query(`
        INSERT INTO player_resources (game_id, player_id, food, gold, wood, stone, science, culture, army)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (game_id, player_id) DO UPDATE SET
          food = EXCLUDED.food,
          gold = EXCLUDED.gold,
          wood = EXCLUDED.wood,
          stone = EXCLUDED.stone,
          science = EXCLUDED.science,
          culture = EXCLUDED.culture,
          army = EXCLUDED.army,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `, [gameId, playerId, initialResources.food, initialResources.gold, initialResources.wood, 
          initialResources.stone, initialResources.science, initialResources.culture, initialResources.army]);

      return result.rows[0];
    } catch (error) {
      console.error('Error initializing player resources:', error);
      throw new Error('Failed to initialize player resources');
    }
  }

  /**
   * Get player resources
   */
  async getPlayerResources(gameId, playerId) {
    try {
      const result = await pool.query(`
        SELECT * FROM player_resources 
        WHERE game_id = $1 AND player_id = $2
      `, [gameId, playerId]);

      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting player resources:', error);
      throw new Error('Failed to get player resources');
    }
  }

  /**
   * Update player resources
   */
  async updatePlayerResources(gameId, playerId, resourceUpdates) {
    try {
      const validResources = Object.keys(this.resourceTypes);
      const updateFields = [];
      const values = [gameId, playerId];
      let valueIndex = 3;

      for (const [resource, value] of Object.entries(resourceUpdates)) {
        if (validResources.includes(resource)) {
          updateFields.push(`${resource} = $${valueIndex}`);
          values.push(value);
          valueIndex++;
        }
      }

      if (updateFields.length === 0) {
        throw new Error('No valid resources to update');
      }

      const query = `
        UPDATE player_resources 
        SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE game_id = $1 AND player_id = $2
        RETURNING *
      `;

      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error updating player resources:', error);
      throw new Error('Failed to update player resources');
    }
  }

  /**
   * Add resources to player (positive or negative values)
   */
  async addPlayerResources(gameId, playerId, resourceChanges) {
    try {
      const currentResources = await this.getPlayerResources(gameId, playerId);
      if (!currentResources) {
        throw new Error('Player resources not found');
      }

      const updatedResources = {};
      for (const [resource, change] of Object.entries(resourceChanges)) {
        const currentValue = currentResources[resource] || 0;
        updatedResources[resource] = Math.max(0, currentValue + change); // Prevent negative values
      }

      return await this.updatePlayerResources(gameId, playerId, updatedResources);
    } catch (error) {
      console.error('Error adding player resources:', error);
      throw new Error('Failed to add player resources');
    }
  }

  /**
   * Calculate resource production based on cities and improvements
   */
  async calculateResourceProduction(gameId, playerId) {
    try {
      // Get player cities
      const citiesResult = await pool.query(`
        SELECT c.*, mt.terrain, mt.resources
        FROM cities c
        JOIN map_tiles mt ON c.tile_id = mt.id
        WHERE c.game_id = $1 AND c.owner_id = $2
      `, [gameId, playerId]);

      const cities = citiesResult.rows;
      const production = {
        food: 0,
        gold: 0,
        wood: 0,
        stone: 0,
        science: 0,
        culture: 0,
        army: 0
      };

      for (const city of cities) {
        // Base city production
        production.food += this.resourceTypes.food.baseProduction;
        production.gold += this.resourceTypes.gold.baseProduction;
        production.wood += this.resourceTypes.wood.baseProduction;
        production.stone += this.resourceTypes.stone.baseProduction;
        production.science += this.resourceTypes.science.baseProduction;
        production.culture += this.resourceTypes.culture.baseProduction;

        // Terrain bonuses
        const terrainBonuses = this.getTerrainBonuses(city.terrain);
        for (const [resource, bonus] of Object.entries(terrainBonuses)) {
          if (production[resource] !== undefined) {
            production[resource] += bonus;
          }
        }

        // Population bonus
        const populationBonus = Math.floor(city.population / 100);
        production.food += populationBonus;
        production.gold += Math.floor(populationBonus / 2);
      }

      return production;
    } catch (error) {
      console.error('Error calculating resource production:', error);
      throw new Error('Failed to calculate resource production');
    }
  }

  /**
   * Get terrain bonuses for resource production
   */
  getTerrainBonuses(terrain) {
    const bonuses = {
      plains: { food: 2, gold: 1 },
      forest: { wood: 3, food: 1 },
      mountains: { stone: 4, gold: 2 },
      hills: { stone: 2, gold: 1, food: 1 },
      desert: { gold: 1 },
      tundra: { food: 1 },
      grassland: { food: 3, gold: 1 },
      jungle: { wood: 2, food: 2 },
      coast: { gold: 2, food: 1 },
      ocean: { food: 1 }
    };

    return bonuses[terrain] || {};
  }

  /**
   * Process end of turn resource generation
   */
  async processTurnResources(gameId, playerId) {
    try {
      const production = await this.calculateResourceProduction(gameId, playerId);
      const result = await this.addPlayerResources(gameId, playerId, production);
      
      return {
        resources: result,
        production: production
      };
    } catch (error) {
      console.error('Error processing turn resources:', error);
      throw new Error('Failed to process turn resources');
    }
  }

  /**
   * Check if player has enough resources for an action
   */
  async hasEnoughResources(gameId, playerId, requiredResources) {
    try {
      const currentResources = await this.getPlayerResources(gameId, playerId);
      if (!currentResources) {
        return false;
      }

      for (const [resource, amount] of Object.entries(requiredResources)) {
        if ((currentResources[resource] || 0) < amount) {
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('Error checking resources:', error);
      return false;
    }
  }

  /**
   * Get resource costs for different actions
   */
  getActionCosts() {
    return {
      foundCity: {
        food: 50,
        wood: 30,
        stone: 20
      },
      buildArmy: {
        food: 20,
        gold: 30,
        wood: 10
      },
      research: {
        science: 10,
        gold: 20
      },
      buildImprovement: {
        wood: 25,
        stone: 15,
        gold: 10
      }
    };
  }
}

export default new ResourceService(); 