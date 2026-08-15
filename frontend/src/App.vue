<script setup>
import { ref, onMounted } from 'vue'
import StoryLobby from './components/StoryLobby.vue'
import StorySession from './components/StorySession.vue'
import ModeSelect from './components/mapa/ModeSelect.vue'
import MapLobby from './components/mapa/MapLobby.vue'
import MapSession from './components/mapa/MapSession.vue'
import { useMapApi } from './composables/useMapApi.js'

// App state
const currentMode = ref(null) // null | 'narrativo' | 'mapa'
const currentView = ref('lobby') // 'lobby' or 'session'
const currentSession = ref(null)
const currentPlayer = ref(null)
const errorMessage = ref('')

// Validate and load saved session
const loadSavedSession = async () => {
  try {
    const savedSession = localStorage.getItem('cronicas-session')
    const savedPlayer = localStorage.getItem('cronicas-player')
    
    if (savedSession && savedPlayer) {
      const session = JSON.parse(savedSession)
      const player = JSON.parse(savedPlayer)
      
      // Validate that the session still exists and is active
      const response = await fetch(`/api/narrative/sessions/${session.id}`)
      const result = await response.json()
      
      if (result.success && result.data.isActive) {
        // Check if player is still in the session
        const playerInSession = result.data.players && result.data.players.some(p => p.id === player.id)
        
        if (playerInSession) {
          currentSession.value = result.data // Use updated session data
          currentPlayer.value = player
          currentMode.value = 'narrativo'
          currentView.value = 'session'
          return
        }
      }
      
      // Session invalid, clear saved data
      clearSavedSession()
    }
  } catch (error) {
    console.warn('Error loading saved session:', error)
    clearSavedSession()
  }
}

// Save session/player to localStorage
const saveSession = (session, player) => {
  try {
    localStorage.setItem('cronicas-session', JSON.stringify(session))
    localStorage.setItem('cronicas-player', JSON.stringify(player))
  } catch (error) {
    console.warn('Error saving session:', error)
  }
}

// Clear saved session
const clearSavedSession = () => {
  localStorage.removeItem('cronicas-session')
  localStorage.removeItem('cronicas-player')
}

// --- Restaurar sesion de mapa guardada -----------------------------------
// MapSession.vue guarda estas 4 claves en cada onMounted (ver guardarSesion),
// pero hasta ahora nadie las leia: un F5 a mitad de partida dejaba al
// jugador varado, porque el token solo se emite una vez al unirse y unirse
// de nuevo a una partida ya iniciada se rechaza (PARTIDA_YA_INICIADA). Aca
// se intenta re-entrar con las credenciales guardadas; si la partida ya no
// existe o el token ya no es valido, se limpia la sesion guardada y se
// vuelve al inicio en vez de dejar una pantalla rota.
const { vista: pedirVistaMapa } = useMapApi()

const limpiarSesionMapaGuardada = () => {
  localStorage.removeItem('cronicas-mapa-id')
  localStorage.removeItem('cronicas-mapa-codigo')
  localStorage.removeItem('cronicas-mapa-jugadorId')
  localStorage.removeItem('cronicas-mapa-token')
}

const loadSavedMapSession = async () => {
  const id = localStorage.getItem('cronicas-mapa-id')
  const codigo = localStorage.getItem('cronicas-mapa-codigo')
  const jugadorId = localStorage.getItem('cronicas-mapa-jugadorId')
  const token = localStorage.getItem('cronicas-mapa-token')

  if (!id || !codigo || !jugadorId || !token) return false

  try {
    const vista = await pedirVistaMapa(id, jugadorId, token)
    mapaPartida.value = { id, codigo, jugadorId, token, vista }
    currentMode.value = 'mapa'
    return true
  } catch (error) {
    // Partida inexistente (404) o token invalido: no hay forma de recuperar
    // la sesion, asi que se limpia y el jugador vuelve al selector de modo.
    console.warn('No se pudo restaurar la sesion de mapa guardada:', error)
    limpiarSesionMapaGuardada()
    return false
  }
}

// Methods
const elegirModo = (modo) => {
  currentMode.value = modo
}

// Map mode state
const mapaPartida = ref(null) // { id, codigo, jugadorId, token, vista } | null

const handlePartidaUnida = (datos) => {
  mapaPartida.value = datos
}

const handleSessionCreated = (sessionData) => {
  // Session created successfully
  // For now, just show success message
  // In a real app, you might want to auto-join the creator
}

const handleSessionJoined = (data) => {
  currentSession.value = data.session
  currentPlayer.value = data.player
  currentView.value = 'session'
  
  // Save to localStorage for persistence across reloads
  saveSession(data.session, data.player)
}

const handleSessionEnded = (sessionData) => {
  currentSession.value = null
  currentPlayer.value = null
  currentView.value = 'lobby'
  
  // Clear saved session
  clearSavedSession()
}

const handleError = (error) => {
  errorMessage.value = error
}

const clearError = () => {
  errorMessage.value = ''
}

// Lifecycle
onMounted(async () => {
  // Se intenta primero restaurar una sesion de mapa guardada; si no hay
  // ninguna (o no se pudo restaurar), se cae al intento de sesion narrativa,
  // igual que antes.
  const restauroMapa = await loadSavedMapSession()
  if (restauroMapa) return
  loadSavedSession()
})
</script>

<template>
  <div id="app" class="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900">
    <!-- Error Toast -->
    <div v-if="errorMessage" class="error-toast">
      <div class="error-icon">⚠️</div>
      <span>{{ errorMessage }}</span>
      <button @click="clearError" class="close-error">✕</button>
    </div>

    <!-- Mode selection -->
    <ModeSelect
      v-if="currentMode === null"
      @elegir-modo="elegirModo"
    />

    <!-- Narrative mode -->
    <template v-else-if="currentMode === 'narrativo'">
      <StoryLobby
        v-if="currentView === 'lobby'"
        @session-created="handleSessionCreated"
        @session-joined="handleSessionJoined"
        @error="handleError"
      />

      <StorySession
        v-else-if="currentView === 'session'"
        :session-id="currentSession?.id"
        :current-player-id="currentPlayer?.id"
        @session-ended="handleSessionEnded"
        @error="handleError"
      />
    </template>

    <!-- Map mode -->
    <template v-else-if="currentMode === 'mapa'">
      <MapLobby
        v-if="!mapaPartida"
        @partida-unida="handlePartidaUnida"
      />
      <MapSession
        v-else
        :partida-inicial="mapaPartida"
        @error="handleError"
        @salir="mapaPartida = null"
      />
    </template>
  </div>
</template>

<style>
/* Global styles */
* {
  box-sizing: border-box;
}

body {
  margin: 0;
  font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

#app {
  min-height: 100vh;
}

/* Placeholder shown while a mode's real view is not mounted yet */
.loading-placeholder {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #bdc3c7;
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
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
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
  border-radius: 50%;
  transition: all 0.3s ease;
}

.close-error:hover {
  background: rgba(255, 255, 255, 0.2);
}

/* Scrollbar styling */
::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}

/* Responsive design */
@media (max-width: 768px) {
  .error-toast {
    left: 20px;
    right: 20px;
    top: 20px;
  }
}
</style>
