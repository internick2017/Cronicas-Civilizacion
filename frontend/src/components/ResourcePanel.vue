<template>
  <div class="resource-panel">
    <div class="panel-header">
      <h3>💰 Recursos</h3>
      <div class="resource-summary">
        <span class="total-resources">Total: {{ totalResources }}</span>
      </div>
    </div>

    <div class="resources-grid">
      <div 
        v-for="resource in resourceList" 
        :key="resource.type"
        class="resource-item"
        :class="{ 'low-resource': isLowResource(resource.type) }"
      >
        <div class="resource-icon">{{ resource.icon }}</div>
        <div class="resource-info">
          <span class="resource-name">{{ resource.name }}</span>
          <span class="resource-amount">{{ getResourceAmount(resource.type) }}</span>
        </div>
        <div class="resource-change" v-if="resourceChanges[resource.type]">
          <span 
            class="change-indicator"
            :class="{ 
              positive: resourceChanges[resource.type] > 0,
              negative: resourceChanges[resource.type] < 0
            }"
          >
            {{ resourceChanges[resource.type] > 0 ? '+' : '' }}{{ resourceChanges[resource.type] }}
          </span>
        </div>
      </div>
    </div>

    <div class="resource-tips">
      <h4>💡 Consejos</h4>
      <div class="tips-list">
        <div v-for="tip in resourceTips" :key="tip.id" class="tip-item">
          <span class="tip-icon">{{ tip.icon }}</span>
          <span class="tip-text">{{ tip.text }}</span>
        </div>
      </div>
    </div>

    <div class="resource-actions">
      <button 
        @click="showResourceHistory" 
        class="btn btn-outline"
      >
        📊 Historial
      </button>
      <button 
        @click="showResourceGuide" 
        class="btn btn-outline"
      >
        📖 Guía
      </button>
    </div>

    <!-- Resource History Modal -->
    <div v-if="showHistory" class="modal-overlay" @click="closeHistory">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>📊 Historial de Recursos</h3>
          <button @click="closeHistory" class="close-btn">×</button>
        </div>
        <div class="modal-body">
          <div class="history-chart">
            <p>Gráfico de recursos por turno (próximamente)</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Resource Guide Modal -->
    <div v-if="showGuide" class="modal-overlay" @click="closeGuide">
      <div class="modal-content" @click.stop>
        <div class="modal-header">
          <h3>📖 Guía de Recursos</h3>
          <button @click="closeGuide" class="close-btn">×</button>
        </div>
        <div class="modal-body">
          <div class="guide-content">
            <div v-for="resource in resourceList" :key="resource.type" class="guide-item">
              <div class="guide-header">
                <span class="guide-icon">{{ resource.icon }}</span>
                <h4>{{ resource.name }}</h4>
              </div>
              <p>{{ resource.description }}</p>
              <div class="guide-uses">
                <strong>Usos:</strong>
                <ul>
                  <li v-for="use in resource.uses" :key="use">{{ use }}</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'

const props = defineProps({
  resources: {
    type: Object,
    default: () => ({
      food: 0,
      gold: 0,
      wood: 0,
      stone: 0,
      science: 0,
      culture: 0,
      army: 0
    })
  }
})

// Reactive data
const showHistory = ref(false)
const showGuide = ref(false)
const resourceChanges = ref({}) // Track resource changes between turns

// Resource configuration
const resourceList = [
  {
    type: 'food',
    name: 'Comida',
    icon: '🌾',
    description: 'Necesaria para el crecimiento de población y fundación de ciudades',
    uses: ['Fundar ciudades', 'Aumentar población', 'Mantener ejércitos']
  },
  {
    type: 'gold',
    name: 'Oro',
    icon: '💰',
    description: 'Moneda principal para comercio y construcción',
    uses: ['Construir edificios', 'Comercio', 'Diplomacia', 'Ejércitos']
  },
  {
    type: 'wood',
    name: 'Madera',
    icon: '🪵',
    description: 'Material básico para construcción',
    uses: ['Construir edificios', 'Barcos', 'Herramientas']
  },
  {
    type: 'stone',
    name: 'Piedra',
    icon: '🪨',
    description: 'Material para construcciones avanzadas',
    uses: ['Fortificaciones', 'Monumentos', 'Edificios avanzados']
  },
  {
    type: 'science',
    name: 'Ciencia',
    icon: '🔬',
    description: 'Conocimiento para avances tecnológicos',
    uses: ['Investigación', 'Nuevas tecnologías', 'Victoria científica']
  },
  {
    type: 'culture',
    name: 'Cultura',
    icon: '🎭',
    description: 'Influencia cultural y artística',
    uses: ['Expandir fronteras', 'Diplomacia', 'Victoria cultural']
  },
  {
    type: 'army',
    name: 'Ejército',
    icon: '⚔️',
    description: 'Fuerza militar para defensa y conquista',
    uses: ['Combate', 'Defensa', 'Conquista de territorios']
  }
]

// Computed properties
const totalResources = computed(() => {
  return Object.values(props.resources).reduce((sum, amount) => sum + amount, 0)
})

