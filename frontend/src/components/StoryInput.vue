<template>
  <div class="story-input">
    <div class="input-header">
             <div class="player-info" v-if="props.currentPlayer">
                   <div class="player-avatar">{{ getPlayerAvatar(props.currentPlayer) }}</div>
         <div class="player-details">
           <div class="player-name">{{ getPlayerDisplayName(props.currentPlayer) }}</div>
           <div class="player-class">{{ getPlayerDisplayClass(props.currentPlayer) }}</div>
         </div>
         <div class="turn-indicator" v-if="props.isMyTurn">
           <span class="turn-badge">🎯 Tu turno</span>
         </div>
       </div>
       <div class="waiting-message" v-else-if="!props.isMyTurn && props.currentPlayer">
         <div class="waiting-icon">⏳</div>
         <span>Esperando el turno de {{ props.nextPlayerName }}</span>
       </div>
    </div>

         <div class="input-area" :class="{ disabled: !props.isMyTurn }">
       <div class="input-wrapper">
         <textarea
           ref="actionInput"
           v-model="actionText"
           :placeholder="getPlaceholder()"
           :disabled="!props.isMyTurn || props.isSubmitting"
           @keydown.ctrl.enter="submitAction"
           @keydown.meta.enter="submitAction"
           class="action-textarea"
           maxlength="500"
           rows="3"
         ></textarea>
        
        <div class="input-controls">
          <div class="char-counter" :class="{ warning: actionText.length > 400 }">
            {{ actionText.length }}/500
          </div>
          <div class="input-buttons">
                         <button
               @click="clearInput"
               class="clear-btn"
               :disabled="!actionText.trim() || props.isSubmitting"
               title="Limpiar"
             >
               🗑️
             </button>
             <button
               @click="submitAction"
               class="submit-btn"
               :disabled="!canSubmit"
               :class="{ loading: props.isSubmitting }"
               title="Enviar acción (Ctrl+Enter)"
             >
               <span v-if="!props.isSubmitting">📤 Enviar</span>
               <span v-else class="loading-text">Generando...</span>
             </button>
          </div>
        </div>
      </div>
    </div>

    <div class="input-help">
      <div class="help-title">💡 Consejos para escribir tu acción:</div>
      <ul class="help-list">
        <li>Describe qué hace tu personaje de manera clara y específica</li>
        <li>Puedes incluir diálogo, pensamientos o descripciones</li>
        <li>Mantén la continuidad con la historia anterior</li>
        <li>Usa Ctrl+Enter para enviar rápidamente</li>
      </ul>
    </div>

    <!-- Error message -->
    <div v-if="errorMessage" class="error-message">
      <div class="error-icon">⚠️</div>
      <span>{{ errorMessage }}</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick } from 'vue'

const props = defineProps({
  currentPlayer: {
    type: Object,
    default: null
  },
  isMyTurn: {
    type: Boolean,
    default: false
  },
  isSubmitting: {
    type: Boolean,
    default: false
  },
  nextPlayerName: {
    type: String,
    default: ''
  },
  sessionId: {
    type: String,
    required: true
  },
  gameType: {
    type: String,
    default: 'character'
  }
})

const emit = defineEmits(['submit-action', 'clear-error'])

// Refs
const actionInput = ref(null)
const actionText = ref('')
const errorMessage = ref('')

// Computed
const canSubmit = computed(() => {
  return props.isMyTurn && 
         actionText.value.trim().length > 0 && 
         !props.isSubmitting &&
         actionText.value.length <= 500
})

// Methods
const getPlaceholder = () => {
  if (!props.isMyTurn) {
    return `Esperando el turno de ${props.nextPlayerName}...`
  }
  
  // Get game type from props
  const gameType = props.gameType
  
  if (gameType === 'character') {
    const placeholders = [
      '¿Qué hace tu personaje? (ej: "Me acerco sigilosamente al castillo...")',
      'Describe tu acción (ej: "Levanto mi espada y cargo contra el enemigo")',
      '¿Qué dice tu personaje? (ej: "¡Por el honor de mi reino!")',
      'Narra tu movimiento (ej: "Exploro las ruinas en busca de tesoros")',
      '¿Cómo reaccionas? (ej: "Me escondo detrás de una roca y observo...")'
    ]
    return placeholders[Math.floor(Math.random() * placeholders.length)]
  } else if (gameType === 'country') {
    const placeholders = [
      '¿Qué hace tu país? (ej: "Construyo una nueva ciudad fortificada...")',
      'Describe tu acción (ej: "Declaro guerra al reino vecino")',
      '¿Qué política implementas? (ej: "Establezco una alianza comercial")',
      'Narra tu movimiento (ej: "Expando mis fronteras hacia el norte")',
      '¿Cómo gobiernas? (ej: "Invierto en tecnología militar")'
    ]
    return placeholders[Math.floor(Math.random() * placeholders.length)]
  } else if (gameType === 'world') {
    const placeholders = [
      '¿Qué cambia en el mundo? (ej: "Creo una nueva civilización...")',
      'Describe tu acción (ej: "Cambio el clima de todo el continente")',
      '¿Qué evento mundial ocurre? (ej: "Una gran guerra estalla entre naciones")',
      'Narra tu movimiento (ej: "Formo una alianza mundial de paz")',
      '¿Cómo evoluciona el mundo? (ej: "Una nueva era de prosperidad comienza")'
    ]
    return placeholders[Math.floor(Math.random() * placeholders.length)]
  }
  
  return 'Describe tu acción...'
}

const getPlayerDisplayName = (player) => {
  if (!player) return ''
  
  if (player.countryName) return player.countryName
  if (player.worldRole) return player.worldRole
  return player.characterName || player.name
}

