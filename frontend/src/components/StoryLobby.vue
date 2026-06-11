<template>
  <div class="story-lobby">

    <!-- ==================== WAITING ROOM VIEW ==================== -->
    <div v-if="lobbyView === 'waiting'" class="waiting-room-view">
      <div class="lobby-header">
        <h1>📚 Crónicas de Civilización</h1>
        <p class="subtitle">{{ hostedSession?.title }}</p>
      </div>

      <div class="waiting-content">
        <!-- Room Code -->
        <div class="room-code-panel">
          <div class="room-code">
            <p>Comparte este código:</p>
            <strong class="code">{{ hostedSession?.code }}</strong>
            <p class="hint">En el celular: http://{{ lanHint }}:5173 → "Unirse" → código</p>
          </div>
        </div>

        <!-- Player list -->
        <div class="waiting-players-panel">
          <h3>👥 Jugadores ({{ hostedSession?.players?.length || 0 }}/{{ hostedSession?.maxPlayers }})</h3>
          <div class="waiting-players-list">
            <div
              v-for="(player, idx) in hostedSession?.players"
              :key="player.id"
              class="waiting-player-card"
              :class="{ 'is-host': idx === 0 }"
            >
              <span class="player-name-item">{{ player.name }}</span>
              <span v-if="idx === 0" class="host-badge">Anfitrión</span>
            </div>
            <!-- Empty slots -->
            <div
              v-for="n in waitingEmptySlots"
              :key="`empty-${n}`"
              class="waiting-player-card empty-slot"
            >
              <span class="player-name-item">Esperando jugador...</span>
            </div>
          </div>
        </div>

        <!-- Start button -->
        <div class="waiting-actions">
          <div v-if="startError" class="start-error">⚠️ {{ startError }}</div>
          <p v-if="(hostedSession?.players?.length || 0) < 2" class="start-hint">
            Se necesitan al menos 2 jugadores para comenzar.
          </p>
          <button
            @click="startSession"
            :disabled="(hostedSession?.players?.length || 0) < 2 || isStarting"
            class="create-btn"
          >
            <span v-if="!isStarting">🚀 Comenzar</span>
            <span v-else class="loading-text">Iniciando...</span>
          </button>
          <button @click="cancelWaiting" class="cancel-btn" style="margin-top: 10px;">
            ← Volver al lobby
          </button>
        </div>
      </div>
    </div>

    <!-- ==================== NON-HOST WAITING VIEW ==================== -->
    <div v-else-if="lobbyView === 'waiting-guest'" class="waiting-room-view">
      <div class="lobby-header">
        <h1>📚 Crónicas de Civilización</h1>
        <p class="subtitle">{{ guestSession?.title }}</p>
      </div>

      <div class="waiting-content">
        <div class="room-code-panel">
          <div class="room-code">
            <p>Sala unida — código:</p>
            <strong class="code">{{ guestSession?.code }}</strong>
            <p class="hint">Esperando que el anfitrión comience la partida...</p>
          </div>
        </div>

        <div class="waiting-players-panel">
          <h3>👥 Jugadores ({{ guestSession?.players?.length || 0 }}/{{ guestSession?.maxPlayers }})</h3>
          <div class="waiting-players-list">
            <div
              v-for="(player, idx) in guestSession?.players"
              :key="player.id"
              class="waiting-player-card"
              :class="{ 'is-host': idx === 0, 'is-me': player.id === guestPlayer?.id }"
            >
              <span class="player-name-item">{{ player.name }}</span>
              <span v-if="idx === 0" class="host-badge">Anfitrión</span>
              <span v-if="player.id === guestPlayer?.id" class="you-badge">Tú</span>
            </div>
            <div
              v-for="n in guestEmptySlots"
              :key="`empty-${n}`"
              class="waiting-player-card empty-slot"
            >
              <span class="player-name-item">Esperando jugador...</span>
            </div>
          </div>
        </div>

        <div class="waiting-actions">
          <p class="start-hint">El anfitrión iniciará la partida cuando todos estén listos.</p>
          <button @click="cancelGuestWaiting" class="cancel-btn" style="margin-top: 10px;">
            ← Volver al lobby
          </button>
        </div>
      </div>
    </div>

    <!-- ==================== MAIN LOBBY VIEW ==================== -->
    <div v-else>
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
              <label for="hostNameInput">Tu nombre:</label>
              <input
                id="hostNameInput"
                v-model="hostName"
                type="text"
                placeholder="¿Cómo te llamas?"
                maxlength="30"
              />
            </div>

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
                <select id="genre" v-model="newSession.settings.genre">
                  <option value="fantasy">Fantasía</option>
                  <option value="historical">Histórico</option>
                  <option value="sci-fi">Ciencia Ficción</option>
                  <option value="mystery">Misterio</option>
                </select>
              </div>

              <div class="form-group">
                <label for="language">Idioma de la narración</label>
                <select id="language" v-model="newSession.settings.language">
                  <option value="es">Español</option>
                  <option value="pt">Português</option>
                </select>
              </div>
            </div>

            <div class="form-group">
              <label for="mode">Estilo de narración</label>
              <select id="mode" v-model="newSession.settings.mode">
                <option value="narrador-activo">🎭 Narrador Activo — la IA propone, ustedes reaccionan</option>
                <option value="colaborativo">✍️ Colaborativo — ustedes proponen, la IA integra</option>
              </select>
            </div>
            <div class="form-group">
              <label for="duration">Duración</label>
              <select id="duration" v-model="newSession.settings.maxRounds">
                <option :value="null">Libre — el anfitrión decide cuándo terminar</option>
                <option :value="8">Corta — 8 rondas</option>
                <option :value="15">Media — 15 rondas</option>
              </select>
            </div>

            <button @click="createSession" :disabled="!canCreateSession || isCreating" class="create-btn">
              <span v-if="!isCreating">🚀 Crear Historia</span>
              <span v-else class="loading-text">Creando...</span>
            </button>
          </div>
        </div>

        <!-- Join Section -->
        <div class="join-section">
          <h2>👥 Unirse a una Historia</h2>

          <!-- Join by code -->
          <div class="join-by-code">
            <h3>Unirse por código</h3>
            <div class="form-group">
              <label for="joinCode">Código de sala (5 letras):</label>
              <input
                id="joinCode"
                v-model="joinCode"
                type="text"
                placeholder="ABCDE"
                maxlength="5"
                @input="joinCode = joinCode.toUpperCase()"
                class="code-input"
              />
            </div>
            <div class="form-group">
              <label for="playerName">Tu nombre:</label>
              <input
                id="playerName"
                v-model="joinName"
                type="text"
                placeholder="Ej: María"
                maxlength="50"
              />
            </div>
            <div v-if="joinError" class="join-error">⚠️ {{ joinError }}</div>
            <button
              @click="joinByCode"
              :disabled="!canJoinByCode || isJoining"
              class="create-btn"
            >
              <span v-if="!isJoining">🎯 Unirse</span>
              <span v-else class="loading-text">Uniéndose...</span>
            </button>
          </div>

          <!-- Active Sessions (secondary display) -->
          <div v-if="activeSessions.length > 0" class="sessions-list">
            <h3>Historias activas</h3>
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
                <button
                  v-if="isPlayerInSession(session.id)"
                  @click="resumeSession(session.id)"
                  :disabled="isJoining"
                  class="resume-btn"
                >
                  🔄 Reanudar
                </button>
              </div>
            </div>
          </div>

          <!-- No active sessions -->
          <div v-else class="no-sessions">
            <div class="no-sessions-icon">📖</div>
            <h3>No hay historias activas</h3>
            <p>Crea la primera historia o únete con un código</p>
          </div>
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

