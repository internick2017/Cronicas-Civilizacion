<!-- frontend/src/components/mapa/MapActionBar.vue -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  vista: { type: Object, required: true },
  jugadorId: { type: String, required: true }
})
const emit = defineEmits(['terminar-turno'])

const esMiTurno = computed(() =>
  props.vista.jugadores[props.vista.indiceJugadorActual]?.id === props.jugadorId
)
</script>

<template>
  <div class="action-bar">
    <button class="btn-primary" :disabled="!esMiTurno" @click="emit('terminar-turno')">
      {{ esMiTurno ? 'Terminar turno' : 'No es tu turno' }}
    </button>
  </div>
</template>

<style scoped>
.action-bar {
  display: flex;
  gap: 0.75rem;
  padding: 0.75rem;
}

.btn-primary {
  background: linear-gradient(45deg, #27ae60, #2ecc71);
  color: white;
  border: none;
  border-radius: 6px;
  padding: 0.6rem 1.2rem;
  cursor: pointer;
  font-weight: bold;
}

.btn-primary:disabled {
  background: rgba(255, 255, 255, 0.1);
  color: #bdc3c7;
  cursor: not-allowed;
}
</style>