const getPlayerDisplayClass = (player) => {
  if (!player) return ''
  
  if (player.countryType) return player.countryType
  if (player.worldType) return player.worldType
  return player.characterClass || 'Aventurero'
}

const getPlayerAvatar = (player) => {
  if (!player) return '👤'
  
  const gameType = props.gameType
  
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

const submitAction = async () => {
  if (!canSubmit.value) return
  
  const action = actionText.value.trim()
  if (action.length === 0) return
  
  try {
    errorMessage.value = ''
    emit('submit-action', action)
    actionText.value = ''
  } catch (error) {
    errorMessage.value = 'Error al enviar la acción. Inténtalo de nuevo.'
  }
}

const clearInput = () => {
  actionText.value = ''
  errorMessage.value = ''
  emit('clear-error')
  nextTick(() => {
    if (actionInput.value) {
      actionInput.value.focus()
    }
  })
}

// Watch for turn changes to focus input
watch(() => props.isMyTurn, (newValue) => {
  if (newValue) {
    nextTick(() => {
      if (actionInput.value) {
        actionInput.value.focus()
      }
    })
  }
})

// Clear error when turn changes
watch(() => props.isMyTurn, () => {
  errorMessage.value = ''
  emit('clear-error')
})
</script>

<style scoped>
.story-input {
  background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  color: white;
}

.input-header {
  margin-bottom: 20px;
}

.player-info {
  display: flex;
  align-items: center;
  gap: 15px;
  padding: 15px;
  background: rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  border-left: 4px solid #3498db;
}

.player-avatar {
  font-size: 2em;
  width: 50px;
  height: 50px;
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
  font-size: 1.2em;
  font-weight: bold;
  color: #ecf0f1;
  margin-bottom: 4px;
}

.player-class {
  font-size: 0.9em;
  color: #bdc3c7;
  font-style: italic;
}

.turn-indicator {
  display: flex;
  align-items: center;
}

.turn-badge {
  background: linear-gradient(45deg, #27ae60, #2ecc71);
  color: white;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 0.9em;
  font-weight: bold;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { opacity: 1; }
  50% { opacity: 0.7; }
  100% { opacity: 1; }
}

.waiting-message {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 15px;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 8px;
  border-left: 4px solid #f39c12;
  color: #bdc3c7;
}

.waiting-icon {
  font-size: 1.5em;
  animation: spin 2s linear infinite;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.input-area {
  margin-bottom: 20px;
}

.input-area.disabled {
  opacity: 0.6;
  pointer-events: none;
}

.input-wrapper {
  position: relative;
}

.action-textarea {
  width: 100%;
  min-height: 100px;
  padding: 15px;
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 8px;
  color: white;
  font-size: 1em;
  line-height: 1.5;
  resize: vertical;
  transition: all 0.3s ease;
}

.action-textarea:focus {
  outline: none;
  border-color: #3498db;
  background: rgba(255, 255, 255, 0.15);
  box-shadow: 0 0 20px rgba(52, 152, 219, 0.3);
}

.action-textarea::placeholder {
  color: rgba(255, 255, 255, 0.6);
  font-style: italic;
}

.action-textarea:disabled {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.5);
  cursor: not-allowed;
}

.input-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
}

.char-counter {
  font-size: 0.9em;
  color: #bdc3c7;
}

.char-counter.warning {
  color: #f39c12;
}

.input-buttons {
  display: flex;
  gap: 10px;
}

.clear-btn, .submit-btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9em;
  transition: all 0.3s ease;
}

.clear-btn {
  background: rgba(231, 76, 60, 0.2);
  color: #e74c3c;
  border: 1px solid rgba(231, 76, 60, 0.3);
}

.clear-btn:hover:not(:disabled) {
  background: rgba(231, 76, 60, 0.3);
  border-color: rgba(231, 76, 60, 0.5);
}

.submit-btn {
  background: linear-gradient(45deg, #27ae60, #2ecc71);
  color: white;
  border: 1px solid rgba(39, 174, 96, 0.3);
  font-weight: bold;
}

.submit-btn:hover:not(:disabled) {
  background: linear-gradient(45deg, #2ecc71, #27ae60);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(39, 174, 96, 0.3);
}

.submit-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
  transform: none;
}

.submit-btn.loading {
  background: linear-gradient(45deg, #95a5a6, #7f8c8d);
  cursor: not-allowed;
}

.loading-text {
  display: flex;
  align-items: center;
  gap: 5px;
}

.loading-text::after {
  content: '';
  width: 12px;
  height: 12px;
  border: 2px solid transparent;
  border-top: 2px solid white;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}

.input-help {
  background: rgba(52, 152, 219, 0.1);
  border-radius: 8px;
  padding: 15px;
  border-left: 4px solid #3498db;
}

.help-title {
  font-weight: bold;
  color: #3498db;
  margin-bottom: 10px;
  font-size: 0.95em;
}

.help-list {
  margin: 0;
  padding-left: 20px;
  color: #bdc3c7;
  font-size: 0.9em;
  line-height: 1.4;
}

.help-list li {
  margin-bottom: 5px;
}

.error-message {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(231, 76, 60, 0.1);
  border: 1px solid rgba(231, 76, 60, 0.3);
  border-radius: 6px;
  padding: 12px;
  margin-top: 15px;
  color: #e74c3c;
  font-size: 0.9em;
}

.error-icon {
  font-size: 1.2em;
}

@media (max-width: 768px) {
  .story-input {
    padding: 15px;
  }
  
  .player-info {
    flex-direction: column;
    text-align: center;
    gap: 10px;
  }
  
  .input-controls {
    flex-direction: column;
    gap: 10px;
    align-items: stretch;
  }
  
  .input-buttons {
    justify-content: center;
  }
}
</style> 