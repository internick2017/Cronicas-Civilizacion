<template>
  <div class="story-session">
    <!-- Session Header -->
    <div class="session-header">
              <div class="session-info">
          <h1 class="session-title">{{ session?.title || 'Cargando...' }}</h1>
          <p class="session-description">{{ session?.description || 'Una aventura épica colaborativa' }}</p>
          <div class="session-meta">
            <span class="game-type">{{ getGameTypeLabel(session?.settings?.gameType) }}</span>
            <span class="turn-info">Turno {{ session?.turnNumber || 1 }}</span>
            <span class="player-count">{{ session?.players?.length || 0 }} jugadores</span>
          </div>
        </div>
      <div class="session-controls">
        <button @click="showSettings = !showSettings" class="settings-btn" title="Configuración">
          ⚙️
        </button>
        <button @click="exportStory" class="export-btn" title="Exportar historia">
          📄
        </button>
        <button @click="endSession" class="end-btn" title="Terminar sesión">
          🏁
        </button>
      </div>
    </div>

    <!-- Main Content -->
    <div class="session-content">
      <!-- Left Panel: Story History -->
      <div class="story-panel">
        <div class="panel-header">
          <h3>📜 Historia de la Aventura</h3>
          <div class="panel-controls">
            <button @click="scrollToBottom" class="scroll-btn" title="Ir al final">
              ⬇️
            </button>
            <button @click="toggleAutoScroll" :class="{ active: autoScroll }" class="auto-scroll-btn" title="Auto-scroll">
              {{ autoScroll ? '🔄' : '⏸️' }}
            </button>
          </div>
        </div>

        <div class="story-content" ref="storyContent">
          <!-- Welcome message -->
          <div v-if="storyHistory.length === 0" class="welcome-message">
            <div class="welcome-icon">🌟</div>
            <h4>¡Bienvenido a la aventura!</h4>
            <p>Aquí se narrará la historia épica que crearás junto con tu familia. Cada acción que escribas será contada por la IA, creando una historia única y emocionante.</p>
          </div>

          <!-- Story entries -->
          <div v-for="(entry, index) in storyHistory" :key="entry.id" class="story-entry" :class="entry.type">
            <div class="entry-header">
              <div class="entry-icon">{{ getEntryIcon(entry.type) }}</div>
              <div class="entry-meta">
                <span class="entry-type">{{ getEntryTypeLabel(entry.type) }}</span>
                <span class="entry-time">{{ formatTime(entry.timestamp) }}</span>
                <span v-if="entry.turnNumber" class="turn-badge">Turno {{ entry.turnNumber }}</span>
              </div>
            </div>
            
            <div class="entry-content">
              <!-- Player action -->
              <div v-if="entry.type === 'player_action'" class="player-action">
                <div class="character-info">
                  <strong>{{ entry.characterName }}</strong>
                  <span class="action-label">dice:</span>
                </div>
                <div class="action-text">{{ entry.action }}</div>
              </div>
              
              <!-- AI narrative -->
              <div v-else-if="entry.type === 'ai_narrative'" class="ai-narrative">
                <div class="narrative-text" v-html="formatNarrative(entry.narrative)"></div>
              </div>
            </div>
          </div>

          <!-- Typing indicator -->
          <div v-if="isGenerating" class="typing-indicator">
            <div class="typing-dots">
              <span></span>
              <span></span>
              <span></span>
            </div>
            <span class="typing-text">La IA está generando la narrativa...</span>
          </div>
        </div>
      </div>

      <!-- Right Panel: Player Input & Info -->
      <div class="player-panel">
        <!-- Player List -->
        <div class="player-list">
          <h3>👥 Jugadores</h3>
          <div class="players">
            <div 
              v-for="player in session?.players || []" 
              :key="player.id" 
              class="player-item"
              :class="{ current: isCurrentPlayer(player.id) }"
            >
              <div class="player-avatar">{{ getPlayerAvatar(player, session) }}</div>
              <div class="player-details">
                <div class="player-name">{{ getPlayerDisplayName(player) }}</div>
                <div class="player-class">{{ getPlayerDisplayClass(player) }}</div>
              </div>
              <div v-if="isCurrentPlayer(player.id)" class="current-indicator">
                🎯
              </div>
            </div>
          </div>
        </div>

        <!-- Story Input -->
                    <StoryInput
              :current-player="currentPlayer"
              :is-my-turn="isMyTurn"
              :is-submitting="isGenerating"
              :next-player-name="nextPlayerName"
              :session-id="sessionId"
              :game-type="session?.settings?.gameType || 'character'"
              @submit-action="handleSubmitAction"
              @clear-error="clearError"
            />

        <!-- Session Info -->
        <div class="session-info-panel">
          <h3>📊 Información de la Sesión</h3>
          <div class="info-grid">
            <div class="info-item">
              <span class="info-label">Turno actual:</span>
              <span class="info-value">{{ session?.turnNumber || 1 }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Jugadores:</span>
              <span class="info-value">{{ session?.players?.length || 0 }}/{{ session?.maxPlayers || 6 }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Entradas:</span>
              <span class="info-value">{{ storyHistory.length }}</span>
            </div>
            <div class="info-item">
              <span class="info-label">Estado:</span>
              <span class="info-value status-active" v-if="session?.isActive">Activa</span>
              <span class="info-value status-ended" v-else>Terminada</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Settings Modal -->
    <div v-if="showSettings" class="modal-overlay" @click="showSettings = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>⚙️ Configuración de la Sesión</h3>
          <button @click="showSettings = false" class="close-btn">✕</button>
        </div>
        <div class="modal-body">
          <div class="setting-group">
            <label>Género de la historia:</label>
            <select v-model="localSettings.genre">
              <option value="fantasy">Fantasía</option>
              <option value="historical">Histórico</option>
              <option value="sci-fi">Ciencia Ficción</option>
              <option value="mystery">Misterio</option>
            </select>
          </div>
          <div class="setting-group">
            <label>Longitud de la narrativa:</label>
            <select v-model="localSettings.storyLength">
              <option value="short">Corta</option>
              <option value="medium">Media</option>
              <option value="long">Larga</option>
            </select>
          </div>
          <div class="setting-group">
            <label>Creatividad de la IA:</label>
            <input type="range" v-model="localSettings.aiCreativity" min="0.1" max="1.0" step="0.1" />
            <span>{{ Math.round(localSettings.aiCreativity * 100) }}%</span>
          </div>
        </div>
        <div class="modal-footer">
          <button @click="saveSettings" class="save-btn">💾 Guardar</button>
          <button @click="showSettings = false" class="cancel-btn">❌ Cancelar</button>
        </div>
      </div>
    </div>

    <!-- Error Toast -->
    <div v-if="errorMessage" class="error-toast">
      <div class="error-icon">⚠️</div>
      <span>{{ errorMessage }}</span>
      <button @click="clearError" class="close-error">✕</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import StoryInput from './StoryInput.vue'

const props = defineProps({
  sessionId: {
    type: String,
    required: true
  },
  currentPlayerId: {
    type: String,
    required: true
  }
})

const emit = defineEmits(['session-ended', 'error'])

// Refs
const storyContent = ref(null)
const autoScroll = ref(true)
const showSettings = ref(false)
const isGenerating = ref(false)
const errorMessage = ref('')
const storyHistory = ref([])
const session = ref(null)
const localSettings = ref({
  genre: 'fantasy',
  storyLength: 'medium',
  aiCreativity: 0.8
})

// Computed
const currentPlayer = computed(() => {
  if (!session.value?.players || !Array.isArray(session.value.players)) return null
  return session.value.players.find(p => p.id === props.currentPlayerId)
})

const isMyTurn = computed(() => {
  if (!session.value || !currentPlayer.value || !Array.isArray(session.value.players)) return false
  const currentPlayerIndex = session.value.currentPlayerIndex
  const playerIndex = session.value.players.findIndex(p => p.id === props.currentPlayerId)
  return currentPlayerIndex === playerIndex
})

const nextPlayerName = computed(() => {
  if (!session.value || !Array.isArray(session.value.players) || session.value.players.length === 0) return ''
  const nextIndex = (session.value.currentPlayerIndex + 1) % session.value.players.length
  const nextPlayer = session.value.players[nextIndex]
  return nextPlayer?.characterName || 'Siguiente jugador'
})

// Methods
const isCurrentPlayer = (playerId) => {
  if (!session.value) return false
  const currentPlayerIndex = session.value.currentPlayerIndex
  const playerIndex = session.value.players.findIndex(p => p.id === playerId)
  return currentPlayerIndex === playerIndex
}

const getEntryIcon = (type) => {
  const icons = {
    'player_action': '👤',
    'ai_narrative': '🤖',
    'system': '⚙️'
  }
  return icons[type] || '📝'
}

const getEntryTypeLabel = (type) => {
  const labels = {
    'player_action': 'Acción del Jugador',
    'ai_narrative': 'Narrativa IA',
    'system': 'Sistema'
  }
  return labels[type] || 'Entrada'
}

const getPlayerAvatar = (player, session) => {
  const gameType = session?.settings?.gameType || 'character'
  
  if (gameType === 'character') {
    const avatars = {
      'Aventurero': '🗡️',
      'Mago': '🔮',
      'Guerrero': '⚔️',
      'Arquero': '🏹',
      'Hechicero': '✨',
      'Caballero': '🛡️',
      'Mercader': '💰',
      'Explorador': '🗺️'
    }
    return avatars[player.characterClass] || '👤'
  } else if (gameType === 'country') {
    const avatars = {
      'Reino': '👑',
      'Imperio': '🏛️',
      'República': '⚖️',
      'Principado': '👑',
      'Confederación': '🤝',
      'Ciudad-Estado': '🏙️',
      'Tribu': '🏹',
      'Orden': '⚔️'
    }
    return avatars[player.countryType] || '🏛️'
  } else if (gameType === 'world') {
    const avatars = {
      'Continente': '🗺️',
      'Civilización': '🏛️',
      'Reino': '👑',
      'Imperio': '🏛️',
      'Federación': '🤝',
      'Alianza': '⚔️',
      'Gremio': '💰',
      'Orden': '⚔️'
    }
    return avatars[player.worldType] || '🌍'
  }
  
  return '👤'
}

const getPlayerDisplayName = (player) => {
  const gameType = session.value?.settings?.gameType || 'character'
  
  if (gameType === 'character') {
    return player.characterName || player.name
  } else if (gameType === 'country') {
    return player.countryName || player.name
  } else if (gameType === 'world') {
    return player.worldRole || player.name
  }
  
  return player.name
}

const getPlayerDisplayClass = (player) => {
  const gameType = session.value?.settings?.gameType || 'character'
  
  if (gameType === 'character') {
    return player.characterClass || 'Aventurero'
  } else if (gameType === 'country') {
    return player.countryType || 'Reino'
  } else if (gameType === 'world') {
    return player.worldType || 'Continente'
  }
  
  return 'Jugador'
}

const getGameTypeLabel = (gameType) => {
  const labels = {
    'character': '👤 Personajes',
    'country': '🏛️ Países',
    'world': '🌍 Mundo'
  }
  return labels[gameType] || '👤 Personajes'
}

const formatTime = (timestamp) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('es-ES', { 
    hour: '2-digit', 
    minute: '2-digit' 
  })
}

const formatNarrative = (text) => {
  if (!text) return ''
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>')
}

const scrollToBottom = () => {
  if (storyContent.value) {
    storyContent.value.scrollTop = storyContent.value.scrollHeight
  }
}

const toggleAutoScroll = () => {
  autoScroll.value = !autoScroll.value
}

const handleSubmitAction = async (action) => {
  try {
    isGenerating.value = true
    errorMessage.value = ''
    
    const response = await fetch(`/api/narrative/sessions/${props.sessionId}/action`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        playerId: props.currentPlayerId,
        action: action
      })
    })

    const result = await response.json()
    
    if (!result.success) {
      throw new Error(result.message || 'Error al enviar la acción')
    }

    // Update session and history
    await loadSession()
    await loadHistory()
    
  } catch (error) {
    console.error('Error submitting action:', error)
    errorMessage.value = error.message || 'Error al enviar la acción'
    emit('error', error.message)
  } finally {
    isGenerating.value = false
  }
}

