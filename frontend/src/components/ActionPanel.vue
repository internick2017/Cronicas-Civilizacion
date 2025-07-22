<template>
  <div class="action-panel">
    <div class="panel-header">
      <h3>🎯 Acciones</h3>
      <div class="turn-indicator" :class="{ active: isCurrentTurn }">
        {{ isCurrentTurn ? 'Tu turno' : 'Esperando turno' }}
      </div>
    </div>

    <div class="actions-grid" v-if="isCurrentTurn">
      <button 
        v-for="action in availableActions" 
        :key="action.id"
        @click="selectAction(action)"
        :disabled="!action.enabled"
        :class="['action-btn', action.category]"
        :title="action.description"
      >
        <div class="action-icon">{{ action.icon }}</div>
        <div class="action-name">{{ action.name }}</div>
        <div class="action-cost" v-if="action.cost">
          <span v-for="(amount, resource) in action.cost" :key="resource" class="cost-item">
            {{ amount }} {{ getResourceIcon(resource) }}
          </span>
        </div>
      </button>
    </div>

    <div class="waiting-message" v-else>
      <div class="spinner"></div>
      <p>Esperando a que {{ currentPlayerName }} complete su turno...</p>
    </div>

    <!-- Action confirmation modal -->
    <div v-if="selectedAction" class="action-modal-overlay" @click="cancelAction">
      <div class="action-modal" @click.stop>
        <h4>{{ selectedAction.name }}</h4>
        <p>{{ selectedAction.description }}</p>
        
        <div class="action-details" v-if="selectedAction.cost">
          <h5>Costo:</h5>
          <div class="cost-breakdown">
            <span v-for="(amount, resource) in selectedAction.cost" :key="resource" class="cost-detail">
              {{ amount }} {{ getResourceIcon(resource) }} {{ resource }}
            </span>
          </div>
        </div>

        <div class="modal-actions">
          <button @click="confirmAction" class="confirm-btn">Confirmar</button>
          <button @click="cancelAction" class="cancel-btn">Cancelar</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, defineProps, defineEmits } from 'vue'

const props = defineProps({
  availableActions: {
    type: Array,
    default: () => []
  },
  isCurrentTurn: {
    type: Boolean,
    default: false
  },
  currentPlayerName: {
    type: String,
    default: ''
  }
})

const emit = defineEmits(['action-selected'])

const selectedAction = ref(null)

const selectAction = (action) => {
  if (!action.enabled) return
  selectedAction.value = action
}

const confirmAction = () => {
  if (selectedAction.value) {
    emit('action-selected', selectedAction.value)
    selectedAction.value = null
  }
}

const cancelAction = () => {
  selectedAction.value = null
}

const getResourceIcon = (resource) => {
  const icons = {
    food: '🌾',
    gold: '🪙',
    wood: '🪵',
    stone: '🪨',
    science: '🔬',
    culture: '🎭',
    army: '⚔️'
  }
  return icons[resource] || '❓'
}

// Default actions if none provided
const defaultActions = computed(() => {
  if (props.availableActions.length > 0) {
    return props.availableActions
  }
  
  return [
    {
      id: 'found-city',
      name: 'Fundar Ciudad',
      icon: '🏛️',
      category: 'expansion',
      description: 'Funda una nueva ciudad en el territorio seleccionado',
      cost: { wood: 2, stone: 1 },
      enabled: true
    },
    {
      id: 'collect-resources',
      name: 'Recolectar',
      icon: '⛏️',
      category: 'economy',
      description: 'Recolecta recursos del territorio',
      cost: {},
      enabled: true
    },
    {
      id: 'build-army',
      name: 'Reclutar Ejército',
      icon: '⚔️',
      category: 'military',
      description: 'Recluta unidades militares',
      cost: { food: 1, gold: 2 },
      enabled: true
    },
    {
      id: 'research',
      name: 'Investigar',
      icon: '🔬',
      category: 'science',
      description: 'Avanza en tecnología',
      cost: { science: 3 },
      enabled: true
    },
    {
      id: 'diplomacy',
      name: 'Diplomacia',
      icon: '🤝',
      category: 'diplomacy',
      description: 'Negocia con otras civilizaciones',
      cost: { culture: 1 },
      enabled: true
    },
    {
      id: 'free-action',
      name: 'Acción Libre',
      icon: '✨',
      category: 'special',
      description: 'Describe una acción personalizada',
      cost: {},
      enabled: true
    }
  ]
})

