<!-- frontend/src/components/mapa/MapVictory.vue -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  vista: { type: Object, required: true },
  jugadorId: { type: String, required: true }
})
defineEmits(['salir'])

// vista.ganador es { jugadorId, tipoVictoria, turno } o null (nadie quedo en pie).
const NOMBRE_VICTORIA = {
  dominacion: 'dominación',
  ultimo_en_pie: 'ser el último en pie'
}

const ganador = computed(() =>
  props.vista.jugadores.find(j => j.id === props.vista.ganador?.jugadorId) || null
)
const gane = computed(() => props.vista.ganador?.jugadorId === props.jugadorId)
const motivoVictoria = computed(() => {
  const tipo = props.vista.ganador?.tipoVictoria
  return NOMBRE_VICTORIA[tipo] || tipo || 'una victoria decisiva'
})
</script>

<template>
  <div class="victoria-overlay">
    <div class="victoria">
      <h2 v-if="gane">Victoria</h2>
      <h2 v-else-if="ganador">Derrota</h2>
      <h2 v-else>Partida terminada</h2>

      <p v-if="ganador" class="detalle">
        <strong>{{ ganador.nombre }}</strong> se impuso por {{ motivoVictoria }}.
      </p>
      <p v-else class="detalle">Nadie quedó en pie.</p>

      <ul class="jugadores">
        <li v-for="j in vista.jugadores" :key="j.id">
          {{ j.nombre }}
          <span v-if="!j.activo" class="eliminado">eliminado</span>
          <span v-if="j.id === vista.ganador?.jugadorId" class="corona">ganador</span>
        </li>
      </ul>

      <button class="btn-primary" @click="$emit('salir')">Volver al inicio</button>
    </div>
  </div>
</template>

<style scoped>
.victoria-overlay {
  position: fixed; inset: 0; z-index: 2000;
  background: rgba(0, 0, 0, 0.8);
  display: flex; align-items: center; justify-content: center;
}
.victoria {
  background: #2c3e50; border-radius: 12px; padding: 2rem;
  min-width: 320px; text-align: center; color: #ecf0f1;
}
.victoria h2 { margin: 0 0 0.5rem; font-size: 2rem; }
.detalle { opacity: 0.85; }
.jugadores { list-style: none; padding: 0; margin: 1rem 0; text-align: left; }
.jugadores li { padding: 0.3rem 0; border-bottom: 1px solid rgba(255,255,255,0.08); }
.eliminado { opacity: 0.5; font-size: 0.8rem; margin-left: 0.4rem; }
.corona { color: #f1c40f; font-size: 0.8rem; margin-left: 0.4rem; }
.btn-primary {
  background: #3498db; color: #fff; border: 0; border-radius: 6px;
  padding: 0.6rem 1.2rem; cursor: pointer; font-size: 1rem;
}
</style>
