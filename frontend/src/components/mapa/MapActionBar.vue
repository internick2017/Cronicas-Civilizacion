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

// Quien perdio el poder no juega sus turnos: los juega la maquina. El boton se
// vuelve "Esperar" y SIEMPRE esta habilitado, aunque el turno este parado en
// otro: es lo que hace seguir la partida (el backend lo trata como pasar).
const sinPoder = computed(() =>
  props.vista.jugadores.find(j => j.id === props.jugadorId)?.enPoder === false
)
const habilitado = computed(() => sinPoder.value || esMiTurno.value)
const texto = computed(() => {
  if (sinPoder.value) return 'Esperar (la máquina juega por vos)'
  return esMiTurno.value ? 'Terminar turno' : 'No es tu turno'
})
</script>

<template>
  <div class="action-bar">
    <button class="btn-primary" :disabled="!habilitado" @click="emit('terminar-turno')">
      {{ texto }}
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
