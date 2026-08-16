<!-- frontend/src/components/mapa/MapPlayerPanel.vue -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  vista: { type: Object, required: true },
  jugadorId: { type: String, required: true }
})

const jugadorActual = computed(() => props.vista.jugadores[props.vista.indiceJugadorActual])
const yo = computed(() => props.vista.jugadores.find(j => j.id === props.jugadorId))

const NOMBRE_RECURSO = {
  food: 'Comida', gold: 'Oro', wood: 'Madera',
  stone: 'Piedra', science: 'Ciencia', culture: 'Cultura'
}

// Lo que rinde cada recurso al cerrar el turno. Lo calcula el backend con la
// MISMA funcion que despues suma los recursos (ver reglas/turnos.js), para que
// lo prometido y lo entregado no puedan separarse.
const rinde = (recurso) => yo.value?.produccion?.[recurso] ?? 0

const tituloRecurso = (recurso) => {
  const nombre = NOMBRE_RECURSO[recurso] || recurso
  const porTurno = rinde(recurso)
  return porTurno
    ? `${nombre}: +${porTurno} por turno`
    : `${nombre}: no estás produciendo (solo rinde con ciudades y edificios que lo generen)`
}

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
      <span
        v-for="(cantidad, recurso) in yo.recursos"
        :key="recurso"
        class="recurso"
        :title="tituloRecurso(recurso)"
      >
        {{ RECURSOS_ICONOS[recurso] || recurso }} {{ cantidad }}
        <!-- El rendimiento por turno importa tanto como el stock: sin el no se
             puede saber si juntar para una ciudad lleva dos turnos o quince.
             El cero se marca distinto porque suele ser un problema (madera y
             piedra solo rinden si fundaste sobre bosque o montana). -->
        <small :class="['rinde', { nada: !rinde(recurso) }]">
          {{ rinde(recurso) ? `+${rinde(recurso)}` : '+0' }}
        </small>
      </span>
    </div>

    <ul class="jugadores-lista">
      <li v-for="j in vista.jugadores" :key="j.id" :class="{ activo: j.id === jugadorActual?.id }">
        <span v-if="j.esBot" title="Jugador controlado por la máquina">🤖</span>
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

.rinde {
  color: #2ecc71;
  font-size: 0.75rem;
  margin-left: 0.15rem;
}

/* Un +0 en verde se lee como "todo bien"; en gris apagado se lee como lo que
   es: ese recurso no esta entrando. */
.rinde.nada { color: #7f8c8d; }

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
