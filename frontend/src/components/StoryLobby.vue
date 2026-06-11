<template>
  <div class="story-lobby">
    <div class="lobby-header">
      <h1>📚 Crónicas de Civilización</h1>
      <p class="subtitle">Crea historias épicas colaborativas con tu familia</p>
    </div>

    <div class="lobby-content">
      <!-- Create Session Section -->
      <div class="create-section">
        <h2>🎭 Crear Nueva Historia</h2>
        <div class="create-form">
          <div class="form-group">
            <label for="sessionTitle">Título de la Historia:</label>
            <input
              id="sessionTitle"
              v-model="newSession.title"
              type="text"
              placeholder="Ej: La Búsqueda del Tesoro Perdido"
              maxlength="100"
            />
          </div>
          
          <div class="form-group">
            <label for="sessionDescription">Descripción:</label>
            <textarea
              id="sessionDescription"
              v-model="newSession.description"
              placeholder="Describe brevemente el tema o ambientación de tu historia..."
              rows="3"
              maxlength="300"
            ></textarea>
          </div>
          
          <div class="form-row">
            <div class="form-group">
              <label for="maxPlayers">Máximo de Jugadores:</label>
              <select id="maxPlayers" v-model="newSession.maxPlayers">
                <option value="2">2 jugadores</option>
                <option value="3">3 jugadores</option>
                <option value="4">4 jugadores</option>
                <option value="5">5 jugadores</option>
                <option value="6">6 jugadores</option>
              </select>
            </div>
            
            <div class="form-group">
              <label for="genre">Género:</label>
              <select id="genre" v-model="newSession.genre">
                <option value="fantasy">Fantasía</option>
                <option value="historical">Histórico</option>
                <option value="sci-fi">Ciencia Ficción</option>
                <option value="mystery">Misterio</option>
              </select>
            </div>
            
            <div class="form-group">
              <label for="gameType">Tipo de Juego:</label>
              <select id="gameType" v-model="newSession.gameType">
                <option value="character">👤 Personajes (Aventureros, Magos, etc.)</option>
                <option value="country">🏛️ Países (Reinos, Imperios, etc.)</option>
                <option value="world">🌍 Mundo (Civilizaciones, Continentes, etc.)</option>
              </select>
            </div>
          </div>
          
          <button @click="createSession" :disabled="!canCreateSession || isCreating" class="create-btn">
            <span v-if="!isCreating">🚀 Crear Historia</span>
            <span v-else class="loading-text">Creando...</span>
          </button>
        </div>
      </div>

      <!-- Join Session Section -->
      <div class="join-section">
        <h2>👥 Unirse a una Historia</h2>
        
        <!-- Active Sessions -->
        <div v-if="activeSessions.length > 0" class="sessions-list">
          <h3>Sesiones Activas</h3>
          <div class="session-cards">
            <div v-for="session in activeSessions" :key="session.id" class="session-card">
              <div class="session-header">
                <h4>{{ session.title }}</h4>
                <div class="session-meta">
                  <span class="player-count">{{ session.playerCount }}/{{ session.maxPlayers }} jugadores</span>
                  <span class="turn-number">Turno {{ session.turnNumber }}</span>
                </div>
              </div>
              
              <p class="session-description">{{ session.description }}</p>
              
              <div class="session-stats">
                <div class="stat">
                  <span class="stat-label">Entradas:</span>
                  <span class="stat-value">{{ session.storyLength }}</span>
                </div>
                <div class="stat">
                  <span class="stat-label">Creada:</span>
                  <span class="stat-value">{{ formatDate(session.createdAt) }}</span>
                </div>
              </div>
              
              <!-- Resume or Join button based on player status -->
              <button 
                v-if="isPlayerInSession(session.id)"
                @click="resumeSession(session.id)" 
                :disabled="isJoining"
                class="resume-btn"
              >
                🔄 Reanudar
              </button>
              <button 
                v-else
                @click="joinSession(session.id)" 
                :disabled="session.playerCount >= session.maxPlayers || isJoining"
                class="join-btn"
              >
                {{ session.playerCount >= session.maxPlayers ? 'Llena' : 'Unirse' }}
              </button>
            </div>
          </div>
        </div>
        
        <!-- No active sessions -->
        <div v-else class="no-sessions">
          <div class="no-sessions-icon">📖</div>
          <h3>No hay historias activas</h3>
          <p>Crea la primera historia y comienza la aventura</p>
        </div>
      </div>
    </div>

    <!-- Join Session Modal -->
    <div v-if="showJoinModal" class="modal-overlay" @click="showJoinModal = false">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>👤 Unirse a la Historia</h3>
          <button @click="showJoinModal = false" class="close-btn">✕</button>
        </div>
        
        <div class="modal-body">
          <div class="form-group">
            <label for="playerName">Tu Nombre:</label>
            <input
              id="playerName"
              v-model="joinData.name"
              type="text"
              placeholder="Ej: María"
              maxlength="50"
            />
          </div>
          
          <!-- Character Type Fields -->
          <div v-if="selectedSessionGameType === 'character'">
            <div class="form-group">
              <label for="characterName">Nombre del Personaje:</label>
              <input
                id="characterName"
                v-model="joinData.characterName"
                type="text"
                placeholder="Ej: Aria la Valiente"
                maxlength="50"
              />
            </div>
            
            <div class="form-group">
              <label for="characterClass">Clase del Personaje:</label>
              <select id="characterClass" v-model="joinData.characterClass">
                <option value="Aventurero">🗡️ Aventurero</option>
                <option value="Mago">🔮 Mago</option>
                <option value="Guerrero">⚔️ Guerrero</option>
                <option value="Arquero">🏹 Arquero</option>
                <option value="Hechicero">✨ Hechicero</option>
                <option value="Caballero">🛡️ Caballero</option>
                <option value="Mercader">💰 Mercader</option>
                <option value="Explorador">🗺️ Explorador</option>
              </select>
            </div>
          </div>
          
          <!-- Country Type Fields -->
          <div v-if="selectedSessionGameType === 'country'">
            <div class="form-group">
              <label for="countryName">Nombre del País:</label>
              <input
                id="countryName"
                v-model="joinData.countryName"
                type="text"
                placeholder="Ej: Reino de Eldoria"
                maxlength="50"
              />
            </div>
            
            <div class="form-group">
              <label for="countryType">Tipo de País:</label>
              <select id="countryType" v-model="joinData.countryType">
                <option value="Reino">👑 Reino</option>
                <option value="Imperio">🏛️ Imperio</option>
                <option value="República">⚖️ República</option>
                <option value="Principado">👑 Principado</option>
                <option value="Confederación">🤝 Confederación</option>
                <option value="Ciudad-Estado">🏙️ Ciudad-Estado</option>
                <option value="Tribu">🏹 Tribu</option>
                <option value="Orden">⚔️ Orden</option>
              </select>
            </div>
          </div>
          
          <!-- World Type Fields -->
          <div v-if="selectedSessionGameType === 'world'">
            <div class="form-group">
              <label for="worldRole">Rol en el Mundo:</label>
              <input
                id="worldRole"
                v-model="joinData.worldRole"
                type="text"
                placeholder="Ej: Continente de Atheria"
                maxlength="50"
              />
            </div>
            
            <div class="form-group">
              <label for="worldType">Tipo de Entidad:</label>
              <select id="worldType" v-model="joinData.worldType">
                <option value="Continente">🗺️ Continente</option>
                <option value="Civilización">🏛️ Civilización</option>
                <option value="Reino">👑 Reino</option>
                <option value="Imperio">🏛️ Imperio</option>
                <option value="Federación">🤝 Federación</option>
                <option value="Alianza">⚔️ Alianza</option>
                <option value="Gremio">💰 Gremio</option>
                <option value="Orden">⚔️ Orden</option>
              </select>
            </div>
          </div>
        </div>
        
        <div class="modal-footer">
          <button @click="confirmJoin" :disabled="!canJoin || isJoining" class="confirm-btn">
            <span v-if="!isJoining">🎯 Unirse</span>
            <span v-else class="loading-text">Uniéndose...</span>
          </button>
          <button @click="showJoinModal = false" class="cancel-btn">❌ Cancelar</button>
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
import { ref, computed, onMounted, onUnmounted } from 'vue'

