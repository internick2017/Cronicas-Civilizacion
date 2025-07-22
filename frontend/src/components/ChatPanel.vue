<template>
  <div class="chat-panel" :class="{ collapsed: isCollapsed }">
    <div class="chat-header" @click="toggleCollapse">
      <div class="header-content">
        <h4>💬 Chat</h4>
        <div class="online-count">
          <span class="online-dot"></span>
          {{ onlineCount }} jugadores
        </div>
      </div>
      <button class="collapse-btn">
        {{ isCollapsed ? '▲' : '▼' }}
      </button>
    </div>

    <div class="chat-content" v-show="!isCollapsed">
      <div class="messages-container" ref="messagesContainer">
        <div v-if="messages.length === 0" class="empty-message">
          <div class="empty-icon">💭</div>
          <p>No hay mensajes aún. ¡Sé el primero en escribir!</p>
        </div>

        <div v-for="(message, index) in messages" :key="index" class="message-item" :class="getMessageClass(message)">
          <div class="message-header">
            <span class="message-author" :style="{ color: getPlayerColor(message.playerId) }">
              {{ message.playerName }}
            </span>
            <span class="message-time">{{ formatTime(message.timestamp) }}</span>
          </div>
          <div class="message-content">
            <div class="message-text">{{ message.text }}</div>
            <div v-if="message.type === 'system'" class="system-badge">Sistema</div>
            <div v-if="message.type === 'whisper'" class="whisper-badge">Privado</div>
          </div>
        </div>

        <div v-if="typingUsers.length > 0" class="typing-indicator">
          <div class="typing-dots">
            <span></span>
            <span></span>
            <span></span>
          </div>
          <span class="typing-text">
            {{ getTypingText() }}
          </span>
        </div>
      </div>

      <div class="chat-input-container">
        <div class="input-controls">
          <select v-model="messageType" class="message-type-select">
            <option value="public">📢 Público</option>
            <option value="team">👥 Equipo</option>
            <option value="whisper">🤫 Privado</option>
          </select>
          
          <select v-if="messageType === 'whisper'" v-model="whisperTarget" class="whisper-target-select">
            <option value="">Seleccionar jugador...</option>
            <option v-for="player in otherPlayers" :key="player.id" :value="player.id">
              {{ player.name }}
            </option>
          </select>
        </div>

        <div class="input-row">
          <input
            v-model="currentMessage"
            @keyup.enter="sendMessage"
            @keyup="handleTyping"
            @focus="handleFocus"
            @blur="handleBlur"
            placeholder="Escribe un mensaje..."
            class="message-input"
            :disabled="!canSendMessage"
          />
          <button @click="sendMessage" :disabled="!canSendMessage" class="send-btn">
            📤
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onMounted, onUnmounted, defineProps, defineEmits } from 'vue'

