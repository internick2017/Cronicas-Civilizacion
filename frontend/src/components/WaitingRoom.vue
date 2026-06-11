<template>
  <div class="waiting-room bg-game-pattern">
    <div class="header-game">
      <h1 class="text-glow">
        <span class="icon-game">🏛️</span>
        {{ game?.name }}
        <span class="icon-game">🏛️</span>
      </h1>
      <h2 class="text-shadow-game">Sala de Espera</h2>
      <p class="text-shadow-game">Esperando a que se unan más jugadores...</p>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <!-- Game Info -->
      <div class="panel-game">
        <div class="flex items-center gap-3 mb-6">
          <span class="icon-game">📊</span>
          <h3 class="text-2xl font-bold text-white">Información del Juego</h3>
        </div>
        <div class="info-grid">
          <div class="info-item">
            <span class="label">Modo de Juego:</span>
            <span class="value">{{ getGameModeText(game?.gameMode) }}</span>
          </div>
          <div class="info-item">
            <span class="label">Tamaño del Mapa:</span>
            <span class="value">{{ getMapSizeText(game?.mapSize) }}</span>
          </div>
          <div class="info-item">
            <span class="label">Jugadores:</span>
            <span class="value">{{ game?.players?.length || 0 }}/{{ game?.maxPlayers }}</span>
          </div>
          <div class="info-item">
            <span class="label">Estado:</span>
            <span class="value status" :class="game?.status">{{ getStatusText(game?.status) }}</span>
          </div>
        </div>
      </div>

      <!-- Players List -->
      <div class="panel-game">
        <div class="flex items-center gap-3 mb-6">
          <span class="icon-game">👥</span>
          <h3 class="text-2xl font-bold text-white">Jugadores ({{ game?.players?.length || 0 }}/{{ game?.maxPlayers }})</h3>
        </div>
        <div class="players-list">
          <div 
            v-for="player in game?.players" 
            :key="player.id"
            class="card-game p-4"
            :class="{ 'border-green-500': player.id === playerId }"
          >
            <div class="player-avatar">
              <img 
                v-if="player.avatar" 
                :src="player.avatar" 
                :alt="player.civilizationName"
              >
              <div v-else class="default-avatar">
                {{ getInitials(player.civilizationName) }}
              </div>
            </div>
            
            <div class="player-info">
              <h4>{{ player.civilizationName || 'Sin nombre' }}</h4>
              <p class="player-name">{{ player.name || 'Sin nombre' }}</p>
              <div class="player-status">
                <span class="status-indicator" :class="{ online: player.isOnline }"></span>
                {{ player.isOnline ? 'En línea' : 'Desconectado' }}
              </div>
            </div>
            
            <div class="player-actions" v-if="player.id === playerId">
              <span class="you-indicator">¡Eres tú!</span>
            </div>
          </div>
          
          <!-- Empty slots -->
          <div 
            v-for="n in emptySlots" 
            :key="`empty-${n}`"
            class="card-game p-4 opacity-50"
          >
            <div class="player-avatar">
              <div class="default-avatar empty">?</div>
            </div>
            <div class="player-info">
              <h4>Esperando jugador...</h4>
              <p class="player-name">Slot vacío</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Game Rules -->
      <div class="panel-game">
        <div class="flex items-center gap-3 mb-6">
          <span class="icon-game">📜</span>
          <h3 class="text-2xl font-bold text-white">Reglas del Juego</h3>
        </div>
        <div class="rules-content">
          <div class="rule-section">
            <h4>🎯 Objetivo</h4>
            <p>{{ getObjectiveText(game?.gameMode) }}</p>
          </div>
          
          <div class="rule-section">
            <h4>🔄 Turnos</h4>
            <p>Cada jugador puede realizar una acción por turno:</p>
            <ul>
              <li>Fundar/conquistar ciudad</li>
              <li>Recolectar recursos</li>
              <li>Crear/mover ejército</li>
              <li>Mejorar infraestructura</li>
              <li>Diplomacia</li>
              <li>Acción libre</li>
            </ul>
          </div>
          
          <div class="rule-section">
            <h4>🏛️ Recursos</h4>
            <p>Gestiona 7 tipos de recursos: Comida, Oro, Madera, Piedra, Ciencia, Cultura y Ejército</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Action Buttons -->
    <div class="flex gap-4 mt-8">
      <button 
        @click="leaveGame"
        class="btn-game btn-game-outline"
      >
        <span class="flex items-center gap-2">
          <span class="icon-game">🚪</span>
          Salir del Juego
        </span>
      </button>
      
      <button 
        v-if="game?.status === 'playing'"
        @click="resetGame"
        class="btn-game btn-game-danger"
      >
        <span class="flex items-center gap-2">
          <span class="icon-game">🔄</span>
          Reiniciar Juego (Dev)
        </span>
      </button>
      
      <button 
        @click="startGame"
        class="btn-game btn-game-primary"
        :disabled="!canStartGame || startingGame"
      >
        <span v-if="startingGame" class="flex items-center gap-2">
          <span class="loading-game">⏳</span>
          Iniciando juego...
        </span>
        <span v-else class="flex items-center gap-2">
          <span class="icon-game">🎮</span>
          {{ canStartGame ? 'Iniciar Juego' : `Esperando jugadores (${game?.players?.length || 0}/${game?.maxPlayers})` }}
        </span>
      </button>
    </div>

    <!-- Chat Preview -->
    <div class="chat-preview">
      <h4>💬 Chat del Juego</h4>
      <div class="chat-messages">
        <div class="system-message">
          ¡Bienvenido al juego! El chat estará disponible durante la partida.
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, watch, onMounted, ref } from 'vue'
import { useGameSocket } from '../composables/useGameSocket'

