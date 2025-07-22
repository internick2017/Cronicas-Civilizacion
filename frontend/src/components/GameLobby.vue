<template>
  <div class="game-lobby">
    <div class="lobby-header">
      <h2>🏛️ Lobby de Juegos</h2>
      <p>Crea una nueva partida o únete a una existente</p>
    </div>

    <div class="lobby-content">
      <!-- Create Game Section -->
      <div class="create-game-section">
        <h3>Crear Nueva Partida</h3>
        <form @submit.prevent="createNewGame" class="create-game-form">
          <div class="form-group">
            <label for="gameName">Nombre del Juego:</label>
            <input 
              id="gameName"
              v-model="newGame.name" 
              type="text" 
              required 
              placeholder="Mi Civilización Épica"
            >
          </div>
          
          <div class="form-group">
            <label for="maxPlayers">Máximo Jugadores:</label>
            <select id="maxPlayers" v-model="newGame.maxPlayers">
              <option value="2">2 Jugadores</option>
              <option value="3">3 Jugadores</option>
              <option value="4">4 Jugadores</option>
              <option value="6">6 Jugadores</option>
            </select>
          </div>
          
          <div class="form-group">
            <label for="mapSize">Tamaño del Mapa:</label>
            <select id="mapSize" v-model="newGame.mapSize">
              <option value="15">Pequeño (15x15)</option>
              <option value="20">Mediano (20x20)</option>
              <option value="25">Grande (25x25)</option>
              <option value="30">Épico (30x30)</option>
            </select>
          </div>
          
          <div class="form-group">
            <label for="gameMode">Modo de Juego:</label>
            <select id="gameMode" v-model="newGame.gameMode">
              <option value="domination">Dominación</option>
              <option value="science">Victoria Científica</option>
              <option value="culture">Victoria Cultural</option>
              <option value="economic">Victoria Económica</option>
            </select>
          </div>
          
          <div class="form-group">
            <label for="civilizationName">Nombre de tu Civilización:</label>
            <input 
              id="civilizationName"
              v-model="newGame.civilizationName" 
              type="text" 
              required 
              placeholder="Imperio Romano"
            >
          </div>
          
          <button type="submit" class="btn btn-primary" :disabled="creating">
            {{ creating ? 'Creando...' : 'Crear Partida' }}
          </button>
        </form>
      </div>

      <!-- Available Games Section -->
      <div class="available-games-section">
        <h3>Partidas Disponibles</h3>
        <div class="games-list">
          <div v-if="games.length === 0" class="no-games">
            <p>No hay partidas disponibles</p>
            <p class="hint">¡Crea la primera partida!</p>
          </div>
          
          <div v-else>
            <div 
              v-for="game in availableGames" 
              :key="game.id" 
              class="game-card"
            >
              <div class="game-info">
                <h4>{{ game.name }}</h4>
                <div class="game-details">
                  <span class="detail">
                    <i class="icon">👥</i>
                    {{ game.players }}/{{ game.maxPlayers }}
                  </span>
                  <span class="detail">
                    <i class="icon">🗺️</i>
                    {{ getMapSizeText(game.mapSize) }}
                  </span>
                  <span class="detail">
                    <i class="icon">🎯</i>
                    {{ getGameModeText(game.gameMode) }}
                  </span>
                  <span class="detail">
                    <i class="icon">⏰</i>
                    {{ formatDate(game.createdAt) }}
                  </span>
                </div>
              </div>
              
              <div class="game-actions">
                <div class="join-form">
                  <input 
                    v-model="joinForms[game.id]" 
                    type="text" 
                    placeholder="Nombre de civilización"
                    class="civilization-input"
                  >
                  <button 
                    @click="joinGame(game.id)"
                    class="btn btn-secondary"
                    :disabled="!joinForms[game.id] || joining === game.id"
                  >
                    {{ joining === game.id ? 'Uniéndose...' : 'Unirse' }}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
        
        <button @click="refreshGames" class="btn btn-outline refresh-btn">
          <i class="icon">🔄</i>
          Actualizar Lista
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'

const emit = defineEmits(['create-game', 'join-game'])
const props = defineProps({
  games: {
    type: Array,
    default: () => []
  }
})

// Reactive data
const creating = ref(false)
const joining = ref(null)
const joinForms = ref({})

const newGame = ref({
  name: '',
  maxPlayers: 4,
  mapSize: 20,
  gameMode: 'domination',
  civilizationName: ''
})

// Computed properties
const availableGames = computed(() => {
  return props.games.filter(game => 
    game.status === 'waiting' && game.players < game.maxPlayers
  )
})

// Methods
const createNewGame = async () => {
  if (!newGame.value.name || !newGame.value.civilizationName) return
  
  creating.value = true
  try {
    emit('create-game', { ...newGame.value })
    
    // Reset form
    newGame.value = {
      name: '',
      maxPlayers: 4,
      mapSize: 20,
      gameMode: 'domination',
      civilizationName: ''
    }
  } finally {
    creating.value = false
  }
}

const joinGame = async (gameId) => {
  const civilizationName = joinForms.value[gameId]
  if (!civilizationName) return
  
  joining.value = gameId
  try {
    emit('join-game', gameId, civilizationName)
    joinForms.value[gameId] = ''
  } finally {
    joining.value = null
  }
}

const refreshGames = () => {
  // This would typically refresh the games list
  console.log('Refreshing games...')
}

const getMapSizeText = (size) => {
  const sizes = {
    15: 'Pequeño',
    20: 'Mediano', 
    25: 'Grande',
    30: 'Épico'
  }
  return sizes[size] || `${size}x${size}`
}

const getGameModeText = (mode) => {
  const modes = {
    domination: 'Dominación',
    science: 'Científica',
    culture: 'Cultural',
    economic: 'Económica'
  }
  return modes[mode] || mode
}

const formatDate = (dateString) => {
  return new Date(dateString).toLocaleDateString('es-ES', {
    hour: '2-digit',
    minute: '2-digit'
  })
}

// Initialize join forms for existing games
onMounted(() => {
  props.games.forEach(game => {
    joinForms.value[game.id] = ''
  })
})
</script>

<style scoped>
.game-lobby {
  max-width: 1200px;
  margin: 0 auto;
  padding: 20px;
}

.lobby-header {
  text-align: center;
  margin-bottom: 40px;
}

.lobby-header h2 {
  color: #2c3e50;
  margin-bottom: 10px;
  font-size: 2.5rem;
}

.lobby-header p {
  color: #7f8c8d;
  font-size: 1.1rem;
}

.lobby-content {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 40px;
  align-items: start;
}

.create-game-section,
.available-games-section {
  background: white;
  border-radius: 12px;
  padding: 30px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.create-game-section h3,
.available-games-section h3 {
  color: #2c3e50;
  margin-bottom: 20px;
  font-size: 1.5rem;
  border-bottom: 2px solid #3498db;
  padding-bottom: 10px;
}

.create-game-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
}

.form-group label {
  margin-bottom: 5px;
  color: #34495e;
  font-weight: 600;
}

.form-group input,
.form-group select {
  padding: 12px;
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  font-size: 16px;
  transition: border-color 0.3s;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #3498db;
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
  background: #3498db;
  color: white;
}

.btn-primary:hover:not(:disabled) {
  background: #2980b9;
  transform: translateY(-2px);
}

.btn-secondary {
  background: #2ecc71;
  color: white;
}

.btn-secondary:hover:not(:disabled) {
  background: #27ae60;
}

.btn-outline {
  background: transparent;
  color: #3498db;
  border: 2px solid #3498db;
}

.btn-outline:hover {
  background: #3498db;
  color: white;
}

.btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.games-list {
  margin-bottom: 20px;
}

.no-games {
  text-align: center;
  padding: 40px;
  color: #7f8c8d;
}

.no-games .hint {
  font-style: italic;
  margin-top: 10px;
}

.game-card {
  border: 2px solid #e0e0e0;
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 15px;
  transition: all 0.3s;
}

.game-card:hover {
  border-color: #3498db;
  transform: translateY(-2px);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.game-info h4 {
  color: #2c3e50;
  margin-bottom: 10px;
  font-size: 1.3rem;
}

.game-details {
  display: flex;
  flex-wrap: wrap;
  gap: 15px;
  margin-bottom: 15px;
}

.detail {
  display: flex;
  align-items: center;
  gap: 5px;
  color: #7f8c8d;
  font-size: 0.9rem;
}

.icon {
  font-size: 1rem;
}

.join-form {
  display: flex;
  gap: 10px;
  align-items: center;
}

.civilization-input {
  flex: 1;
  padding: 8px 12px;
  border: 2px solid #e0e0e0;
  border-radius: 6px;
  font-size: 14px;
}

.civilization-input:focus {
  outline: none;
  border-color: #3498db;
}

.refresh-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

@media (max-width: 768px) {
  .lobby-content {
    grid-template-columns: 1fr;
  }
  
  .create-game-section,
  .available-games-section {
    padding: 20px;
  }
  
  .game-details {
    flex-direction: column;
    gap: 8px;
  }
  
  .join-form {
    flex-direction: column;
  }
}
</style> 