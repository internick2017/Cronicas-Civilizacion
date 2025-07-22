import { GameService } from '../services/GameService.js';
import { PlayerService } from '../services/PlayerService.js';

const gameService = new GameService();
const playerService = new PlayerService();

export function handleGameSocket(socket, io) {
  console.log(`Game socket connected: ${socket.id}`);

  // Join game room
  socket.on('join-game', async (data) => {
    try {
      const { gameId, playerId, civilizationName } = data;
      
      // Join socket room
      socket.join(gameId);
      
      // Join game logic
      const result = await gameService.joinGame(gameId, playerId, civilizationName);
      
      // Update player online status
      await playerService.setPlayerOnline(playerId, socket.id);
      
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
      
    } catch (error) {
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
      
      // Notify all players
      io.to(gameId).emit('game-started', {
        game: result.game
      });
      
    } catch (error) {
      socket.emit('start-game-response', {
        success: false,
        error: error.message
      });
    }
  });

  // Process turn action
  socket.on('player-action', async (data) => {
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
      
      const gameState = await gameService.getPlayerView(gameId, playerId);
      
      socket.emit('game-state', gameState);
      
    } catch (error) {
      socket.emit('game-state-error', {
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
  socket.on('disconnect', () => {
    console.log(`Game socket disconnected: ${socket.id}`);
    
    // Set player offline (would need to track socket -> player mapping)
    // This is a simplified version
    // In a real app, you'd maintain a mapping of socket.id -> playerId
  });

  // Ping/pong for connection health
  socket.on('ping', () => {
    socket.emit('pong');
  });
}

export default handleGameSocket; 