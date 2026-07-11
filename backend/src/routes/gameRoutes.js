import express from 'express';
import { GameService } from '../services/GameService.js';
import { asyncHandler } from '../utils/errors.js';
import { validateRequest, schemas } from '../utils/validation.js';
import { gameCreationLimiter, gameActionLimiter } from '../middleware/rateLimiter.js';

const router = express.Router();
const gameService = GameService.getInstance();

// Get all active games
router.get('/', asyncHandler(async (req, res) => {
  const games = await gameService.getAllGames();
  res.json(games);
}));

// Get specific game by ID
router.get('/:gameId', asyncHandler(async (req, res) => {
  const game = await gameService.getGameById(req.params.gameId);
  res.json(game);
}));

// Create new game
router.post('/', gameCreationLimiter, validateRequest(schemas.gameCreation), asyncHandler(async (req, res) => {
  const game = await gameService.createGame(req.body);
  res.status(201).json(game);
}));

// Join game
router.post('/:gameId/join', asyncHandler(async (req, res) => {
  const { playerId, civilizationName } = req.body;
  const result = await gameService.joinGame(req.params.gameId, playerId, civilizationName);
  res.json(result);
}));

// Leave game
router.post('/:gameId/leave', asyncHandler(async (req, res) => {
  const { playerId } = req.body;
  const result = await gameService.leaveGame(req.params.gameId, playerId);
  res.json(result);
}));

// Delete game
router.delete('/:gameId', asyncHandler(async (req, res) => {
  const result = await gameService.deleteGame(req.params.gameId);
  res.json(result);
}));

// Start game
router.post('/:gameId/start', asyncHandler(async (req, res) => {
  const result = await gameService.startGame(req.params.gameId);
  res.json(result);
}));

// Make turn action
router.post('/:gameId/action', gameActionLimiter, asyncHandler(async (req, res) => {
  const { playerId, action } = req.body;
  const result = await gameService.processAction(req.params.gameId, playerId, action);
  res.json(result);
}));

// Get game state
router.get('/:gameId/state', asyncHandler(async (req, res) => {
  const state = await gameService.getGameState(req.params.gameId);
  res.json(state);
}));

// Generate world event manually (for testing)
router.post('/:gameId/world-event', asyncHandler(async (req, res) => {
  const worldEvent = await gameService.generateWorldEvent(req.params.gameId);
  res.json(worldEvent);
}));

// Get AI service status (must be after specific routes to avoid conflicts)
router.get('/ai/status', asyncHandler(async (req, res) => {
  const status = gameService.getAIStatus();
  res.json(status);
}));

export default router; 