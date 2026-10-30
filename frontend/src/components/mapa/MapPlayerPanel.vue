<!-- frontend/src/components/mapa/MapPlayerPanel.vue -->
<script setup>
import { computed, ref } from 'vue'
import { esSimultaneo, puedeJugar, yaTermino } from './turno.js'
import { aliadosDe } from './alianzas.js'
import { colorCssDeJugador } from '../../mapa/sprites.js'

const props = defineProps({
  vista: { type: Object, required: true },
  jugadorId: { type: String, required: true },
  // Reglas publicas (/api/map/constantes). Opcional: si todavia no cargaron, la
  // barra de dominacion cae al umbral por defecto en vez de desaparecer.
  constantes: { type: Object, default: null }
})

const emit = defineEmits(['sumar-maquina', 'renombrar-pais', 'elegir-tema'])
const simultaneo = computed(() => esSimultaneo(props.vista))
const jugadorActual = computed(() => props.vista.jugadores[props.vista.indiceJugadorActual])
// A quien se resalta en la lista: en secuencial, al que le toca; en simultaneo, a todo el que sigue jugando.
const estaJugando = (j) => puedeJugar(props.vista, j.id)
const misAliados = computed(() => aliadosDe(props.vista, props.jugadorId))
const termino = (j) => simultaneo.value && j.activo && yaTermino(props.vista, j.id)
const yo = computed(() => props.vista.jugadores.find(j => j.id === props.jugadorId))
// Solo tiene efecto en telefonos: ahi la lista arranca plegada para darle el alto al mapa.
const jugadoresAbiertos = ref(false)

// Renombrar el pais es gratis y no exige turno. El limite de largo es el del
// backend (LARGO_MAXIMO_NOMBRE_PAIS en reglas/pais.js): aca solo evita que el
// input deje escribir de mas, el backend vuelve a validar.
const LARGO_MAXIMO_NOMBRE_PAIS = 30
const puedeRenombrarPais = computed(() => Boolean(yo.value?.activo) && props.vista.estado !== 'terminado')
const editandoPais = ref(false)
const paisNuevo = ref('')
const abrirEdicionPais = () => {
  paisNuevo.value = yo.value?.civilizacion ?? ''
  editandoPais.value = true
}
const guardarPais = () => {
  const limpio = paisNuevo.value.trim()
  if (limpio && limpio !== yo.value?.civilizacion) emit('renombrar-pais', limpio)
  editandoPais.value = false
}

// Solo para la etiqueta al lado del bot: los datos de balance de cada
// dificultad (que hace mejor/peor) viven en el backend (/api/map/constantes),
// esto es puramente el texto de presentacion.
const NOMBRE_DIFICULTAD = { facil: 'fácil', normal: 'normal', dificil: 'difícil' }

// La raza de cada jugador sale de la vista (es publica); su nombre, icono y
// bonos, de las constantes del backend. Una partida vieja no la trae: no se muestra nada.
const razaDe = (jugador) => props.constantes?.razas?.find(r => r.tipo === jugador.raza) ?? null

const NOMBRE_RECURSO = {
  food: 'Comida', gold: 'Oro', wood: 'Madera',
  stone: 'Piedra', science: 'Ciencia', culture: 'Cultura'
}

// Lo que rinde cada recurso al cerrar el turno. Lo calcula el backend con la
// MISMA funcion que despues suma los recursos (ver reglas/turnos.js), para que
// lo prometido y lo entregado no puedan separarse.
const rinde = (recurso) => yo.value?.produccion?.[recurso] ?? 0

// El oro propio lleva el nombre y el simbolo de la moneda del jugador.
const moneda = computed(() => yo.value?.moneda ?? null)
const iconoRecurso = (recurso) =>
  (recurso === 'gold' && moneda.value ? moneda.value.simbolo : RECURSOS_ICONOS[recurso] || recurso)