const resourceTips = computed(() => {
  const tips = []
  
  // Check for low resources
  if (getResourceAmount('food') < 50) {
    tips.push({
      id: 'low-food',
      icon: '⚠️',
      text: 'Comida baja - Recolecta en granjas o caza'
    })
  }
  
  if (getResourceAmount('gold') < 30) {
    tips.push({
      id: 'low-gold',
      icon: '💡',
      text: 'Construye mercados para generar oro'
    })
  }
  
  if (getResourceAmount('army') < 2) {
    tips.push({
      id: 'low-army',
      icon: '🛡️',
      text: 'Considera entrenar más tropas'
    })
  }
  
  // Positive tips
  if (getResourceAmount('science') > 100) {
    tips.push({
      id: 'high-science',
      icon: '🎓',
      text: '¡Buen progreso científico!'
    })
  }
  
  return tips.slice(0, 3) // Show max 3 tips
})

// Methods
const getResourceAmount = (type) => {
  return props.resources[type] || 0
}

const isLowResource = (type) => {
  const thresholds = {
    food: 30,
    gold: 20,
    wood: 20,
    stone: 15,
    science: 10,
    culture: 10,
    army: 1
  }
  return getResourceAmount(type) < thresholds[type]
}

const showResourceHistory = () => {
  showHistory.value = true
}

const closeHistory = () => {
  showHistory.value = false
}

const showResourceGuide = () => {
  showGuide.value = true
}

const closeGuide = () => {
  showGuide.value = false
}

// Watch for resource changes (would be implemented with watchers in real app)
const updateResourceChanges = (newResources, oldResources) => {
  const changes = {}
  for (const [type, amount] of Object.entries(newResources)) {
    const oldAmount = oldResources[type] || 0
    const change = amount - oldAmount
    if (change !== 0) {
      changes[type] = change
    }
  }
  resourceChanges.value = changes
}
</script>

<style scoped>
.resource-panel {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  margin-bottom: 20px;
}

.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}

.panel-header h3 {
  color: #2c3e50;
  font-size: 1.3rem;
  margin: 0;
}

.resource-summary {
  color: #7f8c8d;
  font-size: 0.9rem;
}

.total-resources {
  font-weight: 600;
}

.resources-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 15px;
  margin-bottom: 20px;
}

.resource-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 2px solid #e9ecef;
  transition: all 0.3s;
  position: relative;
}

.resource-item:hover {
  border-color: #3498db;
  transform: translateY(-2px);
}

.resource-item.low-resource {
  border-color: #e74c3c;
  background: #fdf2f2;
}

.resource-icon {
  font-size: 2rem;
  margin-bottom: 8px;
}

.resource-info {
  text-align: center;
  flex: 1;
}

.resource-name {
  display: block;
  color: #7f8c8d;
  font-size: 0.8rem;
  font-weight: 600;
  margin-bottom: 5px;
  text-transform: uppercase;
}

.resource-amount {
  display: block;
  color: #2c3e50;
  font-size: 1.5rem;
  font-weight: bold;
}

.resource-change {
  position: absolute;
  top: -5px;
  right: -5px;
  background: #34495e;
  color: white;
  border-radius: 50%;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.7rem;
  font-weight: bold;
}

.change-indicator.positive {
  background: #27ae60;
}

.change-indicator.negative {
  background: #e74c3c;
}

.resource-tips {
  margin-bottom: 20px;
}

.resource-tips h4 {
  color: #2c3e50;
  margin-bottom: 10px;
  font-size: 1rem;
}

.tips-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.tip-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: #e8f4fd;
  border-radius: 6px;
  font-size: 0.9rem;
}

.tip-icon {
  font-size: 1rem;
}

.tip-text {
  color: #2c3e50;
}

.resource-actions {
  display: flex;
  gap: 10px;
}

.btn {
  padding: 8px 16px;
  border: none;
  border-radius: 6px;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
}

.btn-outline {
  background: transparent;
  color: #3498db;
  border: 2px solid #3498db;
}

.btn-outline:hover {
  background: #3498db;
  color: white;
}

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal-content {
  background: white;
  border-radius: 12px;
  width: 90%;
  max-width: 600px;
  max-height: 80vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #e9ecef;
}

.modal-header h3 {
  color: #2c3e50;
  margin: 0;
}

.close-btn {
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: #7f8c8d;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  color: #2c3e50;
}

.modal-body {
  padding: 20px;
}

.history-chart {
  text-align: center;
  color: #7f8c8d;
  padding: 40px;
}

.guide-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.guide-item {
  border: 1px solid #e9ecef;
  border-radius: 8px;
  padding: 15px;
}

.guide-header {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.guide-icon {
  font-size: 1.5rem;
}

.guide-header h4 {
  color: #2c3e50;
  margin: 0;
}

.guide-item p {
  color: #7f8c8d;
  margin-bottom: 10px;
  line-height: 1.5;
}

.guide-uses strong {
  color: #2c3e50;
}

.guide-uses ul {
  margin-top: 5px;
  padding-left: 20px;
}

.guide-uses li {
  color: #7f8c8d;
  margin-bottom: 3px;
}

@media (max-width: 768px) {
  .resources-grid {
    grid-template-columns: repeat(2, 1fr);
  }
  
  .resource-actions {
    flex-direction: column;
  }
  
  .modal-content {
    width: 95%;
    margin: 20px;
  }
}
</style> 