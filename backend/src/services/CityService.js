import pool from '../config/database.js';
import resourceService from './ResourceService.js';

export class CityService {
  constructor() {
    this.cityTypes = {
      capital: { name: 'Capital', population: 1000, defense: 10 },
      major: { name: 'Major City', population: 500, defense: 5 },
      minor: { name: 'Minor City', population: 200, defense: 2 },
      settlement: { name: 'Settlement', population: 50, defense: 1 }
    };
  }

  /**
   * Found a new city
   */
  async foundCity(gameId, playerId, tileId, cityName, cityType = 'settlement') {
    try {
      // Check if tile is available
      const tileResult = await pool.query(`
        SELECT * FROM map_tiles 
        WHERE id = $1 AND game_id = $2
      `, [tileId, gameId]);

      if (tileResult.rows.length === 0) {
        throw new Error('Tile not found');
      }

      const tile = tileResult.rows[0];

      // Check if tile is already occupied
      const existingCity = await pool.query(`
        SELECT * FROM cities 
        WHERE tile_id = $1 AND game_id = $2
      `, [tileId, gameId]);

      if (existingCity.rows.length > 0) {
        throw new Error('Tile is already occupied by another city');
      }

      // Check if player has enough resources to found city
      const cityCosts = resourceService.getActionCosts().foundCity;
      const hasEnoughResources = await resourceService.hasEnoughResources(gameId, playerId, cityCosts);

      if (!hasEnoughResources) {
        throw new Error('Not enough resources to found city');
      }

      // Get city type configuration
      const cityConfig = this.cityTypes[cityType];
      if (!cityConfig) {
        throw new Error('Invalid city type');
      }

      // Create the city
      const cityResult = await pool.query(`
        INSERT INTO cities (game_id, owner_id, tile_id, name, city_type, population, defense, happiness, culture_level, science_level, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, CURRENT_TIMESTAMP)
        RETURNING *
      `, [gameId, playerId, tileId, cityName, cityType, cityConfig.population, cityConfig.defense, 100, 1, 1]);

      const city = cityResult.rows[0];

      // Deduct resources from player
      await resourceService.addPlayerResources(gameId, playerId, {
        food: -cityCosts.food,
        wood: -cityCosts.wood,
        stone: -cityCosts.stone
      });

      // Update tile to show city
      await pool.query(`
        UPDATE map_tiles 
        SET has_city = true, city_id = $1
        WHERE id = $2
      `, [city.id, tileId]);

      return {
        success: true,
        city: city,
        message: `City "${cityName}" founded successfully`
      };
    } catch (error) {
      console.error('Error founding city:', error);
      throw new Error(`Failed to found city: ${error.message}`);
    }
  }

  /**
   * Get all cities for a player in a game
   */
  async getPlayerCities(gameId, playerId) {
    try {
      const result = await pool.query(`
        SELECT c.*, mt.x, mt.y, mt.terrain, mt.resources
        FROM cities c
        JOIN map_tiles mt ON c.tile_id = mt.id
        WHERE c.game_id = $1 AND c.owner_id = $2
        ORDER BY c.created_at DESC
      `, [gameId, playerId]);

      return result.rows;
    } catch (error) {
      console.error('Error getting player cities:', error);
      throw new Error('Failed to get player cities');
    }
  }

  /**
   * Get specific city by ID
   */
  async getCityById(cityId) {
    try {
      const result = await pool.query(`
        SELECT c.*, mt.x, mt.y, mt.terrain, mt.resources
        FROM cities c
        JOIN map_tiles mt ON c.tile_id = mt.id
        WHERE c.id = $1
      `, [cityId]);

      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting city:', error);
      throw new Error('Failed to get city');
    }
  }

  /**
   * Update city population and stats
   */
  async updateCityStats(cityId, updates) {
    try {
      const validFields = ['population', 'defense', 'happiness', 'culture_level', 'science_level'];
      const updateFields = [];
      const values = [cityId];
      let valueIndex = 2;

      for (const [field, value] of Object.entries(updates)) {
        if (validFields.includes(field)) {
          updateFields.push(`${field} = $${valueIndex}`);
          values.push(value);
          valueIndex++;
        }
      }

      if (updateFields.length === 0) {
        throw new Error('No valid fields to update');
      }

      const query = `
        UPDATE cities 
        SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING *
      `;

      const result = await pool.query(query, values);
      return result.rows[0];
    } catch (error) {
      console.error('Error updating city stats:', error);
      throw new Error('Failed to update city stats');
    }
  }

  /**
   * Grow city population
   */
  async growCity(cityId, gameId, playerId) {
    try {
      const city = await this.getCityById(cityId);
      if (!city) {
        throw new Error('City not found');
      }

      // Calculate growth based on happiness and food availability
      const growthRate = Math.min(city.happiness / 100, 0.1); // Max 10% growth
      const newPopulation = Math.floor(city.population * (1 + growthRate));

      // Check if player has enough food to support growth
      const foodRequired = newPopulation - city.population;
      const playerResources = await resourceService.getPlayerResources(gameId, playerId);
      
      if (playerResources.food < foodRequired) {
        throw new Error('Not enough food to support city growth');
      }

      // Update city population
      const updatedCity = await this.updateCityStats(cityId, {
        population: newPopulation
      });

      // Deduct food cost
      await resourceService.addPlayerResources(gameId, playerId, {
        food: -foodRequired
      });

      return {
        success: true,
        city: updatedCity,
        growth: newPopulation - city.population,
        message: `City population grew by ${newPopulation - city.population}`
      };
    } catch (error) {
      console.error('Error growing city:', error);
      throw new Error(`Failed to grow city: ${error.message}`);
    }
  }

