<template>
  <div class="player-info">
    <div class="player-header">
      <div class="player-avatar">
        <img 
          v-if="player?.avatar" 
          :src="player.avatar" 
          :alt="player.civilizationName"
        >
        <div v-else class="default-avatar">
          {{ getInitials(player?.civilizationName) }}
        </div>
      </div>
      
      <div class="player-details">
        <h3>{{ player?.civilizationName }}</h3>
        <p class="player-name">{{ player?.name }}</p>
        <div class="turn-indicator" :class="{ active: isCurrentTurn }">
          <span class="turn-status">
            {{ isCurrentTurn ? '🔥 Tu turno' : '⏳ Esperando' }}
          </span>
        </div>
      </div>
    </div>

    <div class="player-stats">
      <div class="stat-item">
        <span class="stat-label">Ciudades</span>
        <span class="stat-value">{{ cityCount }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Territorio</span>
        <span class="stat-value">{{ territoryCount }}</span>
      </div>
      <div class="stat-item">
        <span class="stat-label">Ejércitos</span>
        <span class="stat-value">{{ player?.resources?.army || 0 }}</span>
      </div>
    </div>

    <div class="player-actions" v-if="isCurrentTurn">
      <div class="action-reminder">
        <p>💡 Es tu turno</p>
        <p class="reminder-text">Selecciona una acción para continuar</p>
      </div>
    </div>

    <div class="player-achievements" v-if="achievements.length > 0">
      <h4>🏆 Logros</h4>
      <div class="achievements-list">
        <div 
          v-for="achievement in achievements" 
          :key="achievement.id"
          class="achievement-item"
        >
          <span class="achievement-icon">{{ achievement.icon }}</span>
          <span class="achievement-name">{{ achievement.name }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  player: {
    type: Object,
    required: true
  },
  isCurrentTurn: {
    type: Boolean,
    default: false
  }
})

// Computed properties
const cityCount = computed(() => {
  // This would typically come from the game state
  return props.player?.stats?.citiesFounded || 0
})

const territoryCount = computed(() => {
  // This would typically come from the game state
  return props.player?.stats?.territoriesConquered || 0
})

const achievements = computed(() => {
  // Mock achievements based on player stats
  const achievements = []
  
  if (cityCount.value >= 3) {
    achievements.push({
      id: 'city-builder',
      name: 'Constructor de Ciudades',
      icon: '🏛️'
    })
  }
  
  if (territoryCount.value >= 5) {
    achievements.push({
      id: 'conqueror',
      name: 'Conquistador',
      icon: '⚔️'
    })
  }
  
  if (props.player?.resources?.science >= 100) {
    achievements.push({
      id: 'scholar',
      name: 'Erudito',
      icon: '📚'
    })
  }
  
  return achievements
})

// Methods
const getInitials = (name) => {
  return name
    ?.split(' ')
    .map(word => word.charAt(0))
    .join('')
    .toUpperCase()
    .slice(0, 2) || '??'
}
</script>

<style scoped>
.player-info {
  background: white;
  border-radius: 12px;
  padding: 20px;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
  margin-bottom: 20px;
}

.player-header {
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 20px;
}

.player-avatar {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
}

.player-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.default-avatar {
  width: 100%;
  height: 100%;
  background: #3498db;
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: bold;
  font-size: 1.5rem;
}

.player-details {
  flex: 1;
}

.player-details h3 {
  color: #2c3e50;
  margin-bottom: 5px;
  font-size: 1.4rem;
}

.player-name {
  color: #7f8c8d;
  font-size: 0.9rem;
  margin-bottom: 10px;
}

.turn-indicator {
  display: inline-block;
  padding: 6px 12px;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 600;
  background: #ecf0f1;
  color: #7f8c8d;
  transition: all 0.3s;
}

.turn-indicator.active {
  background: #e8f5e8;
  color: #27ae60;
  animation: pulse 2s infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.7; }
}

.player-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 15px;
  margin-bottom: 20px;
}

.stat-item {
  text-align: center;
  padding: 15px;
  background: #f8f9fa;
  border-radius: 8px;
  border: 2px solid #e9ecef;
  transition: all 0.3s;
}

.stat-item:hover {
  border-color: #3498db;
  transform: translateY(-2px);
}

.stat-label {
  display: block;
  color: #7f8c8d;
  font-size: 0.8rem;
  font-weight: 600;
  margin-bottom: 5px;
  text-transform: uppercase;
}

.stat-value {
  display: block;
  color: #2c3e50;
  font-size: 1.8rem;
  font-weight: bold;
}

.player-actions {
  margin-bottom: 20px;
}

.action-reminder {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  padding: 15px;
  border-radius: 8px;
  text-align: center;
}

.action-reminder p {
  margin: 0;
  font-weight: 600;
}

.reminder-text {
  font-size: 0.9rem;
  opacity: 0.9;
  margin-top: 5px !important;
}

.player-achievements h4 {
  color: #2c3e50;
  margin-bottom: 15px;
  font-size: 1.1rem;
  display: flex;
  align-items: center;
  gap: 8px;
}

.achievements-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.achievement-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: #fff3cd;
  border: 1px solid #ffeaa7;
  border-radius: 6px;
  color: #856404;
  font-size: 0.9rem;
}

.achievement-icon {
  font-size: 1.2rem;
}

.achievement-name {
  font-weight: 600;
}

@media (max-width: 768px) {
  .player-header {
    flex-direction: column;
    text-align: center;
  }
  
  .player-stats {
    grid-template-columns: 1fr;
  }
  
  .stat-item {
    padding: 10px;
  }
  
  .stat-value {
    font-size: 1.5rem;
  }
}
</style> 