// ── view state ──────────────────────────────────────────────────────────────
// 'lobby' | 'waiting' (host) | 'waiting-guest' (non-host)
const lobbyView = ref('lobby')

// ── shared refs ──────────────────────────────────────────────────────────────
const activeSessions = ref([])
const isCreating = ref(false)
const isJoining = ref(false)
const isStarting = ref(false)
const errorMessage = ref('')

// ── create form ──────────────────────────────────────────────────────────────
const hostName = ref('')

const newSession = ref({
  title: '',
  description: '',
  maxPlayers: 4,
  settings: {
    genre: 'fantasy',
    language: 'es',
    mode: 'narrador-activo',
    maxRounds: null
  }
})

// ── host waiting room ─────────────────────────────────────────────────────────
const hostedSession = ref(null)   // session object returned by POST /sessions
const hostedPlayer = ref(null)    // host player (from join after create)
const startError = ref('')

// ── guest waiting room ────────────────────────────────────────────────────────
const guestSession = ref(null)
const guestPlayer = ref(null)

// ── join by code ──────────────────────────────────────────────────────────────
const joinCode = ref('')
const joinName = ref('')
const joinError = ref('')

// ── LAN hint ─────────────────────────────────────────────────────────────────
const lanHint = window.location.hostname

// ── polling ───────────────────────────────────────────────────────────────────
let pollInterval = null
let waitingPollInterval = null
let waitingPollFailures = 0
const WAITING_POLL_MAX_FAILURES = 5