const loadSession = async () => {
  try {
    const response = await fetch(`/api/narrative/sessions/${props.sessionId}`)
    const result = await response.json()
    
    if (result.success) {
      session.value = result.data
    } else {
      throw new Error(result.message)
    }
  } catch (error) {
    console.error('Error loading session:', error)
    errorMessage.value = 'Error al cargar la sesión'
  }
}

const loadHistory = async () => {
  try {
    const response = await fetch(`/api/narrative/sessions/${props.sessionId}/history?limit=50`)
    const result = await response.json()
    
    if (result.success) {
      storyHistory.value = result.data
    } else {
      throw new Error(result.message)
    }
  } catch (error) {
    console.error('Error loading history:', error)
    errorMessage.value = 'Error al cargar el historial'
  }
}

const saveSettings = async () => {
  try {
    const response = await fetch(`/api/narrative/sessions/${props.sessionId}/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        settings: localSettings.value
      })
    })

    const result = await response.json()
    
    if (result.success) {
      showSettings.value = false
    } else {
      throw new Error(result.message)
    }
  } catch (error) {
    console.error('Error saving settings:', error)
    errorMessage.value = 'Error al guardar la configuración'
  }
}

const exportStory = async () => {
  try {
    const response = await fetch(`/api/narrative/sessions/${props.sessionId}/export`)
    const result = await response.json()
    
    if (result.success) {
      const dataStr = JSON.stringify(result.data, null, 2)
      const dataBlob = new Blob([dataStr], { type: 'application/json' })
      const url = URL.createObjectURL(dataBlob)
      const link = document.createElement('a')
      link.href = url
      link.download = `historia-${props.sessionId}.json`
      link.click()
      URL.revokeObjectURL(url)
    } else {
      throw new Error(result.message)
    }
  } catch (error) {
    console.error('Error exporting story:', error)
    errorMessage.value = 'Error al exportar la historia'
  }
}

const endSession = async () => {
  if (!confirm('¿Estás seguro de que quieres terminar esta sesión?')) return
  
  try {
    const response = await fetch(`/api/narrative/sessions/${props.sessionId}/end`, {
      method: 'POST'
    })
    
    const result = await response.json()
    
    if (result.success) {
      emit('session-ended', result.data)
    } else {
      throw new Error(result.message)
    }
  } catch (error) {
    console.error('Error ending session:', error)
    errorMessage.value = 'Error al terminar la sesión'
  }
}

const clearError = () => {
  errorMessage.value = ''
}

// Auto-scroll when new entries are added
watch(storyHistory, () => {
  if (autoScroll.value) {
    nextTick(() => {
      scrollToBottom()
    })
  }
}, { deep: true })

// Auto-scroll when generating
watch(isGenerating, (newValue) => {
  if (newValue && autoScroll.value) {
    nextTick(() => {
      scrollToBottom()
    })
  }
})

// Set up polling interval ref
let pollInterval = null

// Load data on mount
onMounted(async () => {
  await loadSession()
  await loadHistory()
  
  // Set up polling for updates
  pollInterval = setInterval(async () => {
    if (session.value?.isActive) {
      await loadSession()
      await loadHistory()
    }
  }, 3000) // Poll every 3 seconds
})

// Clean up on unmount
onUnmounted(() => {
  if (pollInterval) {
    clearInterval(pollInterval)
  }
})
</script>

<style scoped>
.story-session {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  color: white;
}

.session-header {
  background: linear-gradient(135deg, #8B4513 0%, #A0522D 100%);
  padding: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid rgba(255, 255, 255, 0.1);
}

.session-title {
  margin: 0;
  font-size: 1.8em;
  color: #F5DEB3;
}

.session-description {
  margin: 5px 0 0 0;
  color: #DEB887;
  font-style: italic;
}

.session-meta {
  display: flex;
  gap: 15px;
  margin-top: 10px;
  font-size: 0.9em;
  color: #bdc3c7;
}

.game-type, .turn-info, .player-count {
  background: rgba(52, 152, 219, 0.2);
  padding: 4px 8px;
  border-radius: 12px;
  border: 1px solid rgba(52, 152, 219, 0.3);
}

.session-controls {
  display: flex;
  gap: 10px;
}

.session-controls button {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  padding: 10px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1.2em;
  transition: all 0.3s ease;
}

.session-controls button:hover {
  background: rgba(255, 255, 255, 0.2);
  transform: translateY(-1px);
}

.session-content {
  flex: 1;
  display: flex;
  overflow: hidden;
}

.story-panel {
  flex: 2;
  display: flex;
  flex-direction: column;
  border-right: 1px solid rgba(255, 255, 255, 0.1);
}

.player-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 20px;
  padding: 20px;
  overflow-y: auto;
}

.panel-header {
  background: linear-gradient(135deg, #34495e 0%, #2c3e50 100%);
  padding: 15px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.panel-header h3 {
  margin: 0;
  color: #ecf0f1;
}

.panel-controls {
  display: flex;
  gap: 8px;
}

.panel-controls button {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  padding: 6px 8px;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.3s ease;
}

.panel-controls button:hover {
  background: rgba(255, 255, 255, 0.2);
}

.auto-scroll-btn.active {
  background: rgba(46, 204, 113, 0.3);
  border-color: rgba(46, 204, 113, 0.5);
}

.story-content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
  scroll-behavior: smooth;
}

.welcome-message {
  text-align: center;
  padding: 40px 20px;
  color: #bdc3c7;
}

.welcome-icon {
  font-size: 3em;
  margin-bottom: 20px;
}

.welcome-message h4 {
  color: #F5DEB3;
  margin-bottom: 15px;
  font-size: 1.3em;
}

.welcome-message p {
  line-height: 1.6;
  max-width: 400px;
  margin: 0 auto;
}

.story-entry {
  margin-bottom: 20px;
  padding: 15px;
  border-radius: 8px;
  border-left: 4px solid #3498db;
  background: rgba(255, 255, 255, 0.05);
  transition: all 0.3s ease;
}

.story-entry:hover {
  background: rgba(255, 255, 255, 0.08);
}

.story-entry.player_action {
  border-left-color: #e74c3c;
  background: rgba(231, 76, 60, 0.1);
}

.story-entry.ai_narrative {
  border-left-color: #9b59b6;
  background: rgba(155, 89, 182, 0.1);
}

.entry-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.entry-icon {
  font-size: 1.2em;
  width: 24px;
  text-align: center;
}

.entry-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.entry-type {
  font-size: 0.9em;
  font-weight: bold;
  color: #ecf0f1;
}

.entry-time {
  font-size: 0.8em;
  color: #7f8c8d;
}

.turn-badge {
  background: rgba(52, 152, 219, 0.3);
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.8em;
  font-weight: bold;
}

.entry-content {
  margin-left: 34px;
}

.player-action .character-info {
  margin-bottom: 8px;
  color: #e74c3c;
  font-size: 0.95em;
}

.action-label {
  color: #bdc3c7;
  margin-left: 5px;
}

.action-text {
  line-height: 1.6;
  color: #ecf0f1;
  font-style: italic;
}

.narrative-text {
  line-height: 1.6;
  color: #bdc3c7;
}

.narrative-text :deep(strong) {
  color: #ecf0f1;
}

.narrative-text :deep(em) {
  color: #f39c12;
}

.typing-indicator {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 15px;
  background: rgba(155, 89, 182, 0.1);
  border-radius: 8px;
  border-left: 4px solid #9b59b6;
  margin-bottom: 20px;
}

.typing-dots {
  display: flex;
  gap: 3px;
}

.typing-dots span {
  width: 6px;
  height: 6px;
  background: #9b59b6;
  border-radius: 50%;
  animation: typing 1.4s infinite ease-in-out;
}

.typing-dots span:nth-child(1) {
  animation-delay: -0.32s;
}

.typing-dots span:nth-child(2) {
  animation-delay: -0.16s;
}

@keyframes typing {
  0%, 80%, 100% {
    transform: scale(0.8);
    opacity: 0.5;
  }
  40% {
    transform: scale(1);
    opacity: 1;
  }
}

.typing-text {
  color: #9b59b6;
  font-style: italic;
  font-size: 0.9em;
}

.player-list {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 15px;
}

.player-list h3 {
  margin: 0 0 15px 0;
  color: #ecf0f1;
}

.players {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.player-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.05);
  transition: all 0.3s ease;
}

.player-item.current {
  background: rgba(46, 204, 113, 0.2);
  border-left: 3px solid #2ecc71;
}

.player-avatar {
  font-size: 1.5em;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(52, 152, 219, 0.2);
  border-radius: 50%;
}

.player-details {
  flex: 1;
}

.player-name {
  font-weight: bold;
  color: #ecf0f1;
  font-size: 0.95em;
}

.player-class {
  font-size: 0.8em;
  color: #bdc3c7;
  font-style: italic;
}

.current-indicator {
  font-size: 1.2em;
  animation: pulse 2s infinite;
}

.session-info-panel {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  padding: 15px;
}

.session-info-panel h3 {
  margin: 0 0 15px 0;
  color: #ecf0f1;
}

.info-grid {
  display: grid;
  gap: 10px;
}

.info-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.info-label {
  color: #bdc3c7;
  font-size: 0.9em;
}

.info-value {
  font-weight: bold;
  color: #ecf0f1;
}

.status-active {
  color: #2ecc71;
}

.status-ended {
  color: #e74c3c;
}

/* Modal styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
  border-radius: 12px;
  padding: 20px;
  max-width: 500px;
  width: 90%;
  max-height: 80vh;
  overflow-y: auto;
  color: white;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.modal-header h3 {
  margin: 0;
  color: #ecf0f1;
}

.close-btn {
  background: none;
  border: none;
  color: #bdc3c7;
  font-size: 1.5em;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.3s ease;
}

.close-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  color: white;
}

.setting-group {
  margin-bottom: 20px;
}

.setting-group label {
  display: block;
  margin-bottom: 8px;
  color: #ecf0f1;
  font-weight: bold;
}

.setting-group select,
.setting-group input[type="range"] {
  width: 100%;
  padding: 8px;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 4px;
  color: white;
}

.setting-group select option {
  background: #2c3e50;
  color: white;
}

.modal-footer {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  margin-top: 20px;
  padding-top: 15px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.save-btn,
.cancel-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
  transition: all 0.3s ease;
}

.save-btn {
  background: linear-gradient(45deg, #27ae60, #2ecc71);
  color: white;
}

.save-btn:hover {
  background: linear-gradient(45deg, #2ecc71, #27ae60);
  transform: translateY(-1px);
}

.cancel-btn {
  background: rgba(231, 76, 60, 0.2);
  color: #e74c3c;
  border: 1px solid rgba(231, 76, 60, 0.3);
}

.cancel-btn:hover {
  background: rgba(231, 76, 60, 0.3);
  border-color: rgba(231, 76, 60, 0.5);
}

/* Error toast */
.error-toast {
  position: fixed;
  top: 20px;
  right: 20px;
  background: rgba(231, 76, 60, 0.9);
  color: white;
  padding: 15px 20px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  gap: 10px;
  z-index: 1001;
  animation: slideIn 0.3s ease;
}

@keyframes slideIn {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

.close-error {
  background: none;
  border: none;
  color: white;
  cursor: pointer;
  font-size: 1.2em;
  padding: 0;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
}

/* Scrollbar styling */
.story-content::-webkit-scrollbar,
.player-panel::-webkit-scrollbar {
  width: 8px;
}

.story-content::-webkit-scrollbar-track,
.player-panel::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

.story-content::-webkit-scrollbar-thumb,
.player-panel::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 4px;
}

.story-content::-webkit-scrollbar-thumb:hover,
.player-panel::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}

@media (max-width: 768px) {
  .session-content {
    flex-direction: column;
  }
  
  .story-panel {
    flex: 1;
    border-right: none;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }
  
  .player-panel {
    flex: none;
    max-height: 40vh;
  }
  
  .session-header {
    flex-direction: column;
    gap: 15px;
    text-align: center;
  }
  
  .modal-content {
    width: 95%;
    margin: 20px;
  }
}
</style> 