<template>
  <div class="narrative-panel">
    <div class="panel-header">
      <h3>📜 Crónicas del Mundo</h3>
      <div class="panel-controls">
        <button @click="scrollToBottom" class="scroll-btn" title="Ir al final">
          ⬇️
        </button>
        <button @click="toggleAutoScroll" :class="{ active: autoScroll }" class="auto-scroll-btn" title="Auto-scroll">
          {{ autoScroll ? '🔄' : '⏸️' }}
        </button>
        <button @click="clearHistory" class="clear-btn" title="Limpiar historial">
          🗑️
        </button>
      </div>
    </div>

    <div class="narrative-content" ref="narrativeContent">
      <!-- Welcome message -->
      <div v-if="allMessages.length === 0" class="welcome-message">
        <div class="welcome-icon">🌟</div>
        <h4>¡Bienvenido a las Crónicas de Civilización!</h4>
        <p>Aquí se narrarán las épicas aventuras de tu civilización. Cada acción que realices será contada por la IA, creando una historia única de tu imperio.</p>
      </div>

      <!-- Messages -->
      <div v-for="(message, index) in allMessages" :key="index" class="message-item" :class="message.type">
        <div class="message-header">
          <div class="message-icon">{{ getMessageIcon(message.type) }}</div>
          <div class="message-meta">
            <span class="message-type">{{ getMessageTypeLabel(message.type) }}</span>
            <span class="message-time">{{ formatTime(message.timestamp) }}</span>
            <span v-if="message.isWorldEvent" class="world-event-badge">🌍 Evento Mundial</span>
          </div>
        </div>
        <div class="message-content">
          <div v-if="message.type === 'action_result' && message.playerId" class="action-details">
            <strong>{{ getPlayerName(message.playerId) }}:</strong> {{ getActionName(message.action) }}
          </div>
          <div class="message-text" v-html="formatMessageText(message.message)"></div>
          <div v-if="message.effects && message.effects.length > 0" class="message-effects">
            <h5>Efectos:</h5>
            <ul>
              <li v-for="effect in message.effects" :key="effect">{{ effect }}</li>
            </ul>
          </div>
        </div>
      </div>

      <!-- Typing indicator -->
      <div v-if="isTyping" class="typing-indicator">
        <div class="typing-dots">
          <span></span>
          <span></span>
          <span></span>
        </div>
        <span class="typing-text">La IA está generando la narrativa...</span>
      </div>
    </div>

    <!-- Quick actions -->
    <div class="quick-actions">
      <button @click="requestSummary" class="summary-btn" :disabled="allMessages.length === 0">
        📝 Resumen
      </button>
      <button @click="requestPrediction" class="prediction-btn" :disabled="allMessages.length === 0">
        🔮 Predicción
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, defineProps, defineEmits } from 'vue'

const props = defineProps({
  history: {
    type: Array,
    default: () => []
  },
  aiMessages: {
    type: Array,
    default: () => []
  },
  isTyping: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['request-summary', 'request-prediction', 'clear-history'])

// Refs
const narrativeContent = ref(null)
const autoScroll = ref(true)

// Computed
const allMessages = computed(() => {
  const messages = []
  
  // Add history messages
  props.history.forEach(item => {
    if (item.type === 'action') {
      messages.push({
        type: 'action',
        player: item.player,
        action: item.action,
        text: item.description || '',
        timestamp: item.timestamp || new Date(),
        effects: item.effects || []
      })
    } else if (item.type === 'event') {
      messages.push({
        type: 'event',
        text: item.description,
        timestamp: item.timestamp || new Date(),
        effects: item.effects || []
      })
    }
  })
  
  // Add AI messages
  props.aiMessages.forEach(message => {
    messages.push({
      type: 'ai-narrative',
      text: message.text || message.message,
      timestamp: message.timestamp || new Date(),
      effects: message.effects || []
    })
  })
  
  // Add default messages if empty
  if (messages.length === 0 && (props.history.length > 0 || props.aiMessages.length > 0)) {
    messages.push({
      type: 'system',
      text: 'La partida ha comenzado. ¡Que empiece la aventura!',
      timestamp: new Date(),
      effects: []
    })
  }
  
  // Sort by timestamp
  return messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
})

// Methods
const getMessageIcon = (type) => {
  const icons = {
    'action': '⚡',
    'action_result': '🎭',
    'ai-narrative': '🤖',
    'world_event': '🌍',
    'event': '🌟',
    'system': '⚙️',
    'turn': '🔄',
    'turn_change': '🔄',
    'game_end': '🏁',
    'victory': '🏆',
    'defeat': '💀'
  }
  return icons[type] || '📝'
}

const getMessageTypeLabel = (type) => {
  const labels = {
    'action': 'Acción',
    'action_result': 'Resultado',
    'ai-narrative': 'Narrativa IA',
    'world_event': 'Evento Mundial',
    'event': 'Evento',
    'system': 'Sistema',
    'turn': 'Turno',
    'turn_change': 'Cambio de Turno',
    'game_end': 'Fin del Juego',
    'victory': 'Victoria',
    'defeat': 'Derrota'
  }
  return labels[type] || 'Mensaje'
}

const getPlayerName = (playerId) => {
  // This should be passed from parent component or derived from game state
  return `Jugador ${playerId.slice(0, 8)}`
}

const getActionName = (actionType) => {
  const actionNames = {
    'found_city': 'Fundar Ciudad',
    'collect_resources': 'Recolectar Recursos',
    'move_army': 'Mover Ejército',
    'build_infrastructure': 'Construir Infraestructura',
    'diplomacy': 'Diplomacia',
    'free_action': 'Acción Libre'
  }
  return actionNames[actionType] || actionType
}

const formatTime = (timestamp) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('es-ES', { 
    hour: '2-digit', 
    minute: '2-digit' 
  })
}