const tituloRecurso = (recurso) => {
  const nombre = recurso === 'gold' && moneda.value ? moneda.value.nombre : NOMBRE_RECURSO[recurso] || recurso
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

// Solo los recursos que existen en el modo de esta partida (los dice el backend en vista.reglas).
const recursosVisibles = computed(() => {
  const activos = props.vista.reglas?.recursosActivos
  return Object.entries(yo.value?.recursos ?? {}).filter(([recurso]) => !activos || activos.includes(recurso))
})

const RECURSOS_ICONOS = {
  food: '🌾', gold: '💰', wood: '🌲', stone: '⛰️', science: '🔬', culture: '🎭'
}
</script>

<template>
  <div class="player-panel">
    <div class="turno-actual">
      <button class="btn-tema" title="Apariencia" aria-label="Apariencia" @click="emit('elegir-tema')">🎨</button>
      <button class="btn-jugadores" :aria-expanded="jugadoresAbiertos" aria-label="Jugadores" @click="jugadoresAbiertos = !jugadoresAbiertos">
        👥 {{ vista.jugadores.length }}
      </button>
      Ronda {{ vista.turno }}<span v-if="limiteRondas" class="limite"> / {{ limiteRondas }}</span>
      <template v-if="simultaneo">
        — <strong>juegan todos</strong>
        <span v-if="puedeJugar(vista, jugadorId)" class="tu-turno">(te falta terminar)</span>
      </template>
      <template v-else>
        — <strong>{{ jugadorActual?.nombre }}</strong>
        <span v-if="jugadorActual?.id === jugadorId" class="tu-turno">(tu turno)</span>
      </template>
    </div>

    <div v-if="yo?.recursos" class="recursos">
      <span
        v-for="[recurso, cantidad] in recursosVisibles"
        :key="recurso"
        class="recurso"
        :title="tituloRecurso(recurso)"
      >
        {{ iconoRecurso(recurso) }} {{ cantidad }}
        <!-- El rendimiento por turno importa tanto como el stock: sin el no se
             puede saber si juntar para una ciudad lleva dos turnos o quince.
             El cero se marca distinto porque suele ser un problema (madera y
             piedra solo rinden si fundaste sobre bosque o montana). -->
        <small :class="['rinde', { nada: !rinde(recurso) }]">
          {{ rinde(recurso) ? `+${rinde(recurso)}` : '+0' }}
        </small>
      </span>
    </div>

    <div v-if="dominacion" class="dominacion" :title="`${misAliados.length ? 'Tu alianza controla' : 'Controlás'} ${dominacion.tiles} casillas de tierra. Se gana con el ${pct(metaDominacion)}% del mundo al que se puede llegar.`">
      <div class="dominacion-cabecera">
        <span>🏆 Dominación<template v-if="misAliados.length"> (tu alianza)</template></span>
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

    <div :class="['jugadores', { plegada: !jugadoresAbiertos }]">
    <ul class="jugadores-lista">
      <li v-for="j in vista.jugadores" :key="j.id" :class="{ activo: estaJugando(j) }">
        <span class="color-bando" :style="{ background: colorCssDeJugador(vista.jugadores, j.id) }" title="Su color en el mapa"></span>
        <span v-if="j.esBot" title="Jugador controlado por la máquina">🤖</span>
        {{ j.nombre }}<template v-if="j.civilizacion !== j.nombre"> ({{ j.civilizacion }})</template>
        <button
          v-if="j.id === jugadorId && puedeRenombrarPais && !editandoPais"
          class="btn-renombrar"
          title="Cambiar el nombre de tu país"
          aria-label="Cambiar el nombre de tu país"
          @click="abrirEdicionPais"
        >✏️</button>
        <span v-if="razaDe(j)" class="raza-badge" :title="razaDe(j).descripcion">{{ razaDe(j).icono }} {{ razaDe(j).nombre }}</span>
        <small v-if="j.esBot" class="dificultad-badge">{{ NOMBRE_DIFICULTAD[j.dificultadIA] || j.dificultadIA }}</small>
        <span v-if="misAliados.includes(j.id)" class="aliado" title="Son aliados: ganan juntos">🤝 aliado</span>
        <span v-if="!j.activo">— eliminado</span>
        <span v-else-if="termino(j)" class="listo" title="Ya terminó su turno">✔ terminó</span>
      </li>
    </ul>
    <form v-if="editandoPais" class="fila-pais" @submit.prevent="guardarPais">
      <input
        v-model="paisNuevo"
        class="entrada-pais"
        :maxlength="LARGO_MAXIMO_NOMBRE_PAIS"
        placeholder="Nombre de tu país"
        aria-label="Nombre de tu país"
        @keyup.esc="editandoPais = false"
      />
      <button type="submit" class="btn-sumar" :disabled="!paisNuevo.trim()">Guardar</button>
      <button type="button" class="btn-sumar" @click="editandoPais = false">Cancelar</button>
    </form>
    <button v-if="vista.estado === 'jugando'" class="btn-sumar" @click="$emit('sumar-maquina')">
      ➕ Sumar una máquina
    </button>
    </div>
  </div>
</template>

<style scoped>
/* Dos columnas: el panel se queda con poco alto y el resto va para el mapa. */
.player-panel {
  background: rgb(var(--t-tinta) / 0.05);
  border: 1px solid rgb(var(--t-tinta) / 0.1);
  border-radius: calc(var(--t-radio) * 12px);
  padding: 0.6rem 1rem;
  color: rgb(var(--t-texto));
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 24rem);
  column-gap: 1.5rem;
  row-gap: 0.35rem;
}

.turno-actual, .recursos, .dominacion { grid-column: 1; }

.jugadores {
  grid-column: 2;
  grid-row: 1 / span 3;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  min-width: 0;
}

.btn-jugadores {
  display: none;
  float: right;
  min-width: 44px;
  min-height: 44px;
  background: rgb(var(--t-tinta) / 0.08);
  color: rgb(var(--t-texto));
  border: 1px solid rgb(var(--t-tinta) / 0.2);
  border-radius: calc(var(--t-radio) * 6px);
  font-size: 0.85rem;
  cursor: pointer;
}