const emit = defineEmits(['start-game', 'leave-game', 'reset-game'])
const props = defineProps({
  game: {
    type: Object,
    required: true
  },
  playerId: {
    type: String,
    required: true
  }
})

const startingGame = ref(false)

const { socket } = useGameSocket()

// Update player online status when component mounts
onMounted(() => {
  if (socket.value && props.game?.id && props.playerId) {
    console.log('🔄 WaitingRoom mounted - updating player online status')
    socket.value.emit('get-game-state', { 
      gameId: props.game.id,
      playerId: props.playerId 
    })
  }
  
  // Listen for game start events to reset loading state
  if (socket.value) {
    socket.value.on('game-started', () => {
      startingGame.value = false
    })
    
    socket.value.on('start-game-response', (data) => {
      if (!data.success) {
        startingGame.value = false
      } else {
        // Keep loading state until game-started event
      }
    })
  }
})



// Computed properties
const canStartGame = computed(() => {
  return props.game?.players?.length >= 2 && props.game?.status === 'waiting'
})

const emptySlots = computed(() => {
  const currentPlayers = props.game?.players?.length || 0
  const maxPlayers = props.game?.maxPlayers || 4
  return maxPlayers - currentPlayers
})

// Methods
const startGame = () => {
  if (canStartGame.value && !startingGame.value) {
    startingGame.value = true
    emit('start-game')
    
    // Reset loading state after a timeout as fallback
    setTimeout(() => {
      startingGame.value = false
    }, 10000) // 10 seconds timeout
  }
}

const leaveGame = () => {
  emit('leave-game')
}

const resetGame = () => {
  emit('reset-game')
}

const getInitials = (name) => {
  return name
    ?.split(' ')
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2) || '??'
}

const getGameModeText = (mode) => {
  const modes = {
    domination: 'Dominación',
    science: 'Victoria Científica',
    culture: 'Victoria Cultural',
    economic: 'Victoria Económica'
  }
  return modes[mode] || mode
}

const getMapSizeText = (size) => {
  if (!size || size === 'undefined' || size === undefined) {
    return 'Mediano (20x20)'
  }
  
  const sizes = {
    15: 'Pequeño (15x15)',
    20: 'Mediano (20x20)', 
    25: 'Grande (25x25)',
    30: 'Épico (30x30)'
  }
  return sizes[size] || `${size}x${size}`
}

const getStatusText = (status) => {
  const statuses = {
    waiting: 'Esperando',
    playing: 'Jugando',
    finished: 'Terminado'
  }
  return statuses[status] || status
}