const emit = defineEmits(['session-created', 'session-joined', 'error'])

// Refs
const activeSessions = ref([])
const isCreating = ref(false)
const isJoining = ref(false)
const showJoinModal = ref(false)
const errorMessage = ref('')
const selectedSessionId = ref('')

const newSession = ref({
  title: '',
  description: '',
  maxPlayers: 4,
  genre: 'fantasy',
  gameType: 'character'
})

const joinData = ref({
  name: '',
  characterName: '',
  characterClass: 'Aventurero',
  countryName: '',
  countryType: 'Reino',
  worldRole: '',
  worldType: 'Continente'
})

const selectedSessionGameType = ref('character')

// Computed
const canCreateSession = computed(() => {
  return newSession.value.title.trim().length > 0 &&
         newSession.value.description.trim().length > 0
})

const canJoin = computed(() => {
  const hasName = joinData.value.name.trim().length > 0
  
  if (selectedSessionGameType.value === 'character') {
    return hasName && joinData.value.characterName.trim().length > 0
  } else if (selectedSessionGameType.value === 'country') {
    return hasName && joinData.value.countryName.trim().length > 0
  } else if (selectedSessionGameType.value === 'world') {
    return hasName && joinData.value.worldRole.trim().length > 0
  }
  
  return hasName
})

