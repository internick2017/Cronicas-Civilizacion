import express from 'express';
import { CityService } from '../services/CityService.js';

const router = express.Router();
const cityService = new CityService();

// Get all cities for a player in a game
router.get('/:gameId/:playerId', async (req, res) => {
  try {
    const { gameId, playerId } = req.params;
    const cities = await cityService.getPlayerCities(gameId, playerId);
    
    res.json({
      success: true,
      data: cities
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Get specific city by ID
router.get('/city/:cityId', async (req, res) => {
  try {
    const { cityId } = req.params;
    const city = await cityService.getCityById(cityId);
    
    if (!city) {
      return res.status(404).json({ 
        success: false,
        error: 'City not found' 
      });
    }
    
    res.json({
      success: true,
      data: city
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Found a new city
router.post('/:gameId/:playerId/found', async (req, res) => {
  try {
    const { gameId, playerId } = req.params;
    const { tileId, cityName, cityType = 'settlement' } = req.body;
    
    if (!tileId || !cityName) {
      return res.status(400).json({ 
        success: false,
        error: 'Tile ID and city name are required' 
      });
    }
    
    const result = await cityService.foundCity(gameId, playerId, tileId, cityName, cityType);
    
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

// Grow city population
router.post('/:cityId/grow', async (req, res) => {
  try {
    const { cityId } = req.params;
    const { gameId, playerId } = req.body;
    
    if (!gameId || !playerId) {
      return res.status(400).json({ 
        success: false,
        error: 'Game ID and player ID are required' 
      });
    }
    
    const result = await cityService.growCity(cityId, gameId, playerId);
    
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

// Build improvement in city
router.post('/:cityId/improvement', async (req, res) => {
  try {
    const { cityId } = req.params;
    const { gameId, playerId, improvementType } = req.body;
    
    if (!gameId || !playerId || !improvementType) {
      return res.status(400).json({ 
        success: false,
        error: 'Game ID, player ID, and improvement type are required' 
      });
    }
    
    const result = await cityService.buildImprovement(cityId, gameId, playerId, improvementType);
    
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

// Get city production summary
router.get('/:cityId/production', async (req, res) => {
  try {
    const { cityId } = req.params;
    const production = await cityService.getCityProduction(cityId);
    
    res.json({
      success: true,
      data: production
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Get all cities in a game
router.get('/game/:gameId', async (req, res) => {
  try {
    const { gameId } = req.params;
    const cities = await cityService.getAllCitiesInGame(gameId);
    
    res.json({
      success: true,
      data: cities
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Check if player can found city on tile
router.post('/:gameId/:playerId/can-found', async (req, res) => {
  try {
    const { gameId, playerId } = req.params;
    const { tileId } = req.body;
    
    if (!tileId) {
      return res.status(400).json({ 
        success: false,
        error: 'Tile ID is required' 
      });
    }
    
    const result = await cityService.canFoundCity(gameId, playerId, tileId);
    
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

// Update city stats
router.put('/:cityId', async (req, res) => {
  try {
    const { cityId } = req.params;
    const { updates } = req.body;
    
    if (!updates || typeof updates !== 'object') {
      return res.status(400).json({ 
        success: false,
        error: 'Updates object is required' 
      });
    }
    
    const updatedCity = await cityService.updateCityStats(cityId, updates);
    
    res.json({
      success: true,
      data: updatedCity,
      message: 'City updated successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Get city types information
router.get('/types', async (req, res) => {
  try {
    const cityTypes = cityService.cityTypes;
    
    res.json({
      success: true,
      data: cityTypes
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Get improvement types
router.get('/improvements', async (req, res) => {
  try {
    const improvements = {
      farm: { 
        name: 'Farm', 
        description: 'Increases food production and happiness',
        effects: { food: 5, happiness: 10 }
      },
      mine: { 
        name: 'Mine', 
        description: 'Extracts stone and gold from mountains',
        effects: { stone: 3, gold: 2 }
      },
      lumbermill: { 
        name: 'Lumbermill', 
        description: 'Processes wood from forests',
        effects: { wood: 4 }
      },
      library: { 
        name: 'Library', 
        description: 'Advances science and culture',
        effects: { science: 3, culture: 1 }
      },
      temple: { 
        name: 'Temple', 
        description: 'Increases culture and happiness',
        effects: { culture: 2, happiness: 15 }
      },
      barracks: { 
        name: 'Barracks', 
        description: 'Trains military units and increases defense',
        effects: { defense: 5, army: 1 }
      }
    };
    
    res.json({
      success: true,
      data: improvements
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

export default router; 