<!-- frontend/src/components/mapa/MapPlayerPanel.vue -->
<script setup>
import { computed } from 'vue'

const props = defineProps({
  vista: { type: Object, required: true },
  jugadorId: { type: String, required: true },
  // Reglas publicas (/api/map/constantes). Opcional: si todavia no cargaron, la
  // barra de dominacion cae al umbral por defecto en vez de desaparecer.
  constantes: { type: Object, default: null }
})

const jugadorActual = computed(() => props.vista.jugadores[props.vista.indiceJugadorActual])
const yo = computed(() => props.vista.jugadores.find(j => j.id === props.jugadorId))

// Solo para la etiqueta al lado del bot: los datos de balance de cada
// dificultad (que hace mejor/peor) viven en el backend (/api/map/constantes),
// esto es puramente el texto de presentacion.
const NOMBRE_DIFICULTAD = { facil: 'fácil', normal: 'normal', dificil: 'difícil' }

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
// Progreso hacia la victoria territorial. El porcentaje lo calcula el backend con
// la MISMA funcion que decide la victoria (ver reglas/dominacion.js): la barra no
// puede desincronizarse del final de la partida.
const dominacion = computed(() => yo.value?.dominacion ?? null)
// El objetivo sale de la CONFIG DE ESTA PARTIDA, no de la constante global: se
// elige en el lobby, asi que una partida al 50% tiene que mostrar "/ 50%". Leer
// la constante haria que la barra mintiera en cualquier partida no estandar.
// Las constantes quedan solo como respaldo para partidas viejas sin el campo.
const metaDominacion = computed(() => {
  const deLaPartida = props.vista?.config?.porcentajeVictoria
  if (deLaPartida) return deLaPartida / 100
  return props.constantes?.porcentajeVictoriaDominacion ?? 0.6
})

// Rondas que faltan, si la partida tiene limite. Un limite invisible es una
// trampa: el jugador tiene que poder ver que se le acaba el tiempo.
const limiteRondas = computed(() => props.vista?.config?.limiteRondas ?? null)
const pct = (v) => Math.round(v * 100)
// La barra se llena al llegar a la META, no al 100% del mapa: si midiera sobre el
// mapa entero, estar a un paso de ganar se veria como media barra.
const avanceDominacion = computed(() => {
  if (!dominacion.value || metaDominacion.value <= 0) return 0
  return Math.min(100, (dominacion.value.porcentaje / metaDominacion.value) * 100)
})
// Rivales que ya son peligrosos. El backend manda el cuanto y nunca el donde, para
// no filtrar el mapa que todavia no exploraste.
const rivalesDominantes = computed(() => props.vista.dominacionRivales ?? [])

const RECURSOS_ICONOS = {
  food: '🌾', gold: '💰', wood: '🌲', stone: '⛰️', science: '🔬', culture: '🎭'
}
</script>

<template>
  <div class="player-panel">
    <div class="turno-actual">
      Turno {{ vista.turno }}<span v-if="limiteRondas" class="limite"> / {{ limiteRondas }}</span>
      — <strong>{{ jugadorActual?.nombre }}</strong>
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

    <div v-if="dominacion" class="dominacion" :title="`Controlás ${dominacion.tiles} de ${dominacion.totalTierra} casillas de tierra. Se gana con el ${pct(metaDominacion)}%.`">
      <div class="dominacion-cabecera">
        <span>🏆 Dominación</span>
        <strong :class="{ cerca: avanceDominacion >= 100 }">
          {{ pct(dominacion.porcentaje) }}% / {{ pct(metaDominacion) }}%
        </strong>
      </div>
      <div class="barra">
        <div class="barra-llena" :style="{ width: `${avanceDominacion}%` }"></div>
      </div>
      <p v-for="rival in rivalesDominantes" :key="rival.id" class="aviso-rival">
        ⚠️ {{ rival.civilizacion }} domina el {{ pct(rival.porcentaje) }}% del mundo
      </p>
    </div>

    <ul class="jugadores-lista">
      <li v-for="j in vista.jugadores" :key="j.id" :class="{ activo: j.id === jugadorActual?.id }">
        <span v-if="j.esBot" title="Jugador controlado por la máquina">🤖</span>
        {{ j.nombre }} ({{ j.civilizacion }})
        <small v-if="j.esBot" class="dificultad-badge">{{ NOMBRE_DIFICULTAD[j.dificultadIA] || j.dificultadIA }}</small>
        <span v-if="!j.activo">— eliminado</span>
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

.limite {
  color: #f39c12;
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

.dominacion {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.85rem;
}

.dominacion-cabecera {
  display: flex;
  justify-content: space-between;
}

.dominacion-cabecera .cerca { color: #f1c40f; }

.barra {
  height: 6px;
  border-radius: 3px;
  background: rgba(255, 255, 255, 0.12);
  overflow: hidden;
}

.barra-llena {
  height: 100%;
  background: linear-gradient(90deg, #27ae60, #f1c40f);
  transition: width 0.4s ease;
}

.aviso-rival {
  margin: 0;
  font-size: 0.78rem;
  color: #e67e22;
}

.jugadores-lista {
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: 0.85rem;
  color: #bdc3c7;
}

.dificultad-badge {
  opacity: 0.6;
  margin-left: 0.25rem;
}

.jugadores-lista .activo {
  color: #3498db;
  font-weight: bold;
}
</style>