// Methods
const isPlayerInSession = (sessionId) => {
  try {
    const savedPlayer = localStorage.getItem('cronicas-player')
    const savedSession = localStorage.getItem('cronicas-session')
    
    if (!savedPlayer || !savedSession) return false
    
    const player = JSON.parse(savedPlayer)
    const session = JSON.parse(savedSession)
    
    // Check if the saved session matches this specific session ID and has valid player data
    return session.id === sessionId && player.id && player.name
  } catch (error) {
    console.warn('Error checking player in session:', error)
    // Clear invalid localStorage data
    localStorage.removeItem('cronicas-player')
    localStorage.removeItem('cronicas-session')
    return false
  }
}

const resumeSession = async (sessionId) => {
  try {
    isJoining.value = true
    errorMessage.value = ''
    
    const savedPlayer = localStorage.getItem('cronicas-player')
    const savedSession = localStorage.getItem('cronicas-session')
    
    if (!savedPlayer || !savedSession) {
      throw new Error('No se encontraron datos de sesión guardados')
    }
    
    const player = JSON.parse(savedPlayer)
    const session = JSON.parse(savedSession)
    
    if (session.id !== sessionId) {
      throw new Error('La sesión guardada no coincide')
    }
    
    // Verify the session still exists and player is still in it
    const response = await fetch(`/api/narrative/sessions/${sessionId}`)
    const result = await response.json()
    
    if (!result.success) {
      throw new Error(result.message || 'Sesión no encontrada')
    }
    
    // Check if player is still in the session
    const playerInSession = result.data.players && result.data.players.some(p => p.id === player.id)
    
    if (!playerInSession) {
      // Clear invalid saved data
      localStorage.removeItem('cronicas-player')
      localStorage.removeItem('cronicas-session')
      throw new Error('Ya no eres parte de esta sesión')
    }
    
    // Emit event to resume the session
    emit('session-joined', {
      session: result.data,
      player: player
    })
    
  } catch (error) {
    console.error('Error resuming session:', error)
    errorMessage.value = error.message || 'Error al reanudar la sesión'
    emit('error', error.message)
  } finally {
    isJoining.value = false
  }
}

const createSession = async () => {
  if (!canCreateSession.value) return
  
  try {
    isCreating.value = true
    errorMessage.value = ''
    
    const response = await fetch('/api/narrative/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        title: newSession.value.title.trim(),
        description: newSession.value.description.trim(),
        maxPlayers: parseInt(newSession.value.maxPlayers),
        settings: {
          genre: newSession.value.genre,
          gameType: newSession.value.gameType
        }
      })
    })

    const result = await response.json()
    
    if (!result.success) {
      throw new Error(result.message || 'Error al crear la sesión')
    }

    // Reset form
    newSession.value = {
      title: '',
      description: '',
      maxPlayers: 4,
      genre: 'fantasy',
      gameType: 'character'
    }
    
    // Reload sessions
    await loadActiveSessions()
    
    // Emit event
    emit('session-created', result.data)
    
  } catch (error) {
    console.error('Error creating session:', error)
    errorMessage.value = error.message || 'Error al crear la sesión'
    emit('error', error.message)
  } finally {
    isCreating.value = false
  }
}

