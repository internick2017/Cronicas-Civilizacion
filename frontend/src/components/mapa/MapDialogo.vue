<!-- frontend/src/components/mapa/MapDialogo.vue -->
<script setup>
import { watch, onUnmounted } from 'vue'

const props = defineProps({
  titulo: { type: String, default: '' },
  abierto: { type: Boolean, default: false }
})
const emit = defineEmits(['cerrar'])

// Escape cierra el dialogo desde cualquier punto (no solo con el overlay
// enfocado): se escucha en window mientras esta abierto, y se limpia al
// cerrarse o desmontarse para no dejar listeners colgados.
const onKeydown = (evento) => {
  if (evento.key === 'Escape') emit('cerrar')
}

watch(
  () => props.abierto,
  (abierto) => {
    if (abierto) window.addEventListener('keydown', onKeydown)
    else window.removeEventListener('keydown', onKeydown)
  },
  { immediate: true }
)

onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div v-if="abierto" class="dialogo-overlay" @click.self="$emit('cerrar')">
    <div class="dialogo">
      <h3 v-if="titulo">{{ titulo }}</h3>
      <slot />
      <button class="btn-secundario cerrar" @click="$emit('cerrar')">Cancelar</button>
    </div>
  </div>
</template>

<style scoped>
.dialogo-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgba(0, 0, 0, 0.6);
  display: flex; align-items: center; justify-content: center;
}
.dialogo {
  background: #2c3e50; border-radius: 12px; padding: 1.5rem;
  min-width: 280px; max-width: 90vw; max-height: 85vh; overflow-y: auto;
  color: #ecf0f1; display: flex; flex-direction: column; gap: 0.5rem;
}
.dialogo h3 { margin: 0 0 0.5rem; }
.btn-secundario {
  background: rgba(255, 255, 255, 0.1); color: #ecf0f1;
  border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 6px;
  padding: 0.5rem 0.8rem; cursor: pointer; text-align: left;
}
.btn-secundario:hover:not(:disabled) { background: rgba(255, 255, 255, 0.2); }
.btn-secundario:disabled { opacity: 0.45; cursor: not-allowed; }
.cerrar { text-align: center; margin-top: 0.5rem; }
</style>