// ── computed ─────────────────────────────────────────────────────────────────
const canCreateSession = computed(() =>
  hostName.value.trim().length > 0 &&
  newSession.value.title.trim().length > 0
)

const canJoinByCode = computed(() =>
  joinCode.value.trim().length === 5 && joinName.value.trim().length > 0
)

const waitingEmptySlots = computed(() => {
  const current = hostedSession.value?.players?.length || 0
  const max = hostedSession.value?.maxPlayers || 4
  return Math.max(0, max - current)
})

const guestEmptySlots = computed(() => {
  const current = guestSession.value?.players?.length || 0
  const max = guestSession.value?.maxPlayers || 4
  return Math.max(0, max - current)
})

// ── helpers ───────────────────────────────────────────────────────────────────
const isPlayerInSession = (sessionId) => {
  try {
    const savedPlayer = localStorage.getItem('cronicas-player')
    const savedSession = localStorage.getItem('cronicas-session')
    if (!savedPlayer || !savedSession) return false
    const player = JSON.parse(savedPlayer)
    const session = JSON.parse(savedSession)
    return session.id === sessionId && player.id && player.name
  } catch {
    localStorage.removeItem('cronicas-player')
    localStorage.removeItem('cronicas-session')
    return false
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

const clearError = () => { errorMessage.value = '' }

// ── poll helpers ──────────────────────────────────────────────────────────────
const stopWaitingPoll = () => {
  if (waitingPollInterval) {
    clearInterval(waitingPollInterval)
    waitingPollInterval = null
  }
}

// ── create session ────────────────────────────────────────────────────────────
const createSession = async () => {
  if (!canCreateSession.value) return

  try {
    isCreating.value = true
    errorMessage.value = ''

    const response = await fetch('/api/narrative/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: newSession.value.title.trim(),
        description: newSession.value.description.trim(),
        maxPlayers: parseInt(newSession.value.maxPlayers),
        settings: {
          genre: newSession.value.settings.genre,
          language: newSession.value.settings.language,
          mode: newSession.value.settings.mode,
          maxRounds: newSession.value.settings.maxRounds
        }
      })
    })

    const result = await response.json()
    if (!result.success) throw new Error(result.message || 'Error al crear la sesión')

    const createdSession = result.data

    // Auto-join the creator as host
    const joinResponse = await fetch(`/api/narrative/sessions/${createdSession.id}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: hostName.value.trim() })
    })
    const joinResult = await joinResponse.json()

    // I5: if auto-join failed, surface a clear error and stay in lobby
    if (!joinResult.success) {
      errorMessage.value = `La sala se creó pero no pudiste entrar — intenta unirte con el código ${createdSession.code}`
      emit('error', errorMessage.value)
      return
    }

    // Auto-join succeeded — refresh session to get updated players list
    const refreshed = await fetchSession(createdSession.id)
    hostedSession.value = refreshed || createdSession
    hostedPlayer.value = joinResult.data.player

    // Save to localStorage
    localStorage.setItem('cronicas-session', JSON.stringify(hostedSession.value))
    localStorage.setItem('cronicas-player', JSON.stringify(hostedPlayer.value))

    // Reset form
    hostName.value = ''
    newSession.value = {
      title: '',
      description: '',
      maxPlayers: 4,
      settings: { genre: 'fantasy', language: 'es', mode: 'narrador-activo', maxRounds: null }
    }

    lobbyView.value = 'waiting'
    startWaitingPoll('host')
    emit('session-created', createdSession)

  } catch (error) {
    console.error('Error creating session:', error)
    errorMessage.value = error.message || 'Error al crear la sesión'
    emit('error', error.message)
  } finally {
    isCreating.value = false
  }
}

// ── fetch single session ──────────────────────────────────────────────────────
const fetchSession = async (sessionId) => {
  try {
    const response = await fetch(`/api/narrative/sessions/${sessionId}`)
    // 429 in the waiting room: don't count as a failure, just skip this tick
    if (response.status === 429) return 'rate-limited'
    const result = await response.json()
    return result.success ? result.data : null
  } catch {
    return null
  }
}

// ── poll waiting room ─────────────────────────────────────────────────────────
const startWaitingPoll = (role) => {
  stopWaitingPoll()
  waitingPollFailures = 0
  waitingPollInterval = setInterval(async () => {
    if (role === 'host' && hostedSession.value) {
      const updated = await fetchSession(hostedSession.value.id)
      if (updated === 'rate-limited') return  // skip tick, don't count as failure
      if (updated) {
        waitingPollFailures = 0
        hostedSession.value = updated
      } else {
        waitingPollFailures++
        if (waitingPollFailures >= WAITING_POLL_MAX_FAILURES) {
          stopWaitingPoll()
          errorMessage.value = 'Se perdió la conexión con la sala'
          hostedSession.value = null
          hostedPlayer.value = null
          startError.value = ''
          lobbyView.value = 'lobby'
        }
      }
    } else if (role === 'guest' && guestSession.value) {
      const updated = await fetchSession(guestSession.value.id)
      if (updated === 'rate-limited') return  // skip tick, don't count as failure
      if (updated) {
        waitingPollFailures = 0
        guestSession.value = updated
        // Auto-navigate when host starts the session
        if (updated.isActive) {
          stopWaitingPoll()
          localStorage.setItem('cronicas-session', JSON.stringify(updated))
          emit('session-joined', { session: updated, player: guestPlayer.value })
        }
      } else {
        waitingPollFailures++
        if (waitingPollFailures >= WAITING_POLL_MAX_FAILURES) {
          stopWaitingPoll()
          errorMessage.value = 'Se perdió la conexión con la sala'
          guestSession.value = null
          guestPlayer.value = null
          lobbyView.value = 'lobby'
        }
      }
    }
  }, 3000)
}

// ── start session (host) ──────────────────────────────────────────────────────
const startSession = async () => {
  if ((hostedSession.value?.players?.length || 0) < 2) return

  try {
    isStarting.value = true
    startError.value = ''

    const response = await fetch(`/api/narrative/sessions/${hostedSession.value.id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    })
    const result = await response.json()

    if (!result.success) {
      startError.value = result.message || 'No se pudo iniciar la sesión'
      return
    }

    stopWaitingPoll()
    const updated = result.data?.session || hostedSession.value
    localStorage.setItem('cronicas-session', JSON.stringify(updated))
    emit('session-joined', { session: updated, player: hostedPlayer.value })

  } catch (error) {
    console.error('Error starting session:', error)
    startError.value = error.message || 'Error al iniciar la sesión'
  } finally {
    isStarting.value = false
  }
}

// ── cancel waiting (go back to lobby) ─────────────────────────────────────────
const cancelWaiting = () => {
  stopWaitingPoll()
  hostedSession.value = null
  hostedPlayer.value = null
  startError.value = ''
  lobbyView.value = 'lobby'
}

// ── cancel guest waiting (go back to lobby) ───────────────────────────────────
const cancelGuestWaiting = () => {
  stopWaitingPoll()
  guestSession.value = null
  guestPlayer.value = null
  localStorage.removeItem('cronicas-session')
  localStorage.removeItem('cronicas-player')
  lobbyView.value = 'lobby'
}

// ── join by code ──────────────────────────────────────────────────────────────
const joinByCode = async () => {
  if (!canJoinByCode.value) return

  try {
    isJoining.value = true
    joinError.value = ''

    // Step 1: look up session by code
    const lookupResponse = await fetch(`/api/narrative/sessions/code/${joinCode.value.trim()}`)
    if (lookupResponse.status === 404) {
      joinError.value = 'Sala no encontrada'
      return
    }
    if (lookupResponse.status === 429) {
      joinError.value = 'El servidor está ocupado — espera unos segundos y reintenta'
      return
    }
    if (!lookupResponse.ok) {
      joinError.value = 'No se pudo conectar — reintenta'
      return
    }
    const lookupResult = await lookupResponse.json()
    if (!lookupResult.success) {
      joinError.value = lookupResult.message || 'No se pudo conectar — reintenta'
      return
    }
    const foundSession = lookupResult.data

    // Step 2: join
    const joinResponse = await fetch(`/api/narrative/sessions/${foundSession.id}/join`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: joinName.value.trim() })
    })
    const joinResult = await joinResponse.json()

    if (!joinResult.success) {
      joinError.value = joinResult.message || 'Error al unirse'
      return
    }

    const player = joinResult.data.player
    const session = joinResult.data.session || foundSession

    // Step 3: persist to localStorage
    localStorage.setItem('cronicas-session', JSON.stringify(session))
    localStorage.setItem('cronicas-player', JSON.stringify(player))

    // Step 4: go to guest waiting room (poll until isActive)
    guestSession.value = session
    guestPlayer.value = player
    joinCode.value = ''
    joinName.value = ''

    if (session.isActive) {
      // Session already active — go straight to story
      emit('session-joined', { session, player })
    } else {
      lobbyView.value = 'waiting-guest'
      startWaitingPoll('guest')
    }

  } catch (error) {
    console.error('Error joining by code:', error)
    joinError.value = error.message || 'Error al unirse'
  } finally {
    isJoining.value = false
  }
}

// ── resume existing session ───────────────────────────────────────────────────
const resumeSession = async (sessionId) => {
  try {
    isJoining.value = true
    errorMessage.value = ''

    const savedPlayer = localStorage.getItem('cronicas-player')
    const savedSession = localStorage.getItem('cronicas-session')
    if (!savedPlayer || !savedSession) throw new Error('No se encontraron datos de sesión guardados')

    const player = JSON.parse(savedPlayer)
    const session = JSON.parse(savedSession)
    if (session.id !== sessionId) throw new Error('La sesión guardada no coincide')

    const response = await fetch(`/api/narrative/sessions/${sessionId}`)
    const result = await response.json()
    if (!result.success) throw new Error(result.message || 'Sesión no encontrada')

    const playerInSession = result.data.players?.some(p => p.id === player.id)
    if (!playerInSession) {
      localStorage.removeItem('cronicas-player')
      localStorage.removeItem('cronicas-session')
      throw new Error('Ya no eres parte de esta sesión')
    }

    emit('session-joined', { session: result.data, player })

  } catch (error) {
    console.error('Error resuming session:', error)
    errorMessage.value = error.message || 'Error al reanudar la sesión'
    emit('error', error.message)
  } finally {
    isJoining.value = false
  }
}

// ── load active sessions (lobby list) ────────────────────────────────────────
const loadActiveSessions = async () => {
  try {
    const response = await fetch('/api/narrative/sessions')
    if (response.status === 429) return
    const result = await response.json()
    if (result.success) activeSessions.value = result.data
  } catch (error) {
    console.error('Error loading sessions:', error)
  }
}

// ── lifecycle ─────────────────────────────────────────────────────────────────
onMounted(async () => {
  await loadActiveSessions()
  pollInterval = setInterval(loadActiveSessions, 30000)
})

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval)
  stopWaitingPoll()
})
</script>

<style scoped>
.story-lobby {
  min-height: 100vh;
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  color: white;
  padding: 20px;
}

/* ── header ───────────────────────────────────────────────────── */
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

/* ── lobby layout ─────────────────────────────────────────────── */
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

/* ── form elements ────────────────────────────────────────────── */
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
  font-size: 16px; /* prevents iOS/Android zoom-on-focus */
  transition: all 0.3s ease;
  box-sizing: border-box;
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
  grid-template-columns: 1fr 1fr 1fr;
  gap: 20px;
}

/* code input bigger */
.code-input {
  text-transform: uppercase;
  letter-spacing: 0.3em;
  font-size: 1.4em !important;
  font-weight: bold;
  text-align: center;
}

/* ── buttons ──────────────────────────────────────────────────── */
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

.cancel-btn {
  width: 100%;
  padding: 12px;
  background: rgba(255, 255, 255, 0.1);
  color: #bdc3c7;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  font-size: 1em;
  cursor: pointer;
  transition: all 0.3s ease;
}

.cancel-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: white;
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

/* ── join section ─────────────────────────────────────────────── */
.join-by-code {
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  padding: 20px;
  margin-bottom: 25px;
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.join-by-code h3 {
  margin: 0 0 18px 0;
  color: #ecf0f1;
  font-size: 1.1em;
}

.join-error,
.start-error {
  color: #e74c3c;
  background: rgba(231, 76, 60, 0.1);
  border: 1px solid rgba(231, 76, 60, 0.3);
  border-radius: 6px;
  padding: 10px 14px;
  margin-bottom: 10px;
  font-size: 0.95em;
}

/* ── sessions list ────────────────────────────────────────────── */
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

.stat-label { font-size: 0.8em; color: #7f8c8d; }
.stat-value { font-size: 0.9em; color: #ecf0f1; font-weight: bold; }

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

.no-sessions-icon { font-size: 3em; margin-bottom: 20px; }
.no-sessions h3 { margin: 0 0 10px 0; color: #ecf0f1; }
.no-sessions p { margin: 0; font-style: italic; }

/* ── waiting room ─────────────────────────────────────────────── */
.waiting-room-view {
  min-height: 100vh;
}

.waiting-content {
  max-width: 700px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 30px;
}

.room-code-panel,
.waiting-players-panel {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 30px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.room-code {
  text-align: center;
}

.room-code p {
  margin: 0 0 12px 0;
  color: #bdc3c7;
  font-size: 1em;
}

.room-code .code {
  display: block;
  font-size: 3.5em;
  font-weight: 900;
  letter-spacing: 0.25em;
  color: #F5DEB3;
  text-shadow: 0 0 30px rgba(245, 222, 179, 0.4);
  margin: 10px 0;
}

.room-code .hint {
  margin: 14px 0 0 0;
  color: #7f8c8d;
  font-size: 0.85em;
  font-style: italic;
}

.waiting-players-panel h3 {
  margin: 0 0 20px 0;
  color: #ecf0f1;
  font-size: 1.2em;
  border-bottom: 2px solid rgba(255, 255, 255, 0.1);
  padding-bottom: 12px;
}

.waiting-players-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.waiting-player-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.07);
  border-radius: 8px;
  border-left: 3px solid #3498db;
}

.waiting-player-card.is-host {
  border-left-color: #f39c12;
}

.waiting-player-card.is-me {
  border-left-color: #2ecc71;
}

.waiting-player-card.empty-slot {
  opacity: 0.4;
  border-style: dashed;
  border-left-color: rgba(255, 255, 255, 0.2);
}

.player-name-item {
  flex: 1;
  color: #ecf0f1;
  font-size: 1em;
}

.waiting-player-card.empty-slot .player-name-item {
  font-style: italic;
  color: #7f8c8d;
}

.host-badge {
  background: rgba(243, 156, 18, 0.2);
  color: #f39c12;
  border: 1px solid rgba(243, 156, 18, 0.4);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 0.8em;
  font-weight: bold;
}

.you-badge {
  background: rgba(46, 204, 113, 0.2);
  color: #2ecc71;
  border: 1px solid rgba(46, 204, 113, 0.4);
  border-radius: 4px;
  padding: 2px 8px;
  font-size: 0.8em;
  font-weight: bold;
}

.waiting-actions {
  background: rgba(255, 255, 255, 0.05);
  border-radius: 12px;
  padding: 25px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
}

.start-hint {
  color: #bdc3c7;
  font-size: 0.9em;
  font-style: italic;
  margin-bottom: 12px;
  text-align: center;
}

/* ── error toast ──────────────────────────────────────────────── */
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
  from { transform: translateX(100%); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
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

/* ── responsive ───────────────────────────────────────────────── */
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

  .session-meta { align-items: flex-start; }
  .session-stats { flex-direction: column; gap: 10px; }

  .room-code .code { font-size: 2.5em; }
}
</style>