const joinSession = (sessionId) => {
  selectedSessionId.value = sessionId
  showJoinModal.value = true
  
  // Find the session to get its game type
  const session = activeSessions.value.find(s => s.id === sessionId)
  selectedSessionGameType.value = session?.settings?.gameType || 'character'
  
  // Reset join data
  joinData.value = {
    name: '',
    characterName: '',
    characterClass: 'Aventurero',
    countryName: '',
    countryType: 'Reino',
    worldRole: '',
    worldType: 'Continente'
  }
}

const confirmJoin = async () => {
  if (!canJoin.value) return
  
  try {
    isJoining.value = true
    errorMessage.value = ''
    
    const response = await fetch(`/api/narrative/sessions/${selectedSessionId.value}/join`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: joinData.value.name.trim(),
        characterName: joinData.value.characterName.trim(),
        characterClass: joinData.value.characterClass,
        countryName: joinData.value.countryName.trim(),
        countryType: joinData.value.countryType,
        worldRole: joinData.value.worldRole.trim(),
        worldType: joinData.value.worldType
      })
    })

    const result = await response.json()
    
    if (!result.success) {
      throw new Error(result.message || 'Error al unirse a la sesión')
    }

    showJoinModal.value = false
    
    // Emit event with session and player data
    emit('session-joined', {
      session: result.data.session,
      player: result.data.player
    })
    
  } catch (error) {
    console.error('Error joining session:', error)
    errorMessage.value = error.message || 'Error al unirse a la sesión'
    emit('error', error.message)
  } finally {
    isJoining.value = false
  }
}

const loadActiveSessions = async () => {
  try {
    const response = await fetch('/api/narrative/sessions')
    
    if (response.status === 429) {
      console.warn('Rate limit exceeded, slowing down polling')
      return
    }
    
    const result = await response.json()
    
    if (result.success) {
      activeSessions.value = result.data
    } else {
      throw new Error(result.message)
    }
  } catch (error) {
    console.error('Error loading sessions:', error)
    errorMessage.value = 'Error al cargar las sesiones'
  }
}

