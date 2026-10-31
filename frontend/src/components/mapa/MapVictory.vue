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
  ultimo_en_pie: 'ser el último en pie',
  limite_rondas: 'tener más territorio al llegar al límite de rondas',
  sin_humanos: 'quedar con más territorio cuando no quedó ningún jugador humano'
}

const ganador = computed(() =>
  props.vista.jugadores.find(j => j.id === props.vista.ganador?.jugadorId) || null
)
// Los aliados ganan juntos: `jugadorId` es el que mas territorio tenia y el resto viaja en `aliados`.
const ganadores = computed(() => {
  const g = props.vista.ganador
  return g ? [g.jugadorId, ...(g.aliados ?? [])] : []
})
const nombresGanadores = computed(() =>
  ganadores.value.map(id => props.vista.jugadores.find(j => j.id === id)?.nombre ?? id).join(', ')
)
const gane = computed(() => ganadores.value.includes(props.jugadorId))
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
        <template v-if="ganadores.length > 1">La alianza de <strong>{{ nombresGanadores }}</strong> se impuso</template>
        <template v-else><strong>{{ ganador.nombre }}</strong> se impuso</template>
        por {{ motivoVictoria }}.
      </p>
      <p v-else class="detalle">Nadie quedó en pie.</p>

      <ul class="jugadores">
        <li v-for="j in vista.jugadores" :key="j.id">
          {{ j.nombre }}
          <span v-if="!j.activo" class="eliminado">eliminado</span>
          <span v-if="ganadores.includes(j.id)" class="corona">ganador</span>
        </li>
      </ul>

      <button class="btn-primary" @click="$emit('salir')">Volver al inicio</button>
    </div>
  </div>
</template>

<style scoped>
.victoria-overlay {
  position: fixed; inset: 0; z-index: 2000;
  background: rgb(var(--t-sombra) / 0.8);
  display: flex; align-items: center; justify-content: center;
}
.victoria {
  background: rgb(var(--t-panel)); border-radius: calc(var(--t-radio) * 12px); padding: 2rem;
  min-width: 320px; text-align: center; color: rgb(var(--t-texto));
}
.victoria h2 { margin: 0 0 0.5rem; font-size: 2rem; }
.detalle { opacity: 0.85; }
.jugadores { list-style: none; padding: 0; margin: 1rem 0; text-align: left; }
.jugadores li { padding: 0.3rem 0; border-bottom: 1px solid rgb(var(--t-tinta) / 0.08); }
.eliminado { opacity: 0.5; font-size: 0.8rem; margin-left: 0.4rem; }
.corona { color: rgb(var(--t-aviso)); font-size: 0.8rem; margin-left: 0.4rem; }
.btn-primary {
  background: rgb(var(--t-cta)); color: rgb(var(--t-sobre-cta)); border: 0; border-radius: calc(var(--t-radio) * 6px);
  padding: 0.6rem 1.2rem; cursor: pointer; font-size: 1rem;
}
</style>