const formatMessageText = (text) => {
  if (!text) return ''
  
  // Convert markdown-like formatting to HTML
  return text
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br>')
}

const scrollToBottom = () => {
  if (narrativeContent.value) {
    narrativeContent.value.scrollTop = narrativeContent.value.scrollHeight
  }
}

const toggleAutoScroll = () => {
  autoScroll.value = !autoScroll.value
}

const clearHistory = () => {
  emit('clear-history')
}

const requestSummary = () => {
  emit('request-summary')
}

const requestPrediction = () => {
  emit('request-prediction')
}

// Auto-scroll when new messages arrive
watch(allMessages, () => {
  if (autoScroll.value) {
    nextTick(() => {
      scrollToBottom()
    })
  }
}, { deep: true })

// Auto-scroll when typing indicator changes
watch(() => props.isTyping, (newValue) => {
  if (newValue && autoScroll.value) {
    nextTick(() => {
      scrollToBottom()
    })
  }
})

// Initialize
onMounted(() => {
  if (autoScroll.value) {
    scrollToBottom()
  }
})
</script>

<style scoped>
.narrative-panel {
  background: linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%);
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  height: 100%;
  display: flex;
  flex-direction: column;
  color: white;
}

.panel-header {
  background: linear-gradient(135deg, #8B4513 0%, #A0522D 100%);
  padding: 15px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid rgba(255, 255, 255, 0.1);
}

.panel-header h3 {
  margin: 0;
  font-size: 1.2em;
  color: #F5DEB3;
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
  font-size: 0.9em;
  transition: all 0.3s ease;
}

.panel-controls button:hover {
  background: rgba(255, 255, 255, 0.2);
}

.auto-scroll-btn.active {
  background: rgba(46, 204, 113, 0.3);
  border-color: rgba(46, 204, 113, 0.5);
}

.narrative-content {
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

.message-item {
  margin-bottom: 20px;
  padding: 15px;
  border-radius: 8px;
  border-left: 4px solid #3498db;
  background: rgba(255, 255, 255, 0.05);
  transition: all 0.3s ease;
}

.message-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.message-item.action {
  border-left-color: #e74c3c;
}

.message-item.ai-narrative {
  border-left-color: #9b59b6;
  background: rgba(155, 89, 182, 0.1);
}

.message-item.event {
  border-left-color: #f39c12;
}

.message-item.system {
  border-left-color: #95a5a6;
}

.message-item.victory {
  border-left-color: #27ae60;
  background: rgba(39, 174, 96, 0.1);
}

.message-item.defeat {
  border-left-color: #c0392b;
  background: rgba(192, 57, 43, 0.1);
}

.message-item.world_event {
  border-left-color: #3498db;
  background: linear-gradient(135deg, rgba(52, 152, 219, 0.1), rgba(46, 204, 113, 0.1));
  box-shadow: 0 0 20px rgba(52, 152, 219, 0.3);
}

.message-item.action_result {
  border-left-color: #f1c40f;
  background: rgba(241, 196, 15, 0.1);
}

.message-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.message-icon {
  font-size: 1.2em;
  width: 24px;
  text-align: center;
}

.message-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.message-type {
  font-size: 0.9em;
  font-weight: bold;
  color: #ecf0f1;
}

.message-time {
  font-size: 0.8em;
  color: #7f8c8d;
}

.world-event-badge {
  background: linear-gradient(45deg, #3498db, #2ecc71);
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.8em;
  font-weight: bold;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.7; }
  100% { opacity: 1; }
}

.message-content {
  margin-left: 34px;
}

.action-details {
  margin-bottom: 8px;
  color: #e74c3c;
  font-size: 0.95em;
}

.message-text {
  line-height: 1.6;
  color: #bdc3c7;
  margin-bottom: 10px;
}

.message-text :deep(strong) {
  color: #ecf0f1;
}

.message-text :deep(em) {
  color: #f39c12;
}

.message-text :deep(code) {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 4px;
  border-radius: 3px;
  font-family: monospace;
}

.message-effects {
  margin-top: 10px;
  padding: 10px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 4px;
}

.message-effects h5 {
  margin: 0 0 8px 0;
  color: #f39c12;
  font-size: 0.9em;
}

.message-effects ul {
  margin: 0;
  padding-left: 20px;
}

.message-effects li {
  color: #bdc3c7;
  font-size: 0.9em;
  margin-bottom: 3px;
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

.quick-actions {
  background: rgba(0, 0, 0, 0.3);
  padding: 15px 20px;
  display: flex;
  gap: 10px;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.quick-actions button {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9em;
  transition: all 0.3s ease;
}

.quick-actions button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
}

.quick-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.summary-btn:hover:not(:disabled) {
  background: rgba(52, 152, 219, 0.3);
  border-color: rgba(52, 152, 219, 0.5);
}

.prediction-btn:hover:not(:disabled) {
  background: rgba(155, 89, 182, 0.3);
  border-color: rgba(155, 89, 182, 0.5);
}

/* Scrollbar styling */
.narrative-content::-webkit-scrollbar {
  width: 8px;
}

.narrative-content::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

.narrative-content::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 4px;
}

.narrative-content::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}

@media (max-width: 768px) {
  .panel-header {
    flex-direction: column;
    gap: 10px;
  }
  
  .quick-actions {
    flex-direction: column;
  }
  
  .message-content {
    margin-left: 0;
  }
  
  .message-header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style> 