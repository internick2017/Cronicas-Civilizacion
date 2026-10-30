<!-- frontend/src/components/mapa/MapDialogo.vue -->
<script setup>
import { nextTick, ref, watch, onUnmounted } from 'vue'

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

const dialogo = ref(null)

watch(
  () => props.abierto,
  (abierto) => {
    if (abierto) {
      window.addEventListener('keydown', onKeydown)
      // Con teclado o lector de pantalla, el foco tiene que entrar al dialogo.
      nextTick(() => dialogo.value?.focus())
    } else window.removeEventListener('keydown', onKeydown)
  },
  { immediate: true }
)

onUnmounted(() => window.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div v-if="abierto" class="dialogo-overlay" @click.self="$emit('cerrar')">
    <div ref="dialogo" class="dialogo" role="dialog" aria-modal="true" :aria-label="titulo" tabindex="-1">
      <!-- Pegada arriba: en un dialogo largo (el manual) el boton de abajo queda
           a varias pantallas de distancia, y en un celular no hay tecla Escape. -->
      <div class="cabecera">
        <h3>{{ titulo }}</h3>
        <button class="cerrar-x" aria-label="Cerrar" title="Cerrar" @click="$emit('cerrar')">✕</button>
      </div>
      <slot />
      <button class="btn-secundario cerrar" @click="$emit('cerrar')">Cancelar</button>
    </div>
  </div>
</template>

<style scoped>
.dialogo-overlay {
  position: fixed; inset: 0; z-index: 1000;
  background: rgb(var(--t-sombra) / 0.6);
  display: flex; align-items: center; justify-content: center;
}
.dialogo {
  background: rgb(var(--t-panel)); border-radius: calc(var(--t-radio) * 12px); padding: 1.5rem;
  min-width: 280px; max-width: 90vw; max-height: 85vh; overflow-y: auto;
  color: rgb(var(--t-texto)); display: flex; flex-direction: column; gap: 0.5rem;
  outline: none;
}
.cabecera {
  position: sticky; top: -1.5rem; z-index: 1;
  margin: -1.5rem -1.5rem 0; padding: 0.75rem 0.75rem 0.75rem 1.5rem;
  background: rgb(var(--t-panel)); border-bottom: 1px solid rgb(var(--t-tinta) / 0.1);
  display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
}
.cabecera h3 { margin: 0; }
.cerrar-x {
  flex: none; width: 44px; height: 44px; border-radius: 50%;
  background: rgb(var(--t-tinta) / 0.1); color: rgb(var(--t-texto));
  border: 1px solid rgb(var(--t-tinta) / 0.15); font-size: 1.1rem; cursor: pointer;
}
.cerrar-x:hover { background: rgb(var(--t-tinta) / 0.2); }
.btn-secundario {
  background: rgb(var(--t-tinta) / 0.1); color: rgb(var(--t-texto));
  border: 1px solid rgb(var(--t-tinta) / 0.15); border-radius: calc(var(--t-radio) * 6px);
  padding: 0.5rem 0.8rem; min-height: 44px; cursor: pointer; text-align: left;
}
.btn-secundario:hover:not(:disabled) { background: rgb(var(--t-tinta) / 0.2); }
.btn-secundario:disabled { opacity: 0.45; cursor: not-allowed; }
.cerrar { text-align: center; margin-top: 0.5rem; }
</style>