const getObjectiveText = (mode) => {
  const objectives = {
    classic: 'Conquista el 60% del mapa, alcanza 1000 puntos de Ciencia o elimina a todos los oponentes',
    fast: 'Partida rápida: Alcanza 500 puntos de cualquier tipo o conquista el 40% del mapa',
    custom: 'Reglas personalizadas definidas por el creador del juego'
  }
  return objectives[mode] || 'Objetivo no definido'
}
</script>

<style scoped>
.waiting-room {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.room-header {
  text-align: center;
  margin-bottom: 30px;
}

.room-header h2 {
  color: #2c3e50;
  margin-bottom: 10px;
  font-size: 2.2rem;
}

.room-header p {
  color: #7f8c8d;
  font-size: 1.1rem;
}

.room-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 30px;
  margin-bottom: 30px;
}

.game-info-panel,
.players-panel,
.rules-panel {
  background: white;
  border-radius: 12px;
  padding: 25px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.game-info-panel h3,
.players-panel h3,
.rules-panel h3 {
  color: #2c3e50;
  margin-bottom: 20px;
  font-size: 1.4rem;
  border-bottom: 2px solid #3498db;
  padding-bottom: 8px;
}

.info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 15px;
}

.info-item {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

.info-item .label {
  color: #7f8c8d;
  font-size: 0.9rem;
  font-weight: 600;
}

.info-item .value {
  color: #2c3e50;
  font-size: 1.1rem;
  font-weight: 600;
}

.status.waiting {
  color: #f39c12;
}

.status.playing {
  color: #2ecc71;
}

.status.finished {
  color: #e74c3c;
}

.players-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.player-card {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 15px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  transition: all 0.3s;
}

.player-card.current-player {
  border-color: #3498db;
  background: #f8f9fa;
}

.player-card.empty-slot {
  opacity: 0.6;
  border-style: dashed;
}

.player-avatar {
  width: 50px;
  height: 50px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
}

.player-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.default-avatar {
  width: 100%;
  height: 100%;
  background: #3498db;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 1.2rem;
}

.default-avatar.empty {
  background: #bdc3c7;
}

.player-info {
  flex: 1;
}

.player-info h4 {
  color: #2c3e50;
  margin-bottom: 5px;
  font-size: 1.1rem;
}

.player-name {
  color: #7f8c8d;
  font-size: 0.9rem;
  margin-bottom: 5px;
}

.player-status {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.8rem;
  color: #95a5a6;
}

.status-indicator {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #e74c3c;
}

.status-indicator.online {
  background: #2ecc71;
}

.you-indicator {
  background: #3498db;
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 0.8rem;
  font-weight: 600;
}

.rules-panel {
  grid-column: 1 / -1;
}

.rules-content {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 20px;
}

.rule-section h4 {
  color: #2c3e50;
  margin-bottom: 10px;
  font-size: 1.1rem;
}

.rule-section p {
  color: #7f8c8d;
  line-height: 1.5;
  margin-bottom: 10px;
}

.rule-section ul {
  color: #7f8c8d;
  padding-left: 20px;
}

.rule-section li {
  margin-bottom: 5px;
}

.room-actions {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.btn {
  padding: 12px 24px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-primary {
  background: #2ecc71;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #27ae60;
  transform: translateY(-2px);
}

.btn-secondary {
  background: #e74c3c;
  color: white;
}

.btn-secondary:hover {
  background: #c0392b;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.chat-preview {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.chat-preview h4 {
  color: #2c3e50;
  margin-bottom: 15px;
  font-size: 1.2rem;
}

.chat-messages {
  max-height: 100px;
  overflow-y: auto;
}

.system-message {
  color: #7f8c8d;
  font-style: italic;
  padding: 10px;
  background: #f8f9fa;
  border-radius: 6px;
}

@media (max-width: 768px) {
  .room-content {
    grid-template-columns: 1fr;
  }
  
  .info-grid {
    grid-template-columns: 1fr;
  }
  
  .rules-content {
    grid-template-columns: 1fr;
  }
  
  .room-actions {
    flex-direction: column;
    gap: 15px;
  }
  
  .btn {
    width: 100%;
  }
}
</style> 