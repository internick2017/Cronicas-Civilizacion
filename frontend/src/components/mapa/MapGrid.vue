<!-- frontend/src/components/mapa/MapGrid.vue -->
<script setup>
import MapTile from './MapTile.vue'

defineProps({
  mapa: { type: Array, required: true },
  tamanoMapa: { type: Number, required: true },
  jugadorId: { type: String, required: true }
})
const emit = defineEmits(['click-tile'])
</script>

<template>
  <div
    class="map-grid"
    :style="{ gridTemplateColumns: `repeat(${tamanoMapa}, minmax(24px, 1fr))` }"
  >
    <MapTile
      v-for="tile in mapa"
      :key="`${tile.x}-${tile.y}`"
      :tile="tile"
      :es-propio="tile.dueno === jugadorId"
      @click-tile="emit('click-tile', $event)"
    />
  </div>
</template>

<style scoped>
.map-grid {
  display: grid;
  gap: 1px;
  background: #000;
  border: 1px solid rgba(255, 255, 255, 0.15);
  max-height: 70vh;
  max-width: 100%;
  overflow: auto;
}
</style>
