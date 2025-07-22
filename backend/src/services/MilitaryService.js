import pool from '../config/database.js';
import resourceService from './ResourceService.js';
import cityService from './CityService.js';

export class MilitaryService {
  constructor() {
    this.unitTypes = {
      warrior: { 
        name: 'Warrior', 
        attack: 10, 
        defense: 8, 
        health: 100, 
        movement: 2,
        cost: { food: 20, gold: 30, wood: 10 },
        description: 'Basic infantry unit'
      },
      archer: { 
        name: 'Archer', 
        attack: 15, 
        defense: 5, 
        health: 80, 
        movement: 2,
        cost: { food: 15, gold: 25, wood: 15 },
        description: 'Ranged combat unit'
      },
      cavalry: { 
        name: 'Cavalry', 
        attack: 20, 
        defense: 12, 
        health: 120, 
        movement: 3,
        cost: { food: 25, gold: 40, wood: 5 },
        description: 'Fast mounted unit'
      },
      spearman: { 
        name: 'Spearman', 
        attack: 12, 
        defense: 15, 
        health: 90, 
        movement: 2,
        cost: { food: 18, gold: 20, wood: 12 },
        description: 'Anti-cavalry unit'
      },
      catapult: { 
        name: 'Catapult', 
        attack: 25, 
        defense: 3, 
        health: 60, 
        movement: 1,
        cost: { food: 10, gold: 50, wood: 30, stone: 20 },
        description: 'Siege weapon'
      }
    };

    this.armyTypes = {
      infantry: { name: 'Infantry Army', maxUnits: 10, bonus: { attack: 5, defense: 5 } },
      cavalry: { name: 'Cavalry Army', maxUnits: 8, bonus: { attack: 8, defense: 3, movement: 1 } },
      mixed: { name: 'Mixed Army', maxUnits: 12, bonus: { attack: 3, defense: 3 } },
      siege: { name: 'Siege Army', maxUnits: 6, bonus: { attack: 10, defense: 2 } }
    };
  }

  /**
   * Create a new military unit
   */
  async createUnit(gameId, playerId, unitType, tileId) {
    try {
      // Validate unit type
      const unitConfig = this.unitTypes[unitType];
      if (!unitConfig) {
        throw new Error('Invalid unit type');
      }

      // Check if player has enough resources
      const hasEnoughResources = await resourceService.hasEnoughResources(gameId, playerId, unitConfig.cost);
      if (!hasEnoughResources) {
        throw new Error('Not enough resources to create unit');
      }

      // Check if tile is available
      const tileResult = await pool.query(`
        SELECT * FROM map_tiles 
        WHERE id = $1 AND game_id = $2
      `, [tileId, gameId]);

      if (tileResult.rows.length === 0) {
        throw new Error('Tile not found');
      }

      // Create the unit
      const unitResult = await pool.query(`
        INSERT INTO armies (game_id, owner_id, tile_id, unit_type, name, attack, defense, health, max_health, movement, current_movement, experience, level, created_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, CURRENT_TIMESTAMP)
        RETURNING *
      `, [gameId, playerId, tileId, unitType, unitConfig.name, unitConfig.attack, unitConfig.defense, 
          unitConfig.health, unitConfig.health, unitConfig.movement, unitConfig.movement, 0, 1]);

      const unit = unitResult.rows[0];

      // Deduct resources from player
      await resourceService.addPlayerResources(gameId, playerId, {
        food: -unitConfig.cost.food,
        gold: -unitConfig.cost.gold,
        wood: -unitConfig.cost.wood,
        stone: -(unitConfig.cost.stone || 0)
      });

      // Update tile to show unit
      await pool.query(`
        UPDATE map_tiles 
        SET has_army = true, army_id = $1
        WHERE id = $2
      `, [unit.id, tileId]);

      return {
        success: true,
        unit: unit,
        message: `${unitConfig.name} created successfully`
      };
    } catch (error) {
      console.error('Error creating unit:', error);
      throw new Error(`Failed to create unit: ${error.message}`);
    }
  }

  /**
   * Get all units for a player
   */
  async getPlayerUnits(gameId, playerId) {
    try {
      const result = await pool.query(`
        SELECT a.*, mt.x, mt.y, mt.terrain
        FROM armies a
        JOIN map_tiles mt ON a.tile_id = mt.id
        WHERE a.game_id = $1 AND a.owner_id = $2 AND a.health > 0
        ORDER BY a.created_at DESC
      `, [gameId, playerId]);

      return result.rows;
    } catch (error) {
      console.error('Error getting player units:', error);
      throw new Error('Failed to get player units');
    }
  }

  /**
   * Get specific unit by ID
   */
  async getUnitById(unitId) {
    try {
      const result = await pool.query(`
        SELECT a.*, mt.x, mt.y, mt.terrain
        FROM armies a
        JOIN map_tiles mt ON a.tile_id = mt.id
        WHERE a.id = $1
      `, [unitId]);

      return result.rows[0] || null;
    } catch (error) {
      console.error('Error getting unit:', error);
      throw new Error('Failed to get unit');
    }
  }

  /**
   * Move unit to new tile
   */
  async moveUnit(unitId, newTileId, gameId, playerId) {
    try {
      const unit = await this.getUnitById(unitId);
      if (!unit) {
        throw new Error('Unit not found');
      }

      if (unit.owner_id !== playerId) {
        throw new Error('You can only move your own units');
      }

      if (unit.current_movement <= 0) {
        throw new Error('Unit has no movement points left');
      }

      // Check if new tile is valid and reachable
      const newTileResult = await pool.query(`
        SELECT * FROM map_tiles 
        WHERE id = $1 AND game_id = $2
      `, [newTileId, gameId]);

      if (newTileResult.rows.length === 0) {
        throw new Error('Destination tile not found');
      }

      const newTile = newTileResult.rows[0];

      // Calculate distance (simple Manhattan distance for now)
      const distance = Math.abs(unit.x - newTile.x) + Math.abs(unit.y - newTile.y);
      if (distance > unit.current_movement) {
        throw new Error('Destination too far for current movement points');
      }

      // Check if tile is occupied by enemy
      if (newTile.has_army && newTile.army_id !== unitId) {
        throw new Error('Destination tile is occupied by another unit');
      }

      // Update unit position
      await pool.query(`
        UPDATE armies 
        SET tile_id = $1, current_movement = current_movement - $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [newTileId, distance, unitId]);

      // Update old tile
      await pool.query(`
        UPDATE map_tiles 
        SET has_army = false, army_id = NULL
        WHERE id = $1
      `, [unit.tile_id]);

      // Update new tile
      await pool.query(`
        UPDATE map_tiles 
        SET has_army = true, army_id = $1
        WHERE id = $2
      `, [unitId, newTileId]);

      return {
        success: true,
        message: `Unit moved successfully`,
        movementUsed: distance,
        remainingMovement: unit.current_movement - distance
      };
    } catch (error) {
      console.error('Error moving unit:', error);
      throw new Error(`Failed to move unit: ${error.message}`);
    }
  }

  /**
   * Attack another unit or city
   */
  async attack(attackerId, targetId, gameId, playerId) {
    try {
      const attacker = await this.getUnitById(attackerId);
      if (!attacker || attacker.owner_id !== playerId) {
        throw new Error('Invalid attacker');
      }

      if (attacker.current_movement <= 0) {
        throw new Error('Attacker has no movement points left');
      }

      // Check if target is a unit or city
      let target, targetType;
      
      // Check if target is a unit
      const targetUnit = await this.getUnitById(targetId);
      if (targetUnit) {
        target = targetUnit;
        targetType = 'unit';
      } else {
        // Check if target is a city
        const targetCity = await cityService.getCityById(targetId);
        if (targetCity) {
          target = targetCity;
          targetType = 'city';
        } else {
          throw new Error('Target not found');
        }
      }

      // Check if target is enemy
      if (target.owner_id === playerId) {
        throw new Error('Cannot attack your own units/cities');
      }

      // Calculate combat
      const combatResult = this.calculateCombat(attacker, target, targetType);

      // Apply combat results
      if (targetType === 'unit') {
        await this.applyUnitCombatResult(attacker, target, combatResult);
      } else {
        await this.applyCityCombatResult(attacker, target, combatResult);
      }

      // Use movement points
      await pool.query(`
        UPDATE armies 
        SET current_movement = 0, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
      `, [attackerId]);

      return {
        success: true,
        combatResult: combatResult,
        message: `Attack completed: ${combatResult.winner} won`
      };
    } catch (error) {
      console.error('Error in attack:', error);
      throw new Error(`Attack failed: ${error.message}`);
    }
  }

  /**
   * Calculate combat between units
   */
  calculateCombat(attacker, defender, defenderType) {
    const attackerPower = attacker.attack + (attacker.experience / 10);
    let defenderPower;

    if (defenderType === 'unit') {
      defenderPower = defender.defense + (defender.experience / 10);
    } else {
      // City defense
      defenderPower = defender.defense * 2; // Cities are harder to attack
    }

    // Add some randomness
    const attackerRoll = Math.random() * 0.4 + 0.8; // 0.8 to 1.2
    const defenderRoll = Math.random() * 0.4 + 0.8;

    const attackerFinal = attackerPower * attackerRoll;
    const defenderFinal = defenderPower * defenderRoll;

    const attackerWins = attackerFinal > defenderFinal;
    const damageMultiplier = Math.abs(attackerFinal - defenderFinal) / Math.max(attackerFinal, defenderFinal);

    return {
      attackerPower: attackerFinal,
      defenderPower: defenderFinal,
      winner: attackerWins ? 'attacker' : 'defender',
      damageMultiplier: damageMultiplier,
      attackerDamage: attackerWins ? 0 : Math.floor(defenderFinal * damageMultiplier),
      defenderDamage: attackerWins ? Math.floor(attackerFinal * damageMultiplier) : 0
    };
  }

  /**
   * Apply combat results to units
   */
  async applyUnitCombatResult(attacker, defender, combatResult) {
    // Update attacker health
    const newAttackerHealth = Math.max(0, attacker.health - combatResult.attackerDamage);
    await pool.query(`
      UPDATE armies 
      SET health = $1, experience = experience + 10, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [newAttackerHealth, attacker.id]);

    // Update defender health
    const newDefenderHealth = Math.max(0, defender.health - combatResult.defenderDamage);
    await pool.query(`
      UPDATE armies 
      SET health = $1, experience = experience + 10, updated_at = CURRENT_TIMESTAMP
      WHERE id = $2
    `, [newDefenderHealth, defender.id]);

    // Remove dead units from tiles
    if (newAttackerHealth <= 0) {
      await pool.query(`
        UPDATE map_tiles 
        SET has_army = false, army_id = NULL
        WHERE army_id = $1
      `, [attacker.id]);
    }

    if (newDefenderHealth <= 0) {
      await pool.query(`
        UPDATE map_tiles 
        SET has_army = false, army_id = NULL
        WHERE army_id = $1
      `, [defender.id]);
    }
  }

  /**
   * Apply combat results to cities
   */
  async applyCityCombatResult(attacker, city, combatResult) {
    if (combatResult.winner === 'attacker') {
      // City is captured
      await pool.query(`
        UPDATE cities 
        SET owner_id = $1, defense = defense - $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $3
      `, [attacker.owner_id, combatResult.defenderDamage, city.id]);

      // Update tile ownership
      await pool.query(`
        UPDATE map_tiles 
        SET owner_id = $1
        WHERE id = $2
      `, [attacker.owner_id, city.tile_id]);
    } else {
      // City successfully defends
      await pool.query(`
        UPDATE cities 
        SET defense = defense - $1, updated_at = CURRENT_TIMESTAMP
        WHERE id = $2
      `, [Math.floor(combatResult.defenderDamage / 2), city.id]);
    }
  }

  /**
   * Reset movement points for all units (end of turn)
   */
  async resetMovementPoints(gameId, playerId) {
    try {
      await pool.query(`
        UPDATE armies 
        SET current_movement = movement, updated_at = CURRENT_TIMESTAMP
        WHERE game_id = $1 AND owner_id = $2 AND health > 0
      `, [gameId, playerId]);

      return {
        success: true,
        message: 'Movement points reset for all units'
      };
    } catch (error) {
      console.error('Error resetting movement points:', error);
      throw new Error('Failed to reset movement points');
    }
  }

  /**
   * Get unit types information
   */
  getUnitTypes() {
    return this.unitTypes;
  }

  /**
   * Get army types information
   */
  getArmyTypes() {
    return this.armyTypes;
  }

  /**
   * Check if player can create unit
   */
  async canCreateUnit(gameId, playerId, unitType) {
    try {
      const unitConfig = this.unitTypes[unitType];
      if (!unitConfig) {
        return { canCreate: false, reason: 'Invalid unit type' };
      }

      const hasEnoughResources = await resourceService.hasEnoughResources(gameId, playerId, unitConfig.cost);
      if (!hasEnoughResources) {
        return { canCreate: false, reason: 'Not enough resources' };
      }

      return { canCreate: true, costs: unitConfig.cost };
    } catch (error) {
      console.error('Error checking if can create unit:', error);
      return { canCreate: false, reason: 'Error checking requirements' };
    }
  }
}

export default new MilitaryService(); 