import express from 'express';
import { GameService } from '../services/GameService.js';

const router = express.Router();
const gameService = new GameService();

// Get all active games
router.get('/', async (req, res) => {
  try {
    const games = await gameService.getAllGames();
    res.json(games);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get specific game by ID
router.get('/:gameId', async (req, res) => {
  try {
    const game = await gameService.getGameById(req.params.gameId);
    if (!game) {
      return res.status(404).json({ error: 'Game not found' });
    }
    res.json(game);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create new game
router.post('/', async (req, res) => {
  try {
    const { name, maxPlayers, mapSize, gameMode } = req.body;
    const game = await gameService.createGame({
      name,
      maxPlayers: maxPlayers || 4,
      mapSize: mapSize || 20,
      gameMode: gameMode || 'domination'
    });
    res.status(201).json(game);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Join game
router.post('/:gameId/join', async (req, res) => {
  try {
    const { playerId, civilizationName } = req.body;
    const result = await gameService.joinGame(req.params.gameId, playerId, civilizationName);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Leave game
router.post('/:gameId/leave', async (req, res) => {
  try {
    const { playerId } = req.body;
    const result = await gameService.leaveGame(req.params.gameId, playerId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Start game
router.post('/:gameId/start', async (req, res) => {
  try {
    const result = await gameService.startGame(req.params.gameId);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Make turn action
router.post('/:gameId/action', async (req, res) => {
  try {
    const { playerId, action } = req.body;
    const result = await gameService.processAction(req.params.gameId, playerId, action);
    res.json(result);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get game state
router.get('/:gameId/state', async (req, res) => {
  try {
    const state = await gameService.getGameState(req.params.gameId);
    res.json(state);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get AI service status
router.get('/ai/status', async (req, res) => {
  try {
    const status = gameService.getAIStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Generate world event manually (for testing)
router.post('/:gameId/world-event', async (req, res) => {
  try {
    const worldEvent = await gameService.generateWorldEvent(req.params.gameId);
    res.json(worldEvent);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router; 