const formatDate = (dateString) => {
  const date = new Date(dateString)
  return date.toLocaleDateString('es-ES', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

const clearError = () => {
  errorMessage.value = ''
}

// Load sessions on mount
let pollInterval = null

onMounted(async () => {
  await loadActiveSessions()
  
  // Set up polling for new sessions
  pollInterval = setInterval(async () => {
    await loadActiveSessions()
  }, 30000) // Poll every 30 seconds
})

// Clean up interval on unmount
onUnmounted(() => {
  if (pollInterval) {
    clearInterval(pollInterval)
  }
})
</script>

<style scoped>
.story-lobby {
  min-height: 100vh;
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  color: white;
  padding: 20px;
}

.lobby-header {
  text-align: center;
  margin-bottom: 40px;
  padding: 40px 20px;
  background: linear-gradient(135deg, #8B4513 0%, #A0522D 100%);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.lobby-header h1 {
  margin: 0;
  font-size: 2.5em;
  color: #F5DEB3;
  text-shadow: 2px 2px 4px rgba(0, 0, 0, 0.5);
}

.subtitle {
  margin: 10px 0 0 0;
  font-size: 1.2em;
  color: #DEB887;
  font-style: italic;
}

.lobby-content {
  max-width: 1200px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 40px;
}

.create-section,
.join-section {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 30px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.create-section h2,
.join-section h2 {
  margin: 0 0 25px 0;
  color: #ecf0f1;
  font-size: 1.5em;
  border-bottom: 2px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 15px;
}

.form-group {
  margin-bottom: 20px;
}

.form-group label {
  display: block;
  margin-bottom: 8px;
  color: #ecf0f1;
  font-weight: bold;
  font-size: 0.95em;
}

.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 12px;
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: white;
  font-size: 1em;
  transition: all 0.3s ease;
}

.form-group input:focus,
.form-group textarea:focus,
.form-group select:focus {
  outline: none;
  border-color: #3498db;
  background: rgba(255, 255, 255, 0.15);
  box-shadow: 0 0 20px rgba(52, 152, 219, 0.3);
}

.form-group input::placeholder,
.form-group textarea::placeholder {
  color: rgba(255, 255, 255, 0.6);
  font-style: italic;
}

.form-group select option {
  background: #2c3e50;
  color: white;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
}

.create-btn {
  width: 100%;
  padding: 15px;
  background: linear-gradient(45deg, #27ae60, #2ecc71);
  color: white;
  border: none;
  border-radius: 8px;
  font-size: 1.1em;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
  margin-top: 10px;
}

.create-btn:hover:not(:disabled) {
  background: linear-gradient(45deg, #2ecc71, #27ae60);
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(39, 174, 96, 0.4);
}

.create-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.loading-text {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
}

.loading-text::after {
  content: '';
  width: 16px;
  height: 16px;
  border: 2px solid transparent;
  border-top: 2px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.sessions-list h3 {
  margin: 0 0 20px 0;
  color: #ecf0f1;
  font-size: 1.2em;
}

.session-cards {
  display: flex;
  flex-direction: column;
  gap: 15px;
}

.session-card {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 8px;
  padding: 20px;
  border-left: 4px solid #3498db;
  transition: all 0.3s ease;
}

.session-card:hover {
  background: rgba(255, 255, 255, 0.12);
  transform: translateY(-2px);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
}

.session-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 10px;
}

.session-header h4 {
  margin: 0;
  color: #ecf0f1;
  font-size: 1.1em;
}

.session-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.player-count {
  font-size: 0.9em;
  color: #3498db;
  font-weight: bold;
}

.turn-number {
  font-size: 0.8em;
  color: #f39c12;
}

.session-description {
  color: #bdc3c7;
  font-size: 0.9em;
  line-height: 1.4;
  margin: 0 0 15px 0;
}

.session-stats {
  display: flex;
  gap: 20px;
  margin-bottom: 15px;
}

.stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.stat-label {
  font-size: 0.8em;
  color: #7f8c8d;
}

.stat-value {
  font-size: 0.9em;
  color: #ecf0f1;
  font-weight: bold;
}

.join-btn {
  width: 100%;
  padding: 10px;
  background: linear-gradient(45deg, #3498db, #2980b9);
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
}

.join-btn:hover:not(:disabled) {
  background: linear-gradient(45deg, #2980b9, #3498db);
  transform: translateY(-1px);
}

.join-btn:disabled {
  background: rgba(231, 76, 60, 0.3);
  color: #e74c3c;
  cursor: not-allowed;
  transform: none;
}

.resume-btn {
  width: 100%;
  padding: 10px;
  background: linear-gradient(45deg, #f39c12, #e67e22);
  color: white;
  border: none;
  border-radius: 6px;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
}

.resume-btn:hover:not(:disabled) {
  background: linear-gradient(45deg, #e67e22, #f39c12);
  transform: translateY(-1px);
  box-shadow: 0 4px 15px rgba(243, 156, 18, 0.4);
}

.resume-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.no-sessions {
  text-align: center;
  padding: 40px 20px;
  color: #bdc3c7;
}

.no-sessions-icon {
  font-size: 3em;
  margin-bottom: 20px;
}

.no-sessions h3 {
  margin: 0 0 10px 0;
  color: #ecf0f1;
}

.no-sessions p {
  margin: 0;
  font-style: italic;
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
  padding: 25px;
  max-width: 500px;
  width: 90%;
  color: white;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 25px;
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

.modal-footer {
  display: flex;
  gap: 15px;
  justify-content: flex-end;
  margin-top: 25px;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.confirm-btn,
.cancel-btn {
  padding: 12px 24px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
  transition: all 0.3s ease;
}

.confirm-btn {
  background: linear-gradient(45deg, #27ae60, #2ecc71);
  color: white;
}

.confirm-btn:hover:not(:disabled) {
  background: linear-gradient(45deg, #2ecc71, #27ae60);
  transform: translateY(-1px);
}

.confirm-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
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

@media (max-width: 768px) {
  .lobby-content {
    grid-template-columns: 1fr;
    gap: 20px;
  }
  
  .form-row {
    grid-template-columns: 1fr;
  }
  
  .session-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 10px;
  }
  
  .session-meta {
    align-items: flex-start;
  }
  
  .session-stats {
    flex-direction: column;
    gap: 10px;
  }
  
  .modal-content {
    width: 95%;
    margin: 20px;
  }
}
</style> 