  /**
   * Build improvement in city
   */
  async buildImprovement(cityId, gameId, playerId, improvementType) {
    try {
      const city = await this.getCityById(cityId);
      if (!city) {
        throw new Error('City not found');
      }

      const improvementCosts = resourceService.getActionCosts().buildImprovement;
      const hasEnoughResources = await resourceService.hasEnoughResources(gameId, playerId, improvementCosts);

      if (!hasEnoughResources) {
        throw new Error('Not enough resources to build improvement');
      }

      // Apply improvement effects
      const improvements = {
        farm: { food: 5, happiness: 10 },
        mine: { stone: 3, gold: 2 },
        lumbermill: { wood: 4 },
        library: { science: 3, culture: 1 },
        temple: { culture: 2, happiness: 15 },
        barracks: { defense: 5, army: 1 }
      };

      const improvement = improvements[improvementType];
      if (!improvement) {
        throw new Error('Invalid improvement type');
      }

      // Update city stats
      const cityUpdates = {};
      for (const [stat, bonus] of Object.entries(improvement)) {
        if (stat === 'defense') {
          cityUpdates[stat] = city[stat] + bonus;
        } else if (stat === 'happiness') {
          cityUpdates[stat] = Math.min(100, city[stat] + bonus);
        } else if (stat === 'culture_level' || stat === 'science_level') {
          cityUpdates[stat] = city[stat] + 1;
        }
      }

      const updatedCity = await this.updateCityStats(cityId, cityUpdates);

      // Add resources to player if improvement produces them
      const resourceBonus = {};
      for (const [resource, amount] of Object.entries(improvement)) {
        if (['food', 'wood', 'stone', 'gold', 'science', 'culture', 'army'].includes(resource)) {
          resourceBonus[resource] = amount;
        }
      }

      if (Object.keys(resourceBonus).length > 0) {
        await resourceService.addPlayerResources(gameId, playerId, resourceBonus);
      }

      // Deduct improvement costs
      await resourceService.addPlayerResources(gameId, playerId, {
        wood: -improvementCosts.wood,
        stone: -improvementCosts.stone,
        gold: -improvementCosts.gold
      });

      return {
        success: true,
        city: updatedCity,
        improvement: improvementType,
        message: `${improvementType} built successfully`
      };
    } catch (error) {
      console.error('Error building improvement:', error);
      throw new Error(`Failed to build improvement: ${error.message}`);
    }
  }

  /**
   * Get city production summary
   */
  async getCityProduction(cityId) {
    try {
      const city = await this.getCityById(cityId);
      if (!city) {
        throw new Error('City not found');
      }

      // Calculate base production
      const production = {
        food: 10,
        gold: 5,
        wood: 8,
        stone: 3,
        science: 2,
        culture: 1,
        army: 0
      };

      // Add terrain bonuses
      const terrainBonuses = resourceService.getTerrainBonuses(city.terrain);
      for (const [resource, bonus] of Object.entries(terrainBonuses)) {
        if (production[resource] !== undefined) {
          production[resource] += bonus;
        }
      }

      // Add population bonus
      const populationBonus = Math.floor(city.population / 100);
      production.food += populationBonus;
      production.gold += Math.floor(populationBonus / 2);

      // Add level bonuses
      production.science += city.science_level;
      production.culture += city.culture_level;

      return {
        city: city,
        production: production,
        population: city.population,
        happiness: city.happiness
      };
    } catch (error) {
      console.error('Error getting city production:', error);
      throw new Error('Failed to get city production');
    }
  }

  /**
   * Get all cities in a game
   */
  async getAllCitiesInGame(gameId) {
    try {
      const result = await pool.query(`
        SELECT c.*, mt.x, mt.y, mt.terrain, p.name as owner_name, p.civilization_name
        FROM cities c
        JOIN map_tiles mt ON c.tile_id = mt.id
        JOIN players p ON c.owner_id = p.id
        WHERE c.game_id = $1
        ORDER BY c.created_at DESC
      `, [gameId]);

      return result.rows;
    } catch (error) {
      console.error('Error getting all cities:', error);
      throw new Error('Failed to get all cities');
    }
  }

  /**
   * Check if player can found city on tile
   */
  async canFoundCity(gameId, playerId, tileId) {
    try {
      // Check if tile exists and is available
      const tileResult = await pool.query(`
        SELECT * FROM map_tiles 
        WHERE id = $1 AND game_id = $2
      `, [tileId, gameId]);

      if (tileResult.rows.length === 0) {
        return { canFound: false, reason: 'Tile not found' };
      }

      // Check if tile is already occupied
      const existingCity = await pool.query(`
        SELECT * FROM cities 
        WHERE tile_id = $1 AND game_id = $2
      `, [tileId, gameId]);

      if (existingCity.rows.length > 0) {
        return { canFound: false, reason: 'Tile is already occupied' };
      }

      // Check if player has enough resources
      const cityCosts = resourceService.getActionCosts().foundCity;
      const hasEnoughResources = await resourceService.hasEnoughResources(gameId, playerId, cityCosts);

      if (!hasEnoughResources) {
        return { canFound: false, reason: 'Not enough resources' };
      }

      return { canFound: true, costs: cityCosts };
    } catch (error) {
      console.error('Error checking if can found city:', error);
      return { canFound: false, reason: 'Error checking requirements' };
    }
  }
}

export default new CityService(); 