const props = defineProps({
  messages: {
    type: Array,
    default: () => []
  },
  currentPlayerId: {
    type: String,
    default: ''
  },
  players: {
    type: Array,
    default: () => []
  },
  isGameActive: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['send-message', 'typing-start', 'typing-stop'])

// State
const isCollapsed = ref(false)
const currentMessage = ref('')
const messageType = ref('public')
const whisperTarget = ref('')
const typingUsers = ref([])
const isTyping = ref(false)
const typingTimeout = ref(null)
const messagesContainer = ref(null)

// Player colors for consistent styling
const playerColors = ref(new Map())
const availableColors = [
  '#e74c3c', '#3498db', '#2ecc71', '#f39c12', 
  '#9b59b6', '#1abc9c', '#e67e22', '#34495e'
]

// Computed
const onlineCount = computed(() => {
  return props.players.filter(p => p.isOnline).length
})

const otherPlayers = computed(() => {
  return props.players.filter(p => p.id !== props.currentPlayerId)
})

const canSendMessage = computed(() => {
  const hasMessage = currentMessage.value.trim().length > 0
  const hasTarget = messageType.value !== 'whisper' || whisperTarget.value
  return hasMessage && hasTarget && props.isGameActive
})

// Methods
const getPlayerColor = (playerId) => {
  if (!playerColors.value.has(playerId)) {
    const colorIndex = playerColors.value.size % availableColors.length
    playerColors.value.set(playerId, availableColors[colorIndex])
  }
  return playerColors.value.get(playerId)
}

const getMessageClass = (message) => {
  const classes = []
  
  if (message.type === 'system') {
    classes.push('system-message')
  } else if (message.type === 'whisper') {
    classes.push('whisper-message')
  } else if (message.type === 'team') {
    classes.push('team-message')
  }
  
  if (message.playerId === props.currentPlayerId) {
    classes.push('own-message')
  }
  
  return classes.join(' ')
}

const formatTime = (timestamp) => {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('es-ES', { 
    hour: '2-digit', 
    minute: '2-digit' 
  })
}

const getTypingText = () => {
  if (typingUsers.value.length === 1) {
    return `${typingUsers.value[0]} está escribiendo...`
  } else if (typingUsers.value.length === 2) {
    return `${typingUsers.value[0]} y ${typingUsers.value[1]} están escribiendo...`
  } else if (typingUsers.value.length > 2) {
    return `${typingUsers.value.length} personas están escribiendo...`
  }
  return ''
}

const toggleCollapse = () => {
  isCollapsed.value = !isCollapsed.value
  if (!isCollapsed.value) {
    nextTick(() => {
      scrollToBottom()
    })
  }
}

const sendMessage = () => {
  if (!canSendMessage.value) return

  const messageData = {
    text: currentMessage.value.trim(),
    type: messageType.value,
    timestamp: new Date(),
    playerId: props.currentPlayerId
  }

  if (messageType.value === 'whisper') {
    messageData.targetPlayerId = whisperTarget.value
  }

  emit('send-message', messageData)
  
  // Clear input
  currentMessage.value = ''
  
  // Reset whisper target if it was a whisper
  if (messageType.value === 'whisper') {
    whisperTarget.value = ''
  }
  
  // Stop typing indicator
  handleTypingStop()
}

const handleTyping = () => {
  if (!isTyping.value) {
    isTyping.value = true
    emit('typing-start')
  }
  
  // Clear existing timeout
  if (typingTimeout.value) {
    clearTimeout(typingTimeout.value)
  }
  
  // Set new timeout
  typingTimeout.value = setTimeout(() => {
    handleTypingStop()
  }, 1000)
}

const handleTypingStop = () => {
  if (isTyping.value) {
    isTyping.value = false
    emit('typing-stop')
  }
  
  if (typingTimeout.value) {
    clearTimeout(typingTimeout.value)
    typingTimeout.value = null
  }
}

const handleFocus = () => {
  // Scroll to bottom when input is focused
  nextTick(() => {
    scrollToBottom()
  })
}

const handleBlur = () => {
  // Stop typing when input loses focus
  handleTypingStop()
}

const scrollToBottom = () => {
  if (messagesContainer.value) {
    messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
  }
}

// Add typing user (called from parent)
const addTypingUser = (playerName) => {
  if (!typingUsers.value.includes(playerName)) {
    typingUsers.value.push(playerName)
  }
}

// Remove typing user (called from parent)
const removeTypingUser = (playerName) => {
  const index = typingUsers.value.indexOf(playerName)
  if (index > -1) {
    typingUsers.value.splice(index, 1)
  }
}

// Watch for new messages to auto-scroll
watch(() => props.messages, () => {
  if (!isCollapsed.value) {
    nextTick(() => {
      scrollToBottom()
    })
  }
}, { deep: true })

// Lifecycle
onMounted(() => {
  // Initialize player colors
  props.players.forEach(player => {
    getPlayerColor(player.id)
  })
  
  // Scroll to bottom initially
  if (!isCollapsed.value) {
    nextTick(() => {
      scrollToBottom()
    })
  }
})

onUnmounted(() => {
  // Clean up timeout
  if (typingTimeout.value) {
    clearTimeout(typingTimeout.value)
  }
})

// Expose methods for parent component
defineExpose({
  addTypingUser,
  removeTypingUser
})
</script>

<style scoped>
.chat-panel {
  position: fixed;
  bottom: 20px;
  right: 20px;
  width: 350px;
  max-height: 500px;
  background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  color: white;
  z-index: 1000;
  transition: all 0.3s ease;
}

.chat-panel.collapsed {
  max-height: 60px;
}

.chat-header {
  background: rgba(0, 0, 0, 0.2);
  padding: 15px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  cursor: pointer;
  border-radius: 12px 12px 0 0;
  transition: all 0.3s ease;
}

.chat-header:hover {
  background: rgba(0, 0, 0, 0.3);
}

.header-content {
  display: flex;
  align-items: center;
  gap: 15px;
}

.header-content h4 {
  margin: 0;
  font-size: 1.1em;
}

.online-count {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.9em;
  color: #bdc3c7;
}

.online-dot {
  width: 8px;
  height: 8px;
  background: #2ecc71;
  border-radius: 50%;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.5; }
  100% { opacity: 1; }
}

.collapse-btn {
  background: none;
  border: none;
  color: white;
  font-size: 1.2em;
  cursor: pointer;
  transition: transform 0.3s ease;
}

.collapse-btn:hover {
  transform: scale(1.1);
}

.chat-content {
  display: flex;
  flex-direction: column;
  height: 400px;
}

.messages-container {
  flex: 1;
  overflow-y: auto;
  padding: 15px;
  scroll-behavior: smooth;
}

.empty-message {
  text-align: center;
  padding: 40px 20px;
  color: #7f8c8d;
}

.empty-icon {
  font-size: 2em;
  margin-bottom: 10px;
}

.message-item {
  margin-bottom: 12px;
  padding: 10px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.05);
  transition: all 0.3s ease;
}

.message-item:hover {
  background: rgba(255, 255, 255, 0.08);
}

.message-item.own-message {
  background: rgba(52, 152, 219, 0.1);
  border-left: 3px solid #3498db;
}

.message-item.system-message {
  background: rgba(149, 165, 166, 0.1);
  border-left: 3px solid #95a5a6;
}

.message-item.whisper-message {
  background: rgba(155, 89, 182, 0.1);
  border-left: 3px solid #9b59b6;
}

.message-item.team-message {
  background: rgba(46, 204, 113, 0.1);
  border-left: 3px solid #2ecc71;
}

.message-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 5px;
}

.message-author {
  font-weight: bold;
  font-size: 0.9em;
}

.message-time {
  font-size: 0.8em;
  color: #7f8c8d;
}

.message-content {
  position: relative;
}

.message-text {
  font-size: 0.9em;
  line-height: 1.4;
  color: #ecf0f1;
  word-wrap: break-word;
}

.system-badge, .whisper-badge {
  position: absolute;
  top: -5px;
  right: 0;
  background: rgba(0, 0, 0, 0.5);
  color: white;
  padding: 2px 6px;
  border-radius: 10px;
  font-size: 0.7em;
  font-weight: bold;
}

.whisper-badge {
  background: rgba(155, 89, 182, 0.7);
}

.typing-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  margin-top: 10px;
}

.typing-dots {
  display: flex;
  gap: 2px;
}

.typing-dots span {
  width: 4px;
  height: 4px;
  background: #3498db;
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
  font-size: 0.8em;
  color: #3498db;
  font-style: italic;
}

.chat-input-container {
  padding: 15px;
  background: rgba(0, 0, 0, 0.2);
  border-radius: 0 0 12px 12px;
}

.input-controls {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.message-type-select, .whisper-target-select {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  padding: 5px 8px;
  border-radius: 4px;
  font-size: 0.8em;
  cursor: pointer;
}

.message-type-select {
  flex: 1;
}

.whisper-target-select {
  flex: 1;
}

.input-row {
  display: flex;
  gap: 8px;
}

.message-input {
  flex: 1;
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 0.9em;
  transition: all 0.3s ease;
}

.message-input:focus {
  outline: none;
  border-color: rgba(52, 152, 219, 0.5);
  background: rgba(255, 255, 255, 0.15);
}

.message-input::placeholder {
  color: rgba(255, 255, 255, 0.5);
}

.message-input:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.send-btn {
  background: #3498db;
  border: none;
  color: white;
  padding: 8px 12px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 1em;
  transition: all 0.3s ease;
}

.send-btn:hover:not(:disabled) {
  background: #2980b9;
  transform: translateY(-1px);
}

.send-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* Scrollbar styling */
.messages-container::-webkit-scrollbar {
  width: 6px;
}

.messages-container::-webkit-scrollbar-track {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 3px;
}

.messages-container::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 3px;
}

.messages-container::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}

@media (max-width: 768px) {
  .chat-panel {
    width: 300px;
    right: 10px;
    bottom: 10px;
  }
  
  .input-controls {
    flex-direction: column;
  }
  
  .message-type-select, .whisper-target-select {
    width: 100%;
  }
}
</style> 