.btn-tema {
  float: right;
  margin-left: 0.3rem;
  min-width: 32px;
  min-height: 32px;
  background: rgb(var(--t-tinta) / 0.08);
  border: 1px solid rgb(var(--t-tinta) / 0.2);
  border-radius: calc(var(--t-radio) * 6px);
  cursor: pointer;
}

.tu-turno {
  color: rgb(var(--t-exito));
  margin-left: 0.35rem;
}

.limite {
  color: rgb(var(--t-alerta));
}

.recursos {
  display: flex;
  gap: 0.75rem;
  flex-wrap: wrap;
  font-size: 0.85rem;
}

.rinde {
  color: rgb(var(--t-exito));
  font-size: 0.75rem;
  margin-left: 0.15rem;
}

/* Un +0 en verde se lee como "todo bien"; en gris apagado se lee como lo que
   es: ese recurso no esta entrando. */
.rinde.nada { color: rgb(var(--t-texto-tenue)); }

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

.dominacion-cabecera .cerca { color: rgb(var(--t-aviso)); }

.barra {
  height: 6px;
  border-radius: calc(var(--t-radio) * 3px);
  background: rgb(var(--t-tinta) / 0.12);
  overflow: hidden;
}

.barra-llena {
  height: 100%;
  background: linear-gradient(90deg, rgb(var(--t-exito-fuerte)), rgb(var(--t-aviso)));
  transition: width 0.4s ease;
}

.aviso-rival {
  margin: 0;
  font-size: 0.75rem;
  color: rgb(var(--t-alerta));
}

.jugadores-lista {
  list-style: none;
  padding: 0;
  margin: 0;
  font-size: 0.85rem;
  color: rgb(var(--t-texto-suave));
  max-height: 6rem;
  overflow-y: auto;
}

.jugadores-lista li { padding: 0.15rem 0; }

/* El mismo color con el que se pintan sus tropas, ciudades y frontera. El borde
   es para que el blanco y el gris oscuro se vean sobre el panel. */
.color-bando {
  display: inline-block;
  width: 0.9em;
  height: 0.9em;
  border-radius: calc(var(--t-radio) * 3px);
  border: 1px solid rgb(var(--t-tinta) / 0.6);
  margin-right: 0.35rem;
  vertical-align: -0.1em;
}

.dificultad-badge {
  opacity: 0.8;
  margin-left: 0.25rem;
  font-size: 0.75rem;
}

.raza-badge {
  margin-left: 0.25rem;
  font-size: 0.75rem;
  opacity: 0.85;
}

.btn-sumar {
  align-self: flex-start;
  background: rgb(var(--t-tinta) / 0.08);
  color: rgb(var(--t-texto));
  border: 1px solid rgb(var(--t-tinta) / 0.2);
  border-radius: calc(var(--t-radio) * 6px);
  padding: 0.4rem 0.7rem;
  min-height: 44px;
  font-size: 0.85rem;
  cursor: pointer;
}

.btn-sumar:hover { background: rgb(var(--t-tinta) / 0.16); }
.btn-sumar:disabled { opacity: 0.5; cursor: not-allowed; }

.btn-renombrar {
  background: none;
  border: none;
  padding: 0 0.3rem;
  min-height: 28px;
  cursor: pointer;
  font-size: 0.85rem;
}

.fila-pais {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.entrada-pais {
  flex: 1 1 10rem;
  min-height: 44px;
  padding: 0.3rem 0.5rem;
  border-radius: calc(var(--t-radio) * 6px);
  border: 1px solid rgb(var(--t-tinta) / 0.2);
  background: rgb(var(--t-sombra) / 0.25);
  color: rgb(var(--t-texto));
  font-size: 0.85rem;
}

.jugadores-lista .aliado {
  color: rgb(var(--t-aviso));
  margin-left: 0.25rem;
}

.jugadores-lista .listo {
  color: rgb(var(--t-exito));
  margin-left: 0.25rem;
}

.jugadores-lista .activo {
  color: rgb(var(--t-info));
  font-weight: bold;
}

@media (max-width: 640px), (pointer: coarse) {
  .btn-renombrar, .btn-tema { min-width: 44px; min-height: 44px; }
}

/* En el telefono el panel es una tira: ronda, recursos y dominacion. Los
   jugadores se abren con el boton. */
@media (max-width: 640px) {
  .player-panel { grid-template-columns: minmax(0, 1fr); padding: 0.4rem 0.6rem; border-radius: calc(var(--t-radio) * 8px); }
  .jugadores { grid-column: 1; grid-row: auto; }
  .jugadores.plegada { display: none; }
  .btn-jugadores { display: block; }
  .turno-actual { font-size: 0.85rem; min-height: 44px; }
  .recursos { gap: 0.25rem 0.6rem; }
}
</style>
