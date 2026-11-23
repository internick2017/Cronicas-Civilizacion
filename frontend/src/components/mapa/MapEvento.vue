<!-- Evento de ronda esperando la decision del jugador (mecanica elegible "eventos"). -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  evento: { type: Object, required: true }, // { tipo, ronda } (vista.jugadores[yo].eventoPendiente)
  eventosRonda: { type: Array, default: () => [] }, // constantes.eventosRonda
  recursos: { type: Object, required: true }
})
const emit = defineEmits(['responder'])

const NOMBRE_RECURSO = { food: 'comida', gold: 'oro', wood: 'madera', stone: 'piedra' }
const def = computed(() => props.eventosRonda.find(e => e.tipo === props.evento.tipo))
const texto = (cambio) => {
  const partes = Object.entries(cambio || {}).map(([r, c]) => `${c > 0 ? '+' : ''}${c} ${NOMBRE_RECURSO[r] || r}`)
  return partes.length ? partes.join(', ') : 'nada'
}
const puedePagar = computed(() =>
  Object.entries(def.value?.pagar || {}).every(([r, c]) => c >= 0 || (props.recursos[r] ?? 0) >= -c))
</script>

<template>
  <div v-if="def" class="evento">
    <strong>{{ def.nombre }}</strong>
    <span>Decidí antes de que cierre la próxima ronda; si no, se acepta.</span>
    <button :disabled="!puedePagar" @click="emit('responder', 'pagar')">Actuar ({{ texto(def.pagar) }})</button>
    <button @click="emit('responder', 'aceptar')">Aceptar ({{ texto(def.aceptar) }})</button>
  </div>
</template>

<style scoped>
.evento {
  position: fixed; top: 4.5rem; left: 50%; transform: translateX(-50%); z-index: 1500;
  display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; max-width: min(640px, 94vw);
  padding: 0.6rem 0.9rem; border-radius: calc(var(--t-radio) * 8px);
  background: rgb(var(--t-panel)); color: rgb(var(--t-texto)); border: 1px solid rgb(var(--t-aviso));
}
.evento span { font-size: 0.85rem; opacity: 0.8; flex-basis: 100%; }
.evento button {
  background: rgb(var(--t-cta)); color: rgb(var(--t-sobre-cta)); border: 0; cursor: pointer;
  border-radius: calc(var(--t-radio) * 6px); padding: 0.35rem 0.8rem;
}
.evento button:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
