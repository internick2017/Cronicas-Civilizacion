import express from 'express';
import { PlayerService } from '../services/PlayerService.js';

const router = express.Router();
const playerService = new PlayerService();

// Create new player
router.post('/', async (req, res) => {
  try {
    const { name, avatar } = req.body;
    const player = await playerService.createPlayer({ name, avatar });
    res.status(201).json(player);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get player by ID
router.get('/:playerId', async (req, res) => {
  try {
    const player = await playerService.getPlayerById(req.params.playerId);
    if (!player) {
      return res.status(404).json({ error: 'Player not found' });
    }
    res.json(player);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update player
router.put('/:playerId', async (req, res) => {
  try {
    const { name, avatar } = req.body;
    const player = await playerService.updatePlayer(req.params.playerId, { name, avatar });
    res.json(player);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Get player stats
router.get('/:playerId/stats', async (req, res) => {
  try {
    const stats = await playerService.getPlayerStats(req.params.playerId);
    res.json(stats);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get player's active games
router.get('/:playerId/games', async (req, res) => {
  try {
    const games = await playerService.getPlayerGames(req.params.playerId);
    res.json(games);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router; 