const availableActions = computed(() => defaultActions.value)
</script>

<style scoped>
.action-panel {
  background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  color: white;
  min-height: 400px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
  padding-bottom: 15px;
  border-bottom: 2px solid rgba(255, 255, 255, 0.1);
}

.panel-header h3 {
  margin: 0;
  font-size: 1.4em;
  color: #ecf0f1;
}

.turn-indicator {
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 0.9em;
  font-weight: bold;
  background: rgba(231, 76, 60, 0.2);
  color: #e74c3c;
  transition: all 0.3s ease;
}

.turn-indicator.active {
  background: rgba(46, 204, 113, 0.2);
  color: #2ecc71;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0% { transform: scale(1); }
  50% { transform: scale(1.05); }
  100% { transform: scale(1); }
}

.actions-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
}

.action-btn {
  background: rgba(255, 255, 255, 0.1);
  border: 2px solid rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  padding: 15px 10px;
  color: white;
  cursor: pointer;
  transition: all 0.3s ease;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  min-height: 120px;
}

.action-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
  border-color: rgba(255, 255, 255, 0.4);
  transform: translateY(-2px);
}

.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.action-btn.expansion {
  border-color: rgba(52, 152, 219, 0.5);
}

.action-btn.economy {
  border-color: rgba(241, 196, 15, 0.5);
}

.action-btn.military {
  border-color: rgba(231, 76, 60, 0.5);
}

.action-btn.science {
  border-color: rgba(155, 89, 182, 0.5);
}

.action-btn.diplomacy {
  border-color: rgba(46, 204, 113, 0.5);
}

.action-btn.special {
  border-color: rgba(230, 126, 34, 0.5);
}

.action-icon {
  font-size: 2em;
  margin-bottom: 5px;
}

.action-name {
  font-weight: bold;
  text-align: center;
  font-size: 0.9em;
}

.action-cost {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: center;
}

.cost-item {
  background: rgba(0, 0, 0, 0.3);
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 0.8em;
}

.waiting-message {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 200px;
  text-align: center;
}

.spinner {
  width: 40px;
  height: 40px;
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top: 4px solid #3498db;
  border-radius: 50%;
  animation: spin 1s linear infinite;
  margin-bottom: 20px;
}

@keyframes spin {
  0% { transform: rotate(0deg); }
  100% { transform: rotate(360deg); }
}

.action-modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.action-modal {
  background: #2c3e50;
  border-radius: 12px;
  padding: 30px;
  max-width: 400px;
  width: 90%;
  color: white;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
}

.action-modal h4 {
  margin: 0 0 15px 0;
  color: #ecf0f1;
  font-size: 1.3em;
}

.action-modal p {
  margin: 0 0 20px 0;
  color: #bdc3c7;
  line-height: 1.5;
}

.action-details h5 {
  margin: 0 0 10px 0;
  color: #f39c12;
}

.cost-breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
}

.cost-detail {
  background: rgba(0, 0, 0, 0.3);
  padding: 5px 10px;
  border-radius: 6px;
  font-size: 0.9em;
}

.modal-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.confirm-btn, .cancel-btn {
  padding: 10px 20px;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  font-weight: bold;
  transition: all 0.3s ease;
}

.confirm-btn {
  background: #27ae60;
  color: white;
}

.confirm-btn:hover {
  background: #2ecc71;
}

.cancel-btn {
  background: #95a5a6;
  color: white;
}

.cancel-btn:hover {
  background: #bdc3c7;
}
</style> 