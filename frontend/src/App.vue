<script setup>
import { ref, computed, onMounted } from 'vue'
import GameLobby from './components/GameLobby.vue'
import WaitingRoom from './components/WaitingRoom.vue'
import PlayerInfo from './components/PlayerInfo.vue'
import ResourcePanel from './components/ResourcePanel.vue'
import ActionPanel from './components/ActionPanel.vue'
import GameMap from './components/GameMap.vue'
import NarrativePanel from './components/NarrativePanel.vue'
import ChatPanel from './components/ChatPanel.vue'
import { useGameSocket } from './composables/useGameSocket'
import { useGameApi } from './composables/useGameApi'

export default {
  name: 'App',
  components: {
    GameLobby,
    WaitingRoom,
    PlayerInfo,
    ResourcePanel,
    ActionPanel,
    GameMap,
    NarrativePanel,
    ChatPanel
  },
  setup() {
    const gameState = ref('lobby') // lobby, waiting, playing
    const availableGames = ref([])
    const currentGame = ref(null)
    const playerId = ref(null)
    const gameHistory = ref([])
    const aiMessages = ref([])
    const chatMessages = ref([])

    const { socket, connectSocket, disconnectSocket } = useGameSocket()
    const { createGameApi, getGamesApi } = useGameApi()

    const currentPlayer = computed(() => {
      if (!currentGame.value || !playerId.value) return null
      return currentGame.value.players.find(p => p.id === playerId.value)
    })

    const isCurrentTurn = computed(() => {
      if (!currentGame.value || !playerId.value) return false
      return currentGame.value.currentPlayer?.id === playerId.value
    })

    const availableActions = computed(() => {
      if (!isCurrentTurn.value) return []
      return [
        { type: 'found_city', name: 'Fundar Ciudad', icon: '🏛️' },
        { type: 'collect_resource', name: 'Recolectar Recurso', icon: '⛏️' },
        { type: 'move_army', name: 'Mover Ejército', icon: '⚔️' },
        { type: 'build_infrastructure', name: 'Construir', icon: '🏗️' },
        { type: 'diplomacy', name: 'Diplomacia', icon: '🤝' },
        { type: 'free_action', name: 'Acción Libre', icon: '✨' }
      ]
    })

    // Socket event handlers
    const setupSocketListeners = () => {
      // Game lobby events
      socket.on('games-list', (data) => {
        availableGames.value = data.games
      })

      socket.on('game-created', (data) => {
        currentGame.value = data.game
        gameState.value = 'waiting'
        aiMessages.value.push({
          message: `Juego "${data.game.name}" creado exitosamente`,
          timestamp: new Date()
        })
      })

      socket.on('player-joined', (data) => {
        currentGame.value = data.game
        aiMessages.value.push({
          message: `${data.civilizationName} se ha unido al juego`,
          timestamp: new Date()
        })
      })

      socket.on('player-left', (data) => {
        currentGame.value = data.game
        aiMessages.value.push({
          message: `${data.civilizationName} ha abandonado el juego`,
          timestamp: new Date()
        })
      })

      socket.on('game-started', (data) => {
        currentGame.value = data.game
        gameState.value = 'playing'
        aiMessages.value.push({
          message: '¡El juego ha comenzado! Que comience la historia...',
          timestamp: new Date()
        })
      })

      // Game play events
      socket.on('action-processed', (data) => {
        currentGame.value = data.game
        gameHistory.value.push({
          playerId: data.playerId,
          action: data.action,
          result: data.result,
          narrative: data.narrative,
          timestamp: new Date()
        })
        
        // Add action result to AI messages
        if (data.result && data.result.message) {
          aiMessages.value.push({
            message: data.result.message,
            timestamp: new Date(),
            type: 'action_result'
          })
        }
      })

      socket.on('turn-changed', (data) => {
        currentGame.value = data.game
        const currentPlayer = data.game.currentPlayer
        if (currentPlayer) {
          aiMessages.value.push({
            message: `Es el turno de ${currentPlayer.civilizationName}`,
            timestamp: new Date(),
            type: 'turn_change'
          })
        }
      })

      socket.on('game-ended', (data) => {
        currentGame.value = data.game
        gameState.value = 'finished'
        const winner = data.game.winner
        aiMessages.value.push({
          message: `¡${winner.player.civilizationName} ha ganado por ${winner.victoryType}!`,
          timestamp: new Date(),
          type: 'game_end'
        })
      })

      socket.on('ai-narrative', (data) => {
        aiMessages.value.push({
          message: data.narrative,
          timestamp: data.timestamp,
          type: data.type,
          playerId: data.playerId,
          action: data.action,
          gameId: data.gameId
        })
      })

      socket.on('world-event', (data) => {
        aiMessages.value.push({
          message: data.event,
          timestamp: data.timestamp,
          type: 'world_event',
          turn: data.turn,
          isWorldEvent: true
        })
      })

      // Chat events
      socket.on('chat-message', (data) => {
        chatMessages.value.push({
          ...data,
          timestamp: new Date(data.timestamp)
        })
      })

      // Error handling
      socket.on('error', (data) => {
        console.error('Socket error:', data)
        aiMessages.value.push({
          message: `Error: ${data.message}`,
          timestamp: new Date(),
          type: 'error'
        })
      })

      socket.on('join-game-response', (data) => {
        if (!data.success) {
          console.error('Failed to join game:', data.error)
          aiMessages.value.push({
            message: `Error al unirse al juego: ${data.error}`,
            timestamp: new Date(),
            type: 'error'
          })
        }
      })

      socket.on('start-game-response', (data) => {
        if (!data.success) {
          console.error('Failed to start game:', data.error)
          aiMessages.value.push({
            message: `Error al iniciar el juego: ${data.error}`,
            timestamp: new Date(),
            type: 'error'
          })
        }
      })

      socket.on('action-response', (data) => {
        if (!data.success) {
          console.error('Action failed:', data.error)
          aiMessages.value.push({
            message: `Acción fallida: ${data.error}`,
            timestamp: new Date(),
            type: 'error'
          })
        }
      })
    }

    // Game actions
    const createGame = async (gameData) => {
      try {
        const game = await createGameApi(gameData)
        currentGame.value = game
        gameState.value = 'waiting'
        connectSocket()
        setupSocketListeners()
      } catch (error) {
        console.error('Error creating game:', error)
      }
    }

    const joinGame = (gameId, civilizationName) => {
      playerId.value = `player_${Date.now()}`
      gameState.value = 'waiting'
      connectSocket()
      setupSocketListeners()
      
      socket.emit('join-game', {
        gameId,
        playerId: playerId.value,
        civilizationName
      })
    }

    const startGame = () => {
      if (currentGame.value) {
        socket.emit('start-game', {
          gameId: currentGame.value.id
        })
      }
    }

    const leaveGame = () => {
      if (currentGame.value && playerId.value) {
        socket.emit('leave-game', {
          gameId: currentGame.value.id,
          playerId: playerId.value
        })
      }
      gameState.value = 'lobby'
      currentGame.value = null
      playerId.value = null
      disconnectSocket()
    }

    const performAction = (action) => {
      if (currentGame.value && playerId.value) {
        socket.emit('player-action', {
          gameId: currentGame.value.id,
          playerId: playerId.value,
          action
        })
      }
    }

    const onTileClick = (tile) => {
      console.log('Tile clicked:', tile)
      // Handle tile selection for actions
    }

    const sendChatMessage = (message) => {
      if (currentGame.value && playerId.value) {
        socket.emit('chat-message', {
          gameId: currentGame.value.id,
          playerId: playerId.value,
          message
        })
      }
    }

    // Load available games on mount
    onMounted(async () => {
      try {
        availableGames.value = await getGamesApi()
      } catch (error) {
        console.error('Error loading games:', error)
      }
    })

    return {
      gameState,
      availableGames,
      currentGame,
      playerId,
      currentPlayer,
      isCurrentTurn,
      availableActions,
      gameHistory,
      aiMessages,
      chatMessages,
      createGame,
      joinGame,
      startGame,
      leaveGame,
      performAction,
      onTileClick,
      sendChatMessage
    }
  }
}
</script>

<template>
  <div id="app">
    <header class="game-header">
      <h1>🏛️ Crónicas de Civilización</h1>
      <div class="header-info" v-if="currentGame">
        <span>Turno: {{ currentGame.currentTurn }}</span>
        <span>Jugador: {{ currentPlayer?.civilizationName }}</span>
      </div>
    </header>

    <main class="game-container">
      <!-- Game lobby -->
      <div v-if="gameState === 'lobby'" class="lobby">
        <GameLobby 
          @create-game="createGame"
          @join-game="joinGame"
          :games="availableGames"
        />
      </div>

      <!-- Game waiting room -->
      <div v-if="gameState === 'waiting'" class="waiting-room">
        <WaitingRoom 
          :game="currentGame"
          :player-id="playerId"
          @start-game="startGame"
          @leave-game="leaveGame"
        />
      </div>

      <!-- Active game -->
      <div v-if="gameState === 'playing'" class="game-board">
        <div class="game-sidebar">
          <PlayerInfo 
            :player="currentPlayer"
            :is-current-turn="isCurrentTurn"
          />
          <ResourcePanel 
            :resources="currentPlayer?.resources"
          />
          <ActionPanel 
            :available-actions="availableActions"
            :is-current-turn="isCurrentTurn"
            @action-selected="performAction"
          />
        </div>
        
        <div class="game-main">
          <GameMap 
            :map="currentGame?.map"
            :player-id="playerId"
            @tile-clicked="onTileClick"
          />
          <NarrativePanel 
            :history="gameHistory"
            :ai-messages="aiMessages"
          />
        </div>
      </div>
    </main>

    <!-- Chat -->
    <ChatPanel 
      v-if="gameState !== 'lobby'"
      :messages="chatMessages"
      @send-message="sendChatMessage"
    />
  </div>
</template>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  min-height: 100vh;
}

#app {
  display: flex;
  flex-direction: column;
  height: 100vh;
}

.game-header {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  padding: 1rem 2rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.game-header h1 {
  color: white;
  font-size: 1.5rem;
  font-weight: 600;
}

.header-info {
  display: flex;
  gap: 2rem;
  color: white;
  font-size: 0.9rem;
}

.game-container {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.lobby, .waiting-room {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 2rem;
}

.game-board {
  flex: 1;
  display: flex;
  gap: 1rem;
  padding: 1rem;
}

.game-sidebar {
  width: 300px;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.game-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* Card styles */
.card {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 12px;
  padding: 1.5rem;
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
}

.card h3 {
  margin-bottom: 1rem;
  color: #fff;
  font-size: 1.1rem;
}

/* Button styles */
.btn {
  background: rgba(255, 255, 255, 0.2);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.3s ease;
  font-size: 0.9rem;
}

.btn:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
}

.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-primary {
  background: linear-gradient(45deg, #4CAF50, #45a049);
  border: none;
}

.btn-primary:hover {
  background: linear-gradient(45deg, #45a049, #4CAF50);
}

/* Input styles */
.input {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.3);
  color: white;
  padding: 0.75rem;
  border-radius: 8px;
  font-size: 0.9rem;
}

.input::placeholder {
  color: rgba(255, 255, 255, 0.7);
}

.input:focus {
  outline: none;
  border-color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.15);
}
</style>
