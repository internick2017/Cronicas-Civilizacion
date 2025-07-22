import express from 'express';
import { ResourceService } from '../services/ResourceService.js';

const router = express.Router();
const resourceService = new ResourceService();

// Get player resources
router.get('/:gameId/:playerId', async (req, res) => {
  try {
    const { gameId, playerId } = req.params;
    const resources = await resourceService.getPlayerResources(gameId, playerId);
    
    if (!resources) {
      return res.status(404).json({ error: 'Player resources not found' });
    }
    
    res.json({
      success: true,
      data: resources
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Get resource production calculation
router.get('/:gameId/:playerId/production', async (req, res) => {
  try {
    const { gameId, playerId } = req.params;
    const production = await resourceService.calculateResourceProduction(gameId, playerId);
    
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

// Process turn resources (end of turn)
router.post('/:gameId/:playerId/process-turn', async (req, res) => {
  try {
    const { gameId, playerId } = req.params;
    const result = await resourceService.processTurnResources(gameId, playerId);
    
    res.json({
      success: true,
      data: result,
      message: 'Turn resources processed successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Update player resources
router.put('/:gameId/:playerId', async (req, res) => {
  try {
    const { gameId, playerId } = req.params;
    const { resources } = req.body;
    
    if (!resources || typeof resources !== 'object') {
      return res.status(400).json({ 
        success: false,
        error: 'Resources object is required' 
      });
    }
    
    const updatedResources = await resourceService.updatePlayerResources(gameId, playerId, resources);
    
    res.json({
      success: true,
      data: updatedResources,
      message: 'Resources updated successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Add resources to player
router.post('/:gameId/:playerId/add', async (req, res) => {
  try {
    const { gameId, playerId } = req.params;
    const { resources } = req.body;
    
    if (!resources || typeof resources !== 'object') {
      return res.status(400).json({ 
        success: false,
        error: 'Resources object is required' 
      });
    }
    
    const updatedResources = await resourceService.addPlayerResources(gameId, playerId, resources);
    
    res.json({
      success: true,
      data: updatedResources,
      message: 'Resources added successfully'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Check if player has enough resources for an action
router.post('/:gameId/:playerId/check', async (req, res) => {
  try {
    const { gameId, playerId } = req.params;
    const { requiredResources } = req.body;
    
    if (!requiredResources || typeof requiredResources !== 'object') {
      return res.status(400).json({ 
        success: false,
        error: 'Required resources object is required' 
      });
    }
    
    const hasEnough = await resourceService.hasEnoughResources(gameId, playerId, requiredResources);
    
    res.json({
      success: true,
      data: { hasEnough },
      message: hasEnough ? 'Player has enough resources' : 'Player lacks required resources'
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Get action costs
router.get('/action-costs', async (req, res) => {
  try {
    const actionCosts = resourceService.getActionCosts();
    
    res.json({
      success: true,
      data: actionCosts
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

// Get resource types information
router.get('/types', async (req, res) => {
  try {
    const resourceTypes = resourceService.resourceTypes;
    
    res.json({
      success: true,
      data: resourceTypes
    });
  } catch (error) {
    res.status(500).json({ 
      success: false,
      error: error.message 
    });
  }
});

export default router; 