<!-- frontend/src/components/mapa/MapTile.vue -->
<script setup>
const props = defineProps({
  tile: { type: Object, required: true },
  esPropio: { type: Boolean, default: false }
})
const emit = defineEmits(['click-tile'])

const COLOR_TERRENO = {
  plains: '#c9a86c',
  forest: '#2d5a3d',
  mountains: '#6b6b6b',
  desert: '#d9c07a',
  water: '#3a6ea5',
  hills: '#8a7a4b'
}

const colorTile = () => {
  if (!props.tile.descubierto) return '#1a1a1a'
  return COLOR_TERRENO[props.tile.terreno] || '#333'
}

const clasesTile = () => {
  if (!props.tile.descubierto) return 'tile tile-oculto'
  const clases = ['tile']
  if (props.tile.dueno && props.esPropio) clases.push('tile-propio')
  else if (props.tile.dueno) clases.push('tile-ajeno')
  return clases.join(' ')
}

const onClick = () => {
  if (!props.tile.descubierto) return
  emit('click-tile', { x: props.tile.x, y: props.tile.y })
}
</script>

<template>
  <div
    :class="clasesTile()"
    :style="{ backgroundColor: colorTile() }"
    :title="tile.descubierto ? `${tile.terreno}${tile.ciudad ? ' - ' + tile.ciudad.nombre : ''}` : ''"
    @click="onClick"
  >
    <span v-if="tile.descubierto && tile.ciudad" class="tile-icon">🏛️</span>
    <span v-else-if="tile.descubierto && tile.ejercito" class="tile-icon">⚔️</span>
  </div>
</template>

<style scoped>
.tile {
  aspect-ratio: 1;
  min-width: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: default;
  box-sizing: border-box;
}

.tile-oculto {
  cursor: default;
}

.tile-propio {
  cursor: pointer;
  outline: 2px solid #2ecc71;
  outline-offset: -2px;
}

.tile-ajeno {
  outline: 2px solid #e74c3c;
  outline-offset: -2px;
}

.tile-icon {
  font-size: 0.8em;
  pointer-events: none;
}
</style>
