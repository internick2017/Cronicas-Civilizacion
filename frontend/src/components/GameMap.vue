<template>
  <div class="game-map">
    <div class="map-header">
      <h3>🗺️ Mapa del Mundo</h3>
      <div class="map-controls">
        <button @click="zoomIn" :disabled="zoom >= maxZoom">🔍 +</button>
        <button @click="zoomOut" :disabled="zoom <= minZoom">🔍 -</button>
        <button @click="centerMap">🎯 Centrar</button>
        <div class="zoom-level">{{ Math.round(zoom * 100) }}%</div>
      </div>
    </div>

    <div class="map-container" ref="mapContainer">
      <canvas 
        ref="canvas"
        @click="handleCanvasClick"
        @mousemove="handleMouseMove"
        @wheel="handleWheel"
        @mousedown="handleMouseDown"
        @mouseup="handleMouseUp"
        @mouseleave="handleMouseLeave"
      ></canvas>
      
      <!-- Tile info tooltip -->
      <div 
        v-if="hoveredTile && showTooltip" 
        class="tile-tooltip"
        :style="{ left: tooltipX + 'px', top: tooltipY + 'px' }"
      >
        <div class="tooltip-header">
          <strong>{{ getTileDisplayName(hoveredTile) }}</strong>
        </div>
        <div class="tooltip-content">
          <div class="terrain-info">
            <span class="terrain-icon">{{ getTerrainIcon(hoveredTile.terrain) }}</span>
            {{ hoveredTile.terrain }}
          </div>
          <div v-if="hoveredTile.resources && Object.keys(hoveredTile.resources).length > 0" class="resources-info">
            <strong>Recursos:</strong>
            <div class="resources-list">
              <span v-for="(amount, resource) in hoveredTile.resources" :key="resource" class="resource-item">
                {{ getResourceIcon(resource) }} {{ amount }}
              </span>
            </div>
          </div>
          <div v-if="hoveredTile.city" class="city-info">
            <strong>🏛️ {{ hoveredTile.city.name }}</strong>
            <div>Población: {{ hoveredTile.city.population }}</div>
          </div>
          <div v-if="hoveredTile.army" class="army-info">
            <strong>⚔️ Ejército</strong>
            <div>Fuerza: {{ hoveredTile.army.strength }}</div>
          </div>
          <div v-if="hoveredTile.owner" class="owner-info">
            <strong>Propietario:</strong> {{ hoveredTile.owner.name }}
          </div>
        </div>
      </div>
    </div>

    <div class="map-legend">
      <div class="legend-section">
        <h4>Terrenos</h4>
        <div class="legend-items">
          <div class="legend-item" v-for="terrain in terrainTypes" :key="terrain.type">
            <div class="terrain-color" :style="{ backgroundColor: terrain.color }"></div>
            <span>{{ terrain.icon }} {{ terrain.name }}</span>
          </div>
        </div>
      </div>
      <div class="legend-section">
        <h4>Recursos</h4>
        <div class="legend-items">
          <div class="legend-item" v-for="resource in resourceTypes" :key="resource.type">
            <span>{{ resource.icon }} {{ resource.name }}</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, watch, nextTick, defineProps, defineEmits } from 'vue'

const props = defineProps({
  map: {
    type: Array,
    default: () => []
  },
  playerId: {
    type: String,
    default: ''
  },
  selectedTile: {
    type: Object,
    default: null
  }
})

const emit = defineEmits(['tile-clicked', 'tile-selected'])

// Refs
const canvas = ref(null)
const mapContainer = ref(null)

// Map state
const zoom = ref(1)
const minZoom = 0.5
const maxZoom = 3
const offsetX = ref(0)
const offsetY = ref(0)
const tileSize = ref(40)

// Interaction state
const isDragging = ref(false)
const lastMouseX = ref(0)
const lastMouseY = ref(0)
const hoveredTile = ref(null)
const showTooltip = ref(false)
const tooltipX = ref(0)
const tooltipY = ref(0)

// Terrain and resource definitions
const terrainTypes = [
  { type: 'plains', name: 'Llanuras', color: '#90EE90', icon: '🌾' },
  { type: 'forest', name: 'Bosque', color: '#228B22', icon: '🌲' },
  { type: 'mountains', name: 'Montañas', color: '#8B4513', icon: '⛰️' },
  { type: 'desert', name: 'Desierto', color: '#F4A460', icon: '🏜️' },
  { type: 'water', name: 'Agua', color: '#4682B4', icon: '🌊' },
  { type: 'hills', name: 'Colinas', color: '#9ACD32', icon: '🏔️' }
]

const resourceTypes = [
  { type: 'food', name: 'Comida', icon: '🌾' },
  { type: 'gold', name: 'Oro', icon: '🪙' },
  { type: 'wood', name: 'Madera', icon: '🪵' },
  { type: 'stone', name: 'Piedra', icon: '🪨' },
  { type: 'science', name: 'Ciencia', icon: '🔬' },
  { type: 'culture', name: 'Cultura', icon: '🎭' },
  { type: 'army', name: 'Ejército', icon: '⚔️' }
]

// Default map if none provided
const defaultMap = ref([])

const generateDefaultMap = () => {
  const size = 20
  const map = []
  for (let x = 0; x < size; x++) {
    map[x] = []
    for (let y = 0; y < size; y++) {
      map[x][y] = {
        x,
        y,
        terrain: terrainTypes[Math.floor(Math.random() * terrainTypes.length)].type,
        resources: Math.random() > 0.7 ? {
          [resourceTypes[Math.floor(Math.random() * resourceTypes.length)].type]: Math.floor(Math.random() * 3) + 1
        } : {},
        city: Math.random() > 0.95 ? {
          name: `Ciudad ${x}-${y}`,
          population: Math.floor(Math.random() * 1000) + 100
        } : null,
        army: Math.random() > 0.9 ? {
          strength: Math.floor(Math.random() * 10) + 1
        } : null,
        owner: Math.random() > 0.8 ? { name: 'Jugador Test' } : null,
        discovered: Math.random() > 0.3
      }
    }
  }
  return map
}

const currentMap = ref(props.map.length > 0 ? props.map : generateDefaultMap())

// Helper functions
const getTerrainColor = (terrain) => {
  const terrainType = terrainTypes.find(t => t.type === terrain)
  return terrainType ? terrainType.color : '#CCCCCC'
}

const getTerrainIcon = (terrain) => {
  const terrainType = terrainTypes.find(t => t.type === terrain)
  return terrainType ? terrainType.icon : '❓'
}

const getResourceIcon = (resource) => {
  const resourceType = resourceTypes.find(r => r.type === resource)
  return resourceType ? resourceType.icon : '❓'
}

const getTileDisplayName = (tile) => {
  if (tile.city) return tile.city.name
  return `Territorio (${tile.x}, ${tile.y})`
}

// Canvas drawing functions
const drawMap = () => {
  if (!canvas.value) return

  const ctx = canvas.value.getContext('2d')
  const canvasWidth = canvas.value.width
  const canvasHeight = canvas.value.height

  // Clear canvas
  ctx.clearRect(0, 0, canvasWidth, canvasHeight)

  // Calculate visible tiles
  const scaledTileSize = tileSize.value * zoom.value
  const startX = Math.max(0, Math.floor(-offsetX.value / scaledTileSize))
  const startY = Math.max(0, Math.floor(-offsetY.value / scaledTileSize))
  const endX = Math.min(currentMap.value.length, startX + Math.ceil(canvasWidth / scaledTileSize) + 1)
  const endY = Math.min(currentMap.value[0]?.length || 0, startY + Math.ceil(canvasHeight / scaledTileSize) + 1)

  // Draw tiles
  for (let x = startX; x < endX; x++) {
    for (let y = startY; y < endY; y++) {
      if (currentMap.value[x] && currentMap.value[x][y]) {
        drawTile(ctx, currentMap.value[x][y], x, y, scaledTileSize)
      }
    }
  }

  // Draw grid
  drawGrid(ctx, scaledTileSize, startX, startY, endX, endY)
}

const drawTile = (ctx, tile, x, y, size) => {
  const pixelX = x * size + offsetX.value
  const pixelY = y * size + offsetY.value

  // Skip if tile is not discovered
  if (!tile.discovered) {
    ctx.fillStyle = '#333333'
    ctx.fillRect(pixelX, pixelY, size, size)
    return
  }

  // Draw terrain
  ctx.fillStyle = getTerrainColor(tile.terrain)
  ctx.fillRect(pixelX, pixelY, size, size)

  // Draw owner overlay
  if (tile.owner) {
    ctx.fillStyle = 'rgba(100, 149, 237, 0.3)'
    ctx.fillRect(pixelX, pixelY, size, size)
  }

  // Draw city
  if (tile.city) {
    ctx.fillStyle = '#8B4513'
    ctx.fillRect(pixelX + size * 0.2, pixelY + size * 0.2, size * 0.6, size * 0.6)
    
    if (size > 20) {
      ctx.fillStyle = 'white'
      ctx.font = `${Math.min(size * 0.3, 12)}px Arial`
      ctx.textAlign = 'center'
      ctx.fillText('🏛️', pixelX + size * 0.5, pixelY + size * 0.6)
    }
  }

  // Draw army
  if (tile.army) {
    ctx.fillStyle = '#DC143C'
    ctx.fillRect(pixelX + size * 0.7, pixelY + size * 0.1, size * 0.25, size * 0.25)
    
    if (size > 20) {
      ctx.fillStyle = 'white'
      ctx.font = `${Math.min(size * 0.2, 10)}px Arial`
      ctx.textAlign = 'center'
      ctx.fillText('⚔️', pixelX + size * 0.82, pixelY + size * 0.28)
    }
  }

  // Draw resources
  if (tile.resources && Object.keys(tile.resources).length > 0 && size > 30) {
    let resourceIndex = 0
    for (const [resource, amount] of Object.entries(tile.resources)) {
      if (resourceIndex < 2) { // Only show first 2 resources
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)'
        ctx.fillRect(pixelX + 2 + resourceIndex * 8, pixelY + size - 12, 6, 8)
        
        ctx.fillStyle = 'black'
        ctx.font = '8px Arial'
        ctx.textAlign = 'center'
        ctx.fillText(amount, pixelX + 5 + resourceIndex * 8, pixelY + size - 5)
        resourceIndex++
      }
    }
  }

  // Highlight selected tile
  if (props.selectedTile && props.selectedTile.x === x && props.selectedTile.y === y) {
    ctx.strokeStyle = '#FFD700'
    ctx.lineWidth = 3
    ctx.strokeRect(pixelX, pixelY, size, size)
  }

  // Highlight hovered tile
  if (hoveredTile.value && hoveredTile.value.x === x && hoveredTile.value.y === y) {
    ctx.strokeStyle = '#FF6B6B'
    ctx.lineWidth = 2
    ctx.strokeRect(pixelX, pixelY, size, size)
  }
}

const drawGrid = (ctx, size, startX, startY, endX, endY) => {
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.2)'
  ctx.lineWidth = 1

  // Vertical lines
  for (let x = startX; x <= endX; x++) {
    const pixelX = x * size + offsetX.value
    ctx.beginPath()
    ctx.moveTo(pixelX, startY * size + offsetY.value)
    ctx.lineTo(pixelX, endY * size + offsetY.value)
    ctx.stroke()
  }

  // Horizontal lines
  for (let y = startY; y <= endY; y++) {
    const pixelY = y * size + offsetY.value
    ctx.beginPath()
    ctx.moveTo(startX * size + offsetX.value, pixelY)
    ctx.lineTo(endX * size + offsetX.value, pixelY)
    ctx.stroke()
  }
}

// Event handlers
const handleCanvasClick = (event) => {
  const rect = canvas.value.getBoundingClientRect()
  const x = event.clientX - rect.left
  const y = event.clientY - rect.top

  const tileX = Math.floor((x - offsetX.value) / (tileSize.value * zoom.value))
  const tileY = Math.floor((y - offsetY.value) / (tileSize.value * zoom.value))

  if (currentMap.value[tileX] && currentMap.value[tileX][tileY]) {
    const tile = currentMap.value[tileX][tileY]
    emit('tile-clicked', { tile, x: tileX, y: tileY })
  }
}

const handleMouseMove = (event) => {
  if (isDragging.value) {
    const deltaX = event.clientX - lastMouseX.value
    const deltaY = event.clientY - lastMouseY.value
    
    offsetX.value += deltaX
    offsetY.value += deltaY
    
    lastMouseX.value = event.clientX
    lastMouseY.value = event.clientY
    
    drawMap()
  } else {
    // Handle tile hover
    const rect = canvas.value.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top

    const tileX = Math.floor((x - offsetX.value) / (tileSize.value * zoom.value))
    const tileY = Math.floor((y - offsetY.value) / (tileSize.value * zoom.value))

    if (currentMap.value[tileX] && currentMap.value[tileX][tileY]) {
      hoveredTile.value = currentMap.value[tileX][tileY]
      showTooltip.value = true
      tooltipX.value = event.clientX - rect.left + 10
      tooltipY.value = event.clientY - rect.top - 10
    } else {
      hoveredTile.value = null
      showTooltip.value = false
    }
    
    drawMap()
  }
}

const handleMouseDown = (event) => {
  isDragging.value = true
  lastMouseX.value = event.clientX
  lastMouseY.value = event.clientY
  canvas.value.style.cursor = 'grabbing'
}

const handleMouseUp = () => {
  isDragging.value = false
  canvas.value.style.cursor = 'grab'
}

const handleMouseLeave = () => {
  isDragging.value = false
  hoveredTile.value = null
  showTooltip.value = false
  canvas.value.style.cursor = 'grab'
  drawMap()
}

const handleWheel = (event) => {
  event.preventDefault()
  
  const rect = canvas.value.getBoundingClientRect()
  const mouseX = event.clientX - rect.left
  const mouseY = event.clientY - rect.top
  
  const oldZoom = zoom.value
  const zoomFactor = event.deltaY > 0 ? 0.9 : 1.1
  const newZoom = Math.max(minZoom, Math.min(maxZoom, zoom.value * zoomFactor))
  
  if (newZoom !== zoom.value) {
    zoom.value = newZoom
    
    // Adjust offset to zoom towards mouse position
    const zoomChange = zoom.value / oldZoom
    offsetX.value = mouseX - (mouseX - offsetX.value) * zoomChange
    offsetY.value = mouseY - (mouseY - offsetY.value) * zoomChange
    
    drawMap()
  }
}

// Control functions
const zoomIn = () => {
  if (zoom.value < maxZoom) {
    zoom.value = Math.min(maxZoom, zoom.value * 1.2)
    drawMap()
  }
}

const zoomOut = () => {
  if (zoom.value > minZoom) {
    zoom.value = Math.max(minZoom, zoom.value / 1.2)
    drawMap()
  }
}

const centerMap = () => {
  offsetX.value = (canvas.value.width - currentMap.value.length * tileSize.value * zoom.value) / 2
  offsetY.value = (canvas.value.height - (currentMap.value[0]?.length || 0) * tileSize.value * zoom.value) / 2
  drawMap()
}

// Resize handler
const resizeCanvas = () => {
  if (canvas.value && mapContainer.value) {
    const container = mapContainer.value
    canvas.value.width = container.clientWidth
    canvas.value.height = container.clientHeight
    drawMap()
  }
}

// Lifecycle
onMounted(() => {
  nextTick(() => {
    resizeCanvas()
    centerMap()
    window.addEventListener('resize', resizeCanvas)
  })
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeCanvas)
})

// Watch for map changes
watch(() => props.map, (newMap) => {
  if (newMap && newMap.length > 0) {
    currentMap.value = newMap
    drawMap()
  }
}, { deep: true })

watch(() => props.selectedTile, () => {
  drawMap()
}, { deep: true })
</script>

<style scoped>
.game-map {
  background: #1a1a1a;
  border-radius: 12px;
  overflow: hidden;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  height: 100%;
  display: flex;
  flex-direction: column;
}

.map-header {
  background: linear-gradient(135deg, #2c3e50 0%, #34495e 100%);
  color: white;
  padding: 15px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-bottom: 2px solid rgba(255, 255, 255, 0.1);
}

.map-header h3 {
  margin: 0;
  font-size: 1.2em;
}

.map-controls {
  display: flex;
  gap: 10px;
  align-items: center;
}

.map-controls button {
  background: rgba(255, 255, 255, 0.1);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: white;
  padding: 5px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 0.9em;
  transition: all 0.3s ease;
}

.map-controls button:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.2);
}

.map-controls button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.zoom-level {
  color: #bdc3c7;
  font-size: 0.9em;
  min-width: 50px;
  text-align: center;
}

.map-container {
  flex: 1;
  position: relative;
  overflow: hidden;
}

canvas {
  display: block;
  width: 100%;
  height: 100%;
  cursor: grab;
}

.tile-tooltip {
  position: absolute;
  background: rgba(0, 0, 0, 0.9);
  color: white;
  padding: 10px;
  border-radius: 6px;
  font-size: 0.9em;
  max-width: 200px;
  z-index: 1000;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.tooltip-header {
  margin-bottom: 8px;
  padding-bottom: 5px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.2);
}

.tooltip-content > div {
  margin: 5px 0;
}

.terrain-info {
  display: flex;
  align-items: center;
  gap: 5px;
}

.terrain-icon {
  font-size: 1.2em;
}

.resources-list {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 3px;
}

.resource-item {
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 5px;
  border-radius: 3px;
  font-size: 0.8em;
}

.city-info, .army-info, .owner-info {
  margin-top: 5px;
}

.map-legend {
  background: #2c3e50;
  color: white;
  padding: 15px;
  display: flex;
  gap: 30px;
  flex-wrap: wrap;
  border-top: 2px solid rgba(255, 255, 255, 0.1);
}

.legend-section h4 {
  margin: 0 0 10px 0;
  font-size: 1em;
  color: #ecf0f1;
}

.legend-items {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 0.9em;
  color: #bdc3c7;
}

.terrain-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  border: 1px solid rgba(255, 255, 255, 0.3);
}

@media (max-width: 768px) {
  .map-header {
    flex-direction: column;
    gap: 10px;
  }
  
  .map-controls {
    flex-wrap: wrap;
  }
  
  .map-legend {
    flex-direction: column;
    gap: 15px;
  }
}
</style> 