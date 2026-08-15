<!-- frontend/src/components/mapa/MapRoundLog.vue -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  narrativas: { type: Array, default: () => [] }
})

// La mas reciente arriba: es la que el jugador quiere leer.
const ordenadas = computed(() => [...props.narrativas].reverse())
</script>

<template>
  <aside class="round-log">
    <h3>Crónica</h3>
    <p v-if="ordenadas.length === 0" class="vacio">
      Todavía no pasó nada digno de contarse.
    </p>
    <article
      v-for="(entrada, i) in ordenadas"
      :key="entrada.ronda"
      :class="['entrada', { reciente: i === 0 }]"
    >
      <span class="ronda">Ronda {{ entrada.ronda }}</span>
      <p>{{ entrada.texto }}</p>
    </article>
  </aside>
</template>

<style scoped>
.round-log {
  background: rgba(0, 0, 0, 0.25);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  max-height: 30vh;
  overflow-y: auto;
}
.round-log h3 { margin: 0 0 0.5rem; font-size: 0.95rem; color: #f1c40f; }
.vacio { opacity: 0.6; font-style: italic; margin: 0; }
.entrada { border-left: 2px solid rgba(255, 255, 255, 0.15); padding-left: 0.6rem; margin-bottom: 0.6rem; }
.entrada.reciente { border-left-color: #f1c40f; }
.entrada p { margin: 0.15rem 0 0; line-height: 1.4; }
.ronda { font-size: 0.75rem; opacity: 0.65; text-transform: uppercase; letter-spacing: 0.05em; }
</style>
