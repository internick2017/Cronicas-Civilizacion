<!-- frontend/src/components/mapa/MapTema.vue -->
<script setup>
import { TEMAS, tema, elegirTema } from '../../mapa/temas.js'
</script>

<template>
  <div class="temas" role="radiogroup" aria-label="Apariencia">
    <button
      v-for="t in TEMAS"
      :key="t.id"
      type="button"
      role="radio"
      :aria-checked="tema === t.id"
      :class="['tema', { elegido: tema === t.id }]"
      @click="elegirTema(t.id)"
    >
      <strong>{{ t.icono }} {{ t.nombre }}</strong>
      <small>{{ t.descripcion }}</small>
    </button>
  </div>
</template>

<style scoped>
.temas { display: flex; flex-direction: column; gap: 0.4rem; }
.tema {
  display: flex; flex-direction: column; gap: 0.1rem; text-align: left; min-height: 44px;
  padding: 0.5rem 0.8rem; cursor: pointer; font-size: 0.85rem;
  background: rgb(var(--t-tinta) / 0.06); color: rgb(var(--t-texto));
  border: 1px solid rgb(var(--t-tinta) / 0.2); border-radius: calc(var(--t-radio) * 8px);
}
.tema.elegido { border: 2px solid rgb(var(--t-exito)); background: rgb(var(--t-exito) / 0.14); }
small { font-size: 0.75rem; color: rgb(var(--t-texto-suave)); }
</style>
