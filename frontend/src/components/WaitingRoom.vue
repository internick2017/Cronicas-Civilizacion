<template>
  <div class="waiting-room">
    <div class="room-header">
      <h2>🏛️ {{ game?.name }}</h2>
      <p>Esperando a que se unan más jugadores...</p>
    </div>

    <div class="room-content">
      <!-- Game Info -->
      <div class="game-info-panel">
        <h3>Información del Juego</h3>
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
      <div class="players-panel">
        <h3>Jugadores ({{ game?.players?.length || 0 }}/{{ game?.maxPlayers }})</h3>
        <div class="players-list">
          <div 
            v-for="player in game?.players" 
            :key="player.id"
            class="player-card"
            :class="{ 'current-player': player.id === playerId }"
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
              <h4>{{ player.civilizationName }}</h4>
              <p class="player-name">{{ player.name }}</p>
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
            class="player-card empty-slot"
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
      <div class="rules-panel">
        <h3>Reglas del Juego</h3>
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
    <div class="room-actions">
      <button 
        @click="leaveGame"
        class="btn btn-secondary"
      >
        Salir del Juego
      </button>
      
      <button 
        @click="startGame"
        class="btn btn-primary"
        :disabled="!canStartGame"
      >
        {{ canStartGame ? 'Iniciar Juego' : `Esperando jugadores (${game?.players?.length || 0}/${game?.maxPlayers})` }}
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
import { computed } from 'vue'

const emit = defineEmits(['start-game', 'leave-game'])
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
  if (canStartGame.value) {
    emit('start-game')
  }
}

const leaveGame = () => {
  emit('leave-game')
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
    domination: 'Conquista el 60% del mapa o elimina a todos los oponentes',
    science: 'Sé el primero en alcanzar 1000 puntos de Ciencia',
    culture: 'Sé el primero en alcanzar 1000 puntos de Cultura',
    economic: 'Sé el primero en alcanzar 2000 puntos de Oro'
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