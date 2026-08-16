<!-- frontend/src/components/mapa/MapPlayerPanel.vue -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  vista: { type: Object, required: true },
  jugadorId: { type: String, required: true }
})

const jugadorActual = computed(() => props.vista.jugadores[props.vista.indiceJugadorActual])
const yo = computed(() => props.vista.jugadores.find(j => j.id === props.jugadorId))

// Emoji viejos a proposito: 🪵 (madera) y 🪨 (piedra) son de Emoji 13 (2020) y la
// fuente de Windows 10 no los trae, asi que salian como el cuadradito de glifo
// faltante. Los de aca son de Emoji 6.0 o anteriores, presentes en todos lados.
const RECURSOS_ICONOS = {
  food: '🌾', gold: '💰', wood: '🌲', stone: '⛰️', science: '🔬', culture: '🎭'
}
</script>

<template>
  <div class="player-panel">
    <div class="turno-actual">
      Turno {{ vista.turno }} — <strong>{{ jugadorActual?.nombre }}</strong>
      <span v-if="jugadorActual?.id === jugadorId" class="tu-turno">(tu turno)</span>
    </div>

    <div v-if="yo?.recursos" class="recursos">
      <span v-for="(cantidad, recurso) in yo.recursos" :key="recurso" class="recurso">
        {{ RECURSOS_ICONOS[recurso] || recurso }} {{ cantidad }}
      </span>
    </div>

    <ul class="jugadores-lista">
      <li v-for="j in vista.jugadores" :key="j.id" :class="{ activo: j.id === jugadorActual?.id }">
        {{ j.nombre }} ({{ j.civilizacion }}) <span v-if="!j.activo">— eliminado</span>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.player-panel {
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  padding: 1rem;
  color: #ecf0f1;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.tu-turno {
  color: #2ecc71;
}

.recursos {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  font-size: 0.9rem;
}

.jugadores-lista {
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: 0.85rem;
  color: #bdc3c7;
}

.jugadores-lista .activo {
  color: #3498db;
  font-weight: bold;
}
</style>
