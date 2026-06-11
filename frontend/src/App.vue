<script setup>
import { ref, onMounted } from 'vue'
import StoryLobby from './components/StoryLobby.vue'
import StorySession from './components/StorySession.vue'

// App state
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

// Methods
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
onMounted(() => {
  // Load any saved session on app start
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

    <!-- Story Lobby -->
    <StoryLobby 
      v-if="currentView === 'lobby'"
      @session-created="handleSessionCreated"
      @session-joined="handleSessionJoined"
      @error="handleError"
    />

    <!-- Story Session -->
    <StorySession 
      v-else-if="currentView === 'session'"
      :session-id="currentSession?.id"
      :current-player-id="currentPlayer?.id"
      @session-ended="handleSessionEnded"
      @error="handleError"
    />
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
