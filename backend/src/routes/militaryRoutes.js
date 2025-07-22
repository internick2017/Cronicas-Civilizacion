import express from 'express';
import { MilitaryService } from '../services/MilitaryService.js';
import pool from '../config/database.js';

const router = express.Router();
const militaryService = new MilitaryService();

// Get all units for a player
router.get('/:gameId/:playerId/units', async (req, res) => {
  try {
    const { gameId, playerId } = req.params;
    const units = await militaryService.getPlayerUnits(gameId, playerId);
    
    res.json({
      success: true,
      data: units
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Get specific unit by ID
router.get('/unit/:unitId', async (req, res) => {
  try {
    const { unitId } = req.params;
    const unit = await militaryService.getUnitById(unitId);
    
    if (!unit) {
      return res.status(404).json({ 
        success: false,
        error: 'Unit not found' 
      });
    }
    
    res.json({
      success: true,
      data: unit
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Create a new unit
router.post('/:gameId/:playerId/create', async (req, res) => {
  try {
    const { gameId, playerId } = req.params;
    const { unitType, tileId } = req.body;
    
    if (!unitType || !tileId) {
      return res.status(400).json({ 
        success: false,
        error: 'Unit type and tile ID are required' 
      });
    }
    
    const result = await militaryService.createUnit(gameId, playerId, unitType, tileId);
    
    res.status(201).json({
      success: true,
      data: result,
      message: result.message
    });
  } catch (error) {
    res.status(400).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Move unit to new tile
router.post('/:unitId/move', async (req, res) => {
  try {
    const { unitId } = req.params;
    const { newTileId, gameId, playerId } = req.body;
    
    if (!newTileId || !gameId || !playerId) {
      return res.status(400).json({ 
        success: false,
        error: 'New tile ID, game ID, and player ID are required' 
      });
    }
    
    const result = await militaryService.moveUnit(unitId, newTileId, gameId, playerId);
    
    res.json({
      success: true,
      data: result,
      message: result.message
    });
  } catch (error) {
    res.status(400).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Attack another unit or city
router.post('/:attackerId/attack', async (req, res) => {
  try {
    const { attackerId } = req.params;
    const { targetId, gameId, playerId } = req.body;
    
    if (!targetId || !gameId || !playerId) {
      return res.status(400).json({ 
        success: false,
        error: 'Target ID, game ID, and player ID are required' 
      });
    }
    
    const result = await militaryService.attack(attackerId, targetId, gameId, playerId);
    
    res.json({
      success: true,
      data: result,
      message: result.message
    });
  } catch (error) {
    res.status(400).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Reset movement points (end of turn)
router.post('/:gameId/:playerId/reset-movement', async (req, res) => {
  try {
    const { gameId, playerId } = req.params;
    const result = await militaryService.resetMovementPoints(gameId, playerId);
    
    res.json({
      success: true,
      data: result,
      message: result.message
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Check if player can create unit
router.post('/:gameId/:playerId/can-create', async (req, res) => {
  try {
    const { gameId, playerId } = req.params;
    const { unitType } = req.body;
    
    if (!unitType) {
      return res.status(400).json({ 
        success: false,
        error: 'Unit type is required' 
      });
    }
    
    const result = await militaryService.canCreateUnit(gameId, playerId, unitType);
    
    res.json({
      success: true,
      data: result
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Get unit types information
router.get('/unit-types', async (req, res) => {
  try {
    const unitTypes = militaryService.getUnitTypes();
    
    res.json({
      success: true,
      data: unitTypes
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Get army types information
router.get('/army-types', async (req, res) => {
  try {
    const armyTypes = militaryService.getArmyTypes();
    
    res.json({
      success: true,
      data: armyTypes
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Get military summary for player
router.get('/:gameId/:playerId/summary', async (req, res) => {
  try {
    const { gameId, playerId } = req.params;
    const units = await militaryService.getPlayerUnits(gameId, playerId);
    
    // Calculate military strength
    const totalAttack = units.reduce((sum, unit) => sum + unit.attack, 0);
    const totalDefense = units.reduce((sum, unit) => sum + unit.defense, 0);
    const totalHealth = units.reduce((sum, unit) => sum + unit.health, 0);
    const totalExperience = units.reduce((sum, unit) => sum + unit.experience, 0);
    
    // Group units by type
    const unitsByType = units.reduce((acc, unit) => {
      acc[unit.unit_type] = (acc[unit.unit_type] || 0) + 1;
      return acc;
    }, {});
    
    const summary = {
      totalUnits: units.length,
      totalAttack: totalAttack,
      totalDefense: totalDefense,
      totalHealth: totalHealth,
      totalExperience: totalExperience,
      unitsByType: unitsByType,
      averageLevel: units.length > 0 ? Math.round(totalExperience / units.length / 10) : 0
    };
    
    res.json({
      success: true,
      data: summary
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Get units at specific location
router.get('/:gameId/location/:tileId', async (req, res) => {
  try {
    const { gameId, tileId } = req.params;
    
    const result = await pool.query(`
      SELECT a.*, p.name as owner_name, p.civilization_name
      FROM armies a
      JOIN players p ON a.owner_id = p.id
      WHERE a.game_id = $1 AND a.tile_id = $2 AND a.health > 0
    `, [gameId, tileId]);
    
    res.json({
      success: true,
      data: result.rows
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Upgrade unit (increase level and stats)
router.post('/:unitId/upgrade', async (req, res) => {
  try {
    const { unitId } = req.params;
    const { gameId, playerId } = req.body;
    
    if (!gameId || !playerId) {
      return res.status(400).json({ 
        success: false,
        error: 'Game ID and player ID are required' 
      });
    }
    
    const unit = await militaryService.getUnitById(unitId);
    if (!unit || unit.owner_id !== playerId) {
      return res.status(400).json({ 
        success: false,
        error: 'Unit not found or not owned by player' 
      });
    }
    
    // Check if unit has enough experience to upgrade
    const experienceRequired = unit.level * 100;
    if (unit.experience < experienceRequired) {
      return res.status(400).json({ 
        success: false,
        error: `Not enough experience. Need ${experienceRequired}, have ${unit.experience}` 
      });
    }
    
    // Upgrade unit
    const newLevel = unit.level + 1;
    const newAttack = unit.attack + 2;
    const newDefense = unit.defense + 2;
    const newHealth = unit.max_health + 20;
    
    await pool.query(`
      UPDATE armies 
      SET level = $1, attack = $2, defense = $3, max_health = $4, health = $4, 
          experience = experience - $5, updated_at = CURRENT_TIMESTAMP
      WHERE id = $6
    `, [newLevel, newAttack, newDefense, newHealth, experienceRequired, unitId]);
    
    res.json({
      success: true,
      data: {
        unitId: unitId,
        newLevel: newLevel,
        newAttack: newAttack,
        newDefense: newDefense,
        newHealth: newHealth
      },
      message: `Unit upgraded to level ${newLevel}`
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

export default router; 