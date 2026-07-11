<template>
  <div class="game-lobby scrollbar-game bg-game-pattern">
    <!-- Gaming Header -->
    <div class="header-game">
      <h1 class="flex items-center justify-center gap-4 text-glow">
        <span class="icon-game">🏛️</span>
        Crónicas de Civilización
        <span class="icon-game">🏛️</span>
      </h1>
      <h2 class="text-shadow-game">Lobby de Juegos</h2>
      <p class="text-shadow-game">Crea una nueva partida o únete a una existente</p>
    </div>

    <!-- Main Content Grid -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      
      <!-- Create Game Panel -->
      <div class="panel-game">
        <div class="flex items-center gap-3 mb-6">
          <span class="icon-game">⚔️</span>
          <h3 class="text-2xl font-game font-bold text-game-light">Crear Nueva Partida</h3>
        </div>
        
        <form @submit.prevent="createNewGame" class="space-y-6">
          <div class="space-y-2">
            <label class="block text-game-light font-semibold">Nombre del Juego</label>
            <input 
              v-model="newGame.name" 
              type="text" 
              required 
              placeholder="Mi Civilización Épica"
              class="input-game w-full"
            >
          </div>
          
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-2">
              <label class="block text-game-light font-semibold">Máximo Jugadores</label>
              <select v-model="newGame.maxPlayers" class="input-game w-full">
                <option value="2">2 Jugadores</option>
                <option value="3">3 Jugadores</option>
                <option value="4">4 Jugadores</option>
                <option value="6">6 Jugadores</option>
              </select>
            </div>
            
            <div class="space-y-2">
              <label class="block text-game-light font-semibold">Tamaño del Mapa</label>
              <select v-model="newGame.mapSize" class="input-game w-full">
                <option value="15">Pequeño (15x15)</option>
                <option value="20">Mediano (20x20)</option>
                <option value="25">Grande (25x25)</option>
                <option value="30">Épico (30x30)</option>
              </select>
            </div>
          </div>
          
          <div class="space-y-2">
            <label class="block text-game-light font-semibold">Modo de Juego</label>
            <select v-model="newGame.gameMode" class="input-game w-full">
              <option value="classic">Clásico</option>
              <option value="fast">Rápido</option>
              <option value="custom">Personalizado</option>
            </select>
          </div>
          
          <div class="space-y-2">
            <label class="block text-game-light font-semibold">Nombre de tu Civilización</label>
            <input 
              v-model="newGame.civilizationName" 
              type="text" 
              required 
              placeholder="Imperio Romano"
              class="input-game w-full"
            >
          </div>
          
          <button type="submit" class="btn-game-primary w-full" :disabled="creating">
            <span v-if="creating" class="loading-game">Creando...</span>
            <span v-else class="flex items-center justify-center gap-2">
              <span class="icon-game">⚔️</span>
              Crear Partida
            </span>
          </button>
        </form>
      </div>

      <!-- Available Games Panel -->
      <div class="panel-game">
        <div class="flex items-center justify-between mb-6">
          <div class="flex items-center gap-3">
            <span class="icon-game">🎮</span>
            <h3 class="text-2xl font-game font-bold text-game-light text-shadow-game">Partidas Disponibles</h3>
          </div>
          <button @click="refreshGames" class="btn-game-outline" title="Actualizar lista de partidas">
            <span class="icon-game">🔄</span>
          </button>
        </div>
        
        <div class="space-y-4 max-h-96 overflow-y-auto scrollbar-game">
          <div v-if="games.length === 0" class="text-center py-12">
            <span class="icon-game text-6xl mb-4 block">🏰</span>
            <p class="text-game-light/60 text-lg">No hay partidas disponibles</p>
            <p class="text-game-light/40 text-sm mt-2">¡Crea la primera partida!</p>
          </div>
          
          <div v-else class="space-y-4">
            <div 
              v-for="game in availableGames" 
              :key="game.id" 
              class="card-game p-4 hover:scale-105 transition-all duration-300 group"
            >
              <!-- Game Header -->
              <div class="flex items-center justify-between mb-3">
                <h4 class="text-xl font-game font-bold text-game-light">{{ game.name }}</h4>
                <div class="badge-game">
                  <span class="icon-game">👥</span>
                  {{ game.players }}/{{ game.maxPlayers }}
                </div>
              </div>
              
              <!-- Game Details -->
              <div class="grid grid-cols-2 gap-3 mb-4">
                <div class="flex items-center gap-2 text-sm text-game-light/80">
                  <span class="icon-game">🗺️</span>
                  {{ getMapSizeText(game.mapSize) }}
                </div>
                <div class="flex items-center gap-2 text-sm text-game-light/80">
                  <span class="icon-game">🎯</span>
                  {{ getGameModeText(game.gameMode) }}
                </div>
                <div class="flex items-center gap-2 text-sm text-game-light/80">
                  <span class="icon-game">⏰</span>
                  {{ formatDate(game.createdAt) }}
                </div>
                <div class="flex items-center gap-2 text-sm">
                  <span class="icon-game">🏆</span>
                  <span :class="game.status === 'waiting' ? 'text-game-warning' : 'text-game-success'">
                    {{ game.status === 'waiting' ? 'Esperando' : 'En Juego' }}
                  </span>
                  <div :class="game.status === 'waiting' ? 'status-waiting' : 'status-online'" class="w-2 h-2 rounded-full"></div>
                </div>
              </div>
              
              <!-- Player List -->
              <div v-if="game.playerList && game.playerList.length > 0" class="mb-4 p-3 bg-game-primary/10 rounded-lg border border-game-primary/20">
                <div class="flex items-center gap-2 text-sm text-game-success font-semibold mb-2">
                  <span class="icon-game">👤</span>
                  Jugadores:
                </div>
                <div class="flex flex-wrap gap-2">
                  <span 
                    v-for="player in game.playerList" 
                    :key="player.id"
                    class="badge-game text-xs"
                  >
                    {{ player.civilization_name || player.name }}
                  </span>
                </div>
              </div>
              
              <!-- Game Actions -->
              <div class="flex gap-3">
                <!-- Enter Game Button -->
                <button 
                  v-if="isPlayerInGame(game)"
                  @click="enterGame(game.id)"
                  class="btn-game-primary flex-1"
                >
                  <span class="flex items-center justify-center gap-2">
                    <span class="icon-game">🎮</span>
                    Entrar al Juego
                  </span>
                </button>
                
                <!-- Join Game Form -->
                <div v-else class="flex gap-3 flex-1">
                  <input 
                    v-model="joinForms[game.id]" 
                    type="text" 
                    placeholder="Nombre de civilización"
                    class="input-game flex-1"
                  >
                  <button 
                    @click="joinGame(game.id)"
                    class="btn-game-secondary"
                    :disabled="!joinForms[game.id] || joining === game.id"
                  >
                    <span v-if="joining === game.id" class="loading-game">...</span>
                    <span v-else class="flex items-center gap-1">
                      <span class="icon-game">➕</span>
                      Unirse
                    </span>
                  </button>
                </div>
                
                <!-- Delete Game Button -->
                <button 
                  v-if="canDeleteGame(game)"
                  @click="deleteGame(game.id)"
                  class="btn-game-danger"
                  :disabled="deleting === game.id"
                >
                  <span v-if="deleting === game.id" class="loading-game">...</span>
                  <span v-else class="flex items-center gap-1">
                    <span class="icon-game">🗑️</span>
                    Eliminar
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
        
        <!-- Session Actions -->
        <div class="mt-6 flex justify-center gap-4">
          <button @click="clearSession" class="btn-game-outline">
            <span class="flex items-center gap-2">
              <span class="icon-game">🚪</span>
              Limpiar Sesión
            </span>
          </button>
          <button @click="clearAllGames" class="btn-game-danger text-sm">
            <span class="flex items-center gap-2">
              <span class="icon-game">🗑️</span>
              Limpiar Todo (Dev)
            </span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'

const emit = defineEmits(['create-game', 'join-game', 'enter-game', 'delete-game', 'clear-session', 'recover-identity'])
const props = defineProps({
  games: {
    type: Array,
    default: () => []
  },
  playerId: {
    type: String,
    default: null
  }
})

// Reactive data
const creating = ref(false)
const joining = ref(null)
const deleting = ref(null)
const joinForms = ref({})


const newGame = ref({
  name: '',
  maxPlayers: 4,
  mapSize: 20,
  gameMode: 'classic',
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
      gameMode: 'classic',
      civilizationName: ''
    }
  } finally {
    creating.value = false
  }
}

const joinGame = async (gameId) => {
  const civilizationName = joinForms.value[gameId]
  if (!civilizationName) {
    return
  }
  
  joining.value = gameId
  try {
    emit('join-game', gameId, civilizationName)
    joinForms.value[gameId] = ''
  } catch (error) {
    console.error('Error in joinGame:', error)
  } finally {
    joining.value = null
  }
}

const refreshGames = () => {
  // Refresh games list
}

const isPlayerInGame = (game) => {
  if (!props.playerId || !game.playerList) {
    return false
  }
  
  // Check by player ID
  const isInGameById = game.playerList.some(player => player.id === props.playerId)
  
  // Also check by civilization name (fallback)
  const storedCivilization = localStorage.getItem('civilizationName')
  const isInGameByName = game.playerList.some(player => 
    player.civilization_name === storedCivilization || 
    player.name === storedCivilization
  )
  
  return isInGameById || isInGameByName
}

const enterGame = (gameId) => {
  emit('enter-game', gameId)
}

const deleteGame = async (gameId) => {
  if (!confirm('¿Estás seguro de que quieres eliminar esta partida? Esta acción no se puede deshacer.')) {
    return
  }
  
  deleting.value = gameId
  try {
    emit('delete-game', gameId)
  } catch (error) {
    console.error('Error deleting game:', error)
  } finally {
    deleting.value = null
  }
}

const canDeleteGame = (game) => {
  // Can delete if:
  // 1. Game is in waiting status
  // 2. Game has no players OR current player is in the game
  // 3. Allow deletion for empty games or if user created it
  return game.status === 'waiting' && 
         (game.playerList.length === 0 || 
          isPlayerInGame(game) || 
          localStorage.getItem('civilizationName') && 
          game.playerList.some(p => p.civilization_name === localStorage.getItem('civilizationName')))
}

const clearSession = () => {
  emit('clear-session')
}

const clearAllGames = async () => {
  if (!confirm('¿Estás seguro de que quieres eliminar TODAS las partidas? Esta acción no se puede deshacer.')) {
    return
  }
  
  try {
    // Use the new clear-all-games event
    emit('clear-all-games')
  } catch (error) {
    console.error('Error clearing all games:', error)
  }
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

const getGameModeText = (mode) => {
  const modes = {
    classic: 'Clásico',
    fast: 'Rápido',
    custom: 'Personalizado'
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