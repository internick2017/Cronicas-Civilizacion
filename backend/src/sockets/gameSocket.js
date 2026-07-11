import { GameService } from '../services/GameService.js';
import { PlayerService } from '../services/PlayerService.js';
import logger from '../utils/logger.js';

const gameService = GameService.getInstance();
const playerService = PlayerService.getInstance();

// Map to track socket.id -> playerId
const socketPlayerMap = new Map();

export function handleGameSocket(socket, io) {
  logger.debug(`Game socket connected: ${socket.id}`);

  // Create new game
  socket.on('create-game', async (data) => {
    try {
      const { name, maxPlayers, mapSize, gameMode, civilizationName, playerId } = data;
      logger.info(`Create game request: ${name}, maxPlayers: ${maxPlayers}, playerId: ${playerId}`);
      
      // Create the game
      const game = await gameService.createGame({
        name,
        maxPlayers: parseInt(maxPlayers),
        mapSize: parseInt(mapSize),
        gameMode
      });
      
      // If playerId is provided, automatically join the player to the game
      if (playerId && civilizationName) {
        try {
          // Wait a moment to ensure the game is fully saved
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Join the player to the game
          const joinResult = await gameService.joinGame(game.id, playerId, civilizationName);
          
          // Join socket room after successful game join
          socket.join(game.id);
          
          // Update player online status
          await playerService.setPlayerOnline(playerId, socket.id);
          
          // Store socket -> player mapping
          socketPlayerMap.set(socket.id, playerId);
          
          // Send success response with join info
          socket.emit('create-game-response', {
            success: true,
            game: joinResult.game,
            playerJoined: true,
            playerId: playerId
          });
          
          // Notify all players in the game
          io.to(game.id).emit('player-joined', {
            playerId,
            civilizationName,
            game: joinResult.game
          });
          
        } catch (joinError) {
          logger.error(`Error auto-joining player to game:`, joinError);
          // Still send success response for game creation, but without auto-join
          socket.emit('create-game-response', {
            success: true,
            game: game,
            playerJoined: false,
            error: joinError.message
          });
        }
      } else {
        // Send success response without auto-join
        socket.emit('create-game-response', {
          success: true,
          game: game,
          playerJoined: false
        });
      }
      
      // Broadcast updated games list to all connected clients
      const allGames = await gameService.getAllGames();
      io.emit('games-list', { games: allGames });
      
    } catch (error) {
      logger.error(`Error creating game:`, error);
      socket.emit('create-game-response', {
        success: false,
        error: error.message
      });
    }
  });

  // Join game room
  socket.on('join-game', async (data) => {
    try {
      const { gameId, playerId, civilizationName } = data;
      logger.info(`Join game request: ${gameId}, player: ${playerId}, civ: ${civilizationName}`);
      
      // Join game logic first
      console.log(`[SOCKET] Calling gameService.joinGame...`);
      const result = await gameService.joinGame(gameId, playerId, civilizationName);
      console.log(`[SOCKET] joinGame result:`, result);
      
      // Join socket room after successful game join
      socket.join(gameId);
      
      // Update player online status
      await playerService.setPlayerOnline(playerId, socket.id);
      
      // Store socket -> player mapping
      socketPlayerMap.set(socket.id, playerId);
      
      // Notify all players in the game
      io.to(gameId).emit('player-joined', {
        playerId,
        civilizationName,
        game: result.game
      });
      
      // Send success response to the joining player
      socket.emit('join-game-response', {
        success: true,
        playerId: result.playerId,
        game: result.game
      });
      
      // Broadcast updated games list to all connected clients
      const allGames = await gameService.getAllGames();
      io.emit('games-list', { games: allGames });
      
    } catch (error) {
      logger.error(`Error joining game:`, error);
      socket.emit('join-game-response', {
        success: false,
        error: error.message
      });
    }
  });

  // Leave game room
  socket.on('leave-game', async (data) => {
    try {
      const { gameId, playerId } = data;
      
      // Leave socket room
      socket.leave(gameId);
      
      // Leave game logic
      const result = await gameService.leaveGame(gameId, playerId);
      
      // Notify other players
      io.to(gameId).emit('player-left', {
        playerId,
        game: result.game
      });
      
      socket.emit('leave-game-response', {
        success: true
      });
      
    } catch (error) {
      socket.emit('leave-game-response', {
        success: false,
        error: error.message
      });
    }
  });

  // Start game
  socket.on('start-game', async (data) => {
    try {
      const { gameId } = data;
      
      const result = await gameService.startGame(gameId);
      
      // Send success response to the player who started the game
      socket.emit('start-game-response', {
        success: true,
        game: result.game
      });
      
      // Notify all players in the game room
      console.log(`[SOCKET] Broadcasting game-started to room ${gameId}`);
      console.log(`[SOCKET] Game state:`, {
        currentTurn: result.game.currentTurn,
        currentPlayerIndex: result.game.currentPlayerIndex,
        currentPlayer: result.game.currentPlayer,
        players: result.game.players.map(p => ({ id: p.id, name: p.civilizationName }))
      });
      
      io.to(gameId).emit('game-started', {
        game: result.game
      });
      
      // Update games list for lobby
      const allGames = await gameService.getAllGames();
      io.emit('games-list', { games: allGames });
      
    } catch (error) {
      console.error(`[SOCKET] Error starting game:`, error);
      socket.emit('start-game-response', {
        success: false,
        error: error.message
      });
    }
  });

  // Delete game
  socket.on('delete-game', async (data) => {
    try {
      const { gameId } = data;
      console.log(`[SOCKET] Delete game request: ${gameId}`);
      
      const result = await gameService.deleteGame(gameId);
      
      // Send success response
      socket.emit('delete-game-response', {
        success: true,
        message: result.message
      });
      
      // Broadcast updated games list to all connected clients
      const allGames = await gameService.getAllGames();
      io.emit('games-list', { games: allGames });
      
    } catch (error) {
      console.error(`[SOCKET] Error deleting game:`, error);
      socket.emit('delete-game-response', {
        success: false,
        error: error.message
      });
    }
  });

  // Reset game to waiting state (for development)
  socket.on('reset-game', async (data) => {
    try {
      const { gameId } = data;
      console.log(`[SOCKET] Reset game request: ${gameId}`);
      
      const result = await gameService.resetGameToWaiting(gameId);
      
      // Send success response
      socket.emit('reset-game-response', {
        success: true,
        game: result.game
      });
      
      // Notify all players in the game
      io.to(gameId).emit('game-reset', {
        game: result.game
      });
      
      // Broadcast updated games list to all connected clients
      const allGames = await gameService.getAllGames();
      io.emit('games-list', { games: allGames });
      
    } catch (error) {
      console.error(`[SOCKET] Error resetting game:`, error);
      socket.emit('reset-game-response', {
        success: false,
        error: error.message
      });
    }
  });

  // Clear all games
  socket.on('clear-all-games', async (data) => {
    try {
      console.log(`[SOCKET] Clear all games request`);
      
      const result = await gameService.clearAllGames();
      
      // Send success response
      socket.emit('clear-all-games-response', {
        success: true,
        message: result.message,
        results: result.results
      });
      
      // Broadcast empty games list to all connected clients
      io.emit('games-list', { games: [] });
      
    } catch (error) {
      console.error(`[SOCKET] Error clearing all games:`, error);
      socket.emit('clear-all-games-response', {
        success: false,
        error: error.message
      });
    }
  });

  // Process turn action
  socket.on('perform-action', async (data) => {
    try {
      const { gameId, playerId, action } = data;
      
      const result = await gameService.processAction(gameId, playerId, action);
      
      // Notify all players about the action and updated game state
      io.to(gameId).emit('action-processed', {
        playerId,
        action: result.action,
        game: result.game,
        narrative: result.narrative
      });
      
      // Notify about turn change if applicable
      const currentPlayer = result.game.currentPlayer;
      if (currentPlayer) {
        io.to(gameId).emit('turn-changed', {
          game: result.game,
          currentPlayer: currentPlayer
        });
      }
      
      // Send AI narrative to all players
      if (result.narrative) {
        io.to(gameId).emit('ai-narrative', {
          narrative: result.narrative.narrative,
          type: 'action_result',
          playerId,
          action: action.type,
          timestamp: result.narrative.timestamp,
          gameId
        });
      }
      
      // Generate world events occasionally (every 5 turns)
      if (result.game.currentTurn % 5 === 0) {
        try {
          const worldEvent = await gameService.generateWorldEvent(gameId);
          io.to(gameId).emit('world-event', {
            event: worldEvent.event,
            type: 'world_event',
            turn: result.game.currentTurn,
            timestamp: worldEvent.timestamp
          });
        } catch (worldEventError) {
          console.error('Error generating world event:', worldEventError);
        }
      }
      
    } catch (error) {
      socket.emit('action-response', {
        success: false,
        error: error.message
      });
    }
  });

  // Get current game state
  socket.on('get-game-state', async (data) => {
    try {
      const { gameId, playerId } = data;
      console.log(`[SOCKET] Getting game state for: ${gameId}, player: ${playerId}`);
      
      // If playerId is provided, set player as online
      if (playerId) {
        try {
          // First try to update the provided playerId
          await playerService.setPlayerOnline(playerId, socket.id);
          socketPlayerMap.set(socket.id, playerId);
          console.log(`[SOCKET] Set player ${playerId} online during game state request`);
        } catch (error) {
          console.error(`[SOCKET] Error setting player online:`, error);
          // If player doesn't exist, try to find a player in this game that could be this socket
          // This is a fallback for cases where frontend has wrong playerId
          console.log(`[SOCKET] Attempting fallback - trying to match player by game membership`);
        }
      }
      
      const game = await gameService.getGameById(gameId);
      console.log(`[SOCKET] Game state result:`, {
        id: game?.id,
        name: game?.name,
        playersCount: game?.players?.length || 0,
        players: game?.players?.map(p => ({ id: p.id, name: p.civilizationName, isOnline: p.isOnline }))
      });
      
      if (game) {
        // Join the game room if not already joined
        socket.join(gameId);
        
        socket.emit('game-state-update', {
          success: true,
          game: game
        });
      } else {
        socket.emit('game-state-update', {
          success: false,
          error: 'Game not found'
        });
      }
      
    } catch (error) {
      console.error(`[SOCKET] Error getting game state:`, error);
      socket.emit('game-state-update', {
        success: false,
        error: error.message
      });
    }
  });

  // Chat messages
  socket.on('chat-message', (data) => {
    const { gameId, playerId, message } = data;
    
    // Broadcast to all players in the game
    io.to(gameId).emit('chat-message', {
      playerId,
      message,
      timestamp: new Date()
    });
  });

  // Handle disconnect
  socket.on('disconnect', async () => {
    console.log(`Game socket disconnected: ${socket.id}`);
    
    // Get playerId from socket mapping
    const playerId = socketPlayerMap.get(socket.id);
    if (playerId) {
      try {
        // Set player offline
        await playerService.setPlayerOffline(playerId);
        console.log(`[SOCKET] Set player ${playerId} offline`);
        
        // Remove from mapping
        socketPlayerMap.delete(socket.id);
        
        // Notify all connected clients about the player status change
        // This will be handled when they request game state updates
      } catch (error) {
        console.error(`[SOCKET] Error setting player ${playerId} offline:`, error);
      }
    }
  });

  // Ping/pong for connection health
  socket.on('ping', () => {
    socket.emit('pong');
  });
}

export default handleGameSocket; 