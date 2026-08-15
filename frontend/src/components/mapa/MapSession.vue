<!-- frontend/src/components/mapa/MapSession.vue -->
<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useMapApi } from '../../composables/useMapApi.js'
import { useMapSocket } from '../../composables/useMapSocket.js'
import MapCanvas from './MapCanvas.vue'
import MapPlayerPanel from './MapPlayerPanel.vue'
import MapActionBar from './MapActionBar.vue'
import MapRoundLog from './MapRoundLog.vue'
import MapVictory from './MapVictory.vue'
import MapDialogo from './MapDialogo.vue'
import MapCiudadMenu from './MapCiudadMenu.vue'

const props = defineProps({
  partidaInicial: { type: Object, required: true }
})
const emit = defineEmits(['salir', 'error'])

const { accion, vista: pedirVista, obtenerConstantes } = useMapApi()
const { conectar, desconectar, unirseAPartida, onEstado, onNarrativa } = useMapSocket()

const id = props.partidaInicial.id
const jugadorId = props.partidaInicial.jugadorId
const token = props.partidaInicial.token
const vista = ref(props.partidaInicial.vista)

// La narrativa llega por dos caminos: el evento 'narrativa' (apenas se genera)
// y el campo 'narrativas' que viaja en el payload de 'estado' y en la vista
// pedida por REST. Los dos conviven por union (por numero de ronda) para no
// perder ni duplicar entradas, sin importar cual llegue primero.
const narrativas = ref(props.partidaInicial.vista?.narrativas || [])

const fusionarNarrativas = (actuales, entrantes) => {
  const porRonda = new Map(actuales.map((n) => [n.ronda, n]))
  for (const entrada of entrantes) {
    if (!porRonda.has(entrada.ronda)) porRonda.set(entrada.ronda, entrada)
  }
  return [...porRonda.values()].sort((a, b) => a.ronda - b.ronda)
}

const edificioMenuAbierto = ref(null) // {x, y} | null
const fundarAbierto = ref(null) // {x, y} | null
const nombreCiudad = ref('')
let pollEspera = null

// Reglas del juego (costos, stats). Vienen del backend para no duplicarlas.
const constantes = ref({ edificios: [], unidades: [], costoCiudad: {} })

const seleccion = ref(null)        // {x, y} del ejercito propio elegido
const ataqueAbierto = ref(null)    // {desde, hasta} | null

const tileEn = (x, y) => vista.value.mapa[y * vista.value.config.tamanoMapa + x]

const esMiTurno = computed(() =>
  vista.value.jugadores[vista.value.indiceJugadorActual]?.id === jugadorId
)

// Adyacentes ortogonales (Manhattan 1) que el backend va a aceptar. Replica
// las validaciones de `reglas/movimiento.js` y `reglas/combate.js` (distancia
// Manhattan === 1, movimientoRestante > 0, destino no acuatico, destino con
// objetivo enemigo real o libre) para no ofrecer acciones que van a ser
// rechazadas. La distincion entre mover y atacar NO se filtra aca: se
// resuelve en onClickTile, porque ambas acciones comparten las mismas
// casillas alcanzables (la unica diferencia es si hay un enemigo).
//
// IMPORTANTE: una casilla en niebla SI es alcanzable. `moverEjercito` no
// exige que el destino este descubierto; al contrario, mover hacia lo
// desconocido es el mecanismo de exploracion y de reclamo de territorio (la
// regla emite TerritorioDescubierto y TerritorioReclamado). Del backend una
// casilla no descubierta llega como {x, y, descubierto: false}: sin terreno,
// sin dueno, sin ciudad y sin ejercito. No se puede saber si es agua, y NO se
// adivina: inferir el terreno oculto filtraria al jugador informacion que la
// niebla debe ocultar. Se ofrece como candidata y decide el backend.
const alcanzables = computed(() => {
  if (!seleccion.value || !esMiTurno.value) return []
  const { x, y } = seleccion.value
  const origen = tileEn(x, y)
  if (!origen?.ejercito || origen.ejercito.dueno !== jugadorId || (origen.ejercito.movimientoRestante ?? 1) <= 0) {
    return []
  }

  return [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
    .filter(p => {
      const t = vista.value.config.tamanoMapa
      if (p.x < 0 || p.y < 0 || p.x >= t || p.y >= t) return false
      const tile = tileEn(p.x, p.y)
      if (!tile) return false
      // Niebla: sin datos para filtrar nada. Candidata (ver comentario arriba).
      if (!tile.descubierto) return true
      if (tile.terreno === 'water') return false
      // Un ejercito propio ya ocupando el destino: movimiento.js lo rechaza
      // con CASILLA_OCUPADA (y no es ataque, asi que tampoco es un objetivo
      // valido). No se ofrece como alcanzable.
      if (tile.ejercito && tile.ejercito.dueno === jugadorId) return false
      const ejercitoEnemigo = tile.ejercito && tile.ejercito.dueno !== jugadorId
      const ciudadEnemiga = tile.ciudad && tile.dueno !== jugadorId
      // Territorio enemigo (dueno de otro jugador) sin ejercito ni ciudad ahi:
      // movimiento.js lo rechaza con OBJETIVO_INVALIDO ("usa atacar"), pero
      // combate.js tambien lo rechaza (no hay objetivo real que atacar). No
      // hay ninguna accion que el backend acepte sobre esta casilla.
      if (tile.dueno && tile.dueno !== jugadorId && !ejercitoEnemigo && !ciudadEnemiga) return false
      return true
    })
})

// La seleccion se invalida sola cuando deja de tener sentido: cambio el turno
// (ya no puede actuar) o el ejercito que estaba seleccionado ya no esta en esa
// casilla (se movio, murio, o llego una vista nueva por socket). Sin esto el
// borde blanco queda pintado sobre la casilla durante el turno del rival hasta
// el proximo click.
watch(
  () => {
    if (!seleccion.value) return null
    const { x, y } = seleccion.value
    const tile = tileEn(x, y)
    return {
      miTurno: esMiTurno.value,
      hayEjercitoPropio: Boolean(tile?.ejercito && tile.ejercito.dueno === jugadorId)
    }
  },
  (estadoSeleccion) => {
    if (!estadoSeleccion) return
    if (!estadoSeleccion.miTurno || !estadoSeleccion.hayEjercitoPropio) {
      seleccion.value = null
      ataqueAbierto.value = null
    }
  }
)

const guardarSesion = () => {
  localStorage.setItem('cronicas-mapa-id', id)
  localStorage.setItem('cronicas-mapa-codigo', props.partidaInicial.codigo)
  localStorage.setItem('cronicas-mapa-jugadorId', jugadorId)
  localStorage.setItem('cronicas-mapa-token', token)
}

const limpiarSesion = () => {
  localStorage.removeItem('cronicas-mapa-id')
  localStorage.removeItem('cronicas-mapa-codigo')
  localStorage.removeItem('cronicas-mapa-jugadorId')
  localStorage.removeItem('cronicas-mapa-token')
}

const refrescarVista = async () => {
  vista.value = await pedirVista(id, jugadorId, token)
  if (vista.value.narrativas) narrativas.value = fusionarNarrativas(narrativas.value, vista.value.narrativas)
  return vista.value
}

// El backend NO emite por socket al iniciar la partida (solo lo hace en cada accion),
// asi que quien se unio con codigo se quedaria mirando el mapa cubierto por la niebla
// hasta que el anfitrion mueva. Mientras la partida siga en 'esperando' consultamos la
// vista cada 3s y cortamos apenas arranca; de ahi en mas el socket alcanza.
const vigilarInicio = () => {
  if (pollEspera || vista.value?.estado !== 'esperando') return
  pollEspera = setInterval(async () => {
    try {
      const actual = await refrescarVista()
      if (actual.estado !== 'esperando') detenerVigilancia()
    } catch {
      // error transitorio: el proximo tick reintenta
    }
  }, 3000)
}

const detenerVigilancia = () => {
  if (pollEspera) {
    clearInterval(pollEspera)
    pollEspera = null
  }
}

const ejecutarAccion = async (datosAccion) => {
  try {
    const resultado = await accion(id, jugadorId, token, datosAccion)
    vista.value = resultado.vista
  } catch (err) {
    emit('error', err.mensaje || 'No se pudo ejecutar la acción.')
  }
}

const onTerminarTurno = () => ejecutarAccion({ tipo: 'terminarTurno' })

// Mismo criterio que combate.js: hay objetivo enemigo solo si hay un
// ejercito ajeno o una ciudad ajena en la casilla (no alcanza con que el
// territorio sea de otro jugador: esas casillas ya se excluyen de
// alcanzables porque el backend tampoco acepta atacarlas).
const esEnemigo = (tile) =>
  (tile.ejercito && tile.ejercito.dueno !== jugadorId) ||
  (tile.ciudad && tile.dueno !== jugadorId)

const onClickTile = (posicion) => {
  const tile = tileEn(posicion.x, posicion.y)
  if (!tile || !tile.descubierto) return

  // 1. Con un ejercito seleccionado, un click en casilla alcanzable es una orden.
  if (seleccion.value) {
    const alcanzable = alcanzables.value.some(p => p.x === posicion.x && p.y === posicion.y)
    if (alcanzable) {
      const desde = { ...seleccion.value }
      if (esEnemigo(tile)) {
        ataqueAbierto.value = { desde, hasta: posicion }
      } else {
        seleccion.value = null
        ejecutarAccion({ tipo: 'moverEjercito', desde, hasta: posicion })
      }
      return
    }
    // Click fuera del alcance: se deselecciona y sigue el flujo normal.
    seleccion.value = null
  }

  // 2. Ejercito propio: seleccionar. Un ejercito sin movimiento restante NO
  // se selecciona: no tendria ninguna casilla alcanzable y quedaria marcado
  // sin poder hacer nada. Se avisa por que en vez de ignorar el click.
  if (tile.ejercito && tile.ejercito.dueno === jugadorId && esMiTurno.value) {
    if ((tile.ejercito.movimientoRestante ?? 1) <= 0) {
      emit('error', 'Ese ejército ya no tiene movimiento este turno.')
      return
    }
    seleccion.value = { x: posicion.x, y: posicion.y }
    return
  }

  // 3. Ciudad propia: menu de construir y reclutar.
  if (tile.ciudad && tile.dueno === jugadorId) {
    edificioMenuAbierto.value = posicion
    return
  }

  // 4. Casilla libre: fundar.
  if (!tile.ciudad && (tile.dueno === jugadorId || tile.dueno === null)) {
    nombreCiudad.value = ''
    fundarAbierto.value = posicion
  }
}

const confirmarAtaque = () => {
  if (!ataqueAbierto.value) return
  const { desde, hasta } = ataqueAbierto.value
  ataqueAbierto.value = null
  seleccion.value = null
  ejecutarAccion({ tipo: 'atacar', desde, hasta })
}

// Recursos propios y costo de fundar (vienen de GET /api/map/constantes, no
// se copia el numero: ver comentario en MapCiudadMenu.vue con el mismo criterio).
const recursosPropios = computed(() =>
  vista.value.jugadores.find(j => j.id === jugadorId)?.recursos || {}
)
const puedeFundar = computed(() => {
  const costo = constantes.value.costoCiudad || {}
  return Object.entries(costo).every(([recurso, monto]) => (recursosPropios.value[recurso] || 0) >= monto)
})
const textoCostoCiudad = computed(() =>
  Object.entries(constantes.value.costoCiudad || {}).map(([r, m]) => `${m} ${r}`).join(', ')
)

const confirmarFundar = () => {
  const nombre = nombreCiudad.value.trim()
  if (!nombre || !fundarAbierto.value || !puedeFundar.value) return
  const { x, y } = fundarAbierto.value
  fundarAbierto.value = null
  ejecutarAccion({ tipo: 'fundarCiudad', x, y, nombre })
}

const construir = (edificio) => {
  if (!edificioMenuAbierto.value) return
  const { x, y } = edificioMenuAbierto.value
  edificioMenuAbierto.value = null
  ejecutarAccion({ tipo: 'construir', x, y, edificio })
}

const reclutar = (unidad) => {
  if (!edificioMenuAbierto.value) return
  const { x, y } = edificioMenuAbierto.value
  edificioMenuAbierto.value = null
  ejecutarAccion({ tipo: 'reclutar', x, y, unidad })
}

const cerrarMenuEdificio = () => {
  edificioMenuAbierto.value = null
}

const salir = () => {
  limpiarSesion()
  emit('salir')
}

const onTecla = (e) => {
  if (e.key !== 'Escape') return
  seleccion.value = null
  ataqueAbierto.value = null
  edificioMenuAbierto.value = null
  fundarAbierto.value = null
}

onMounted(async () => {
  window.addEventListener('keydown', onTecla)
  guardarSesion()

  try {
    constantes.value = await obtenerConstantes()
  } catch {
    // Sin constantes el menu de ciudad se muestra vacio; la partida sigue.
  }

  // La vista que llega del lobby puede estar vieja: quien creo la partida la obtuvo
  // ANTES de iniciarla, asi que se pide de nuevo antes de dibujar nada.
  try {
    await refrescarVista()
  } catch (err) {
    emit('error', err.mensaje || 'No se pudo cargar la partida.')
    salir()
    return
  }

  vigilarInicio()

  try {
    await conectar()
    await unirseAPartida(id, jugadorId, token)
    onEstado((payload) => {
      vista.value = payload
      if (payload.narrativas) narrativas.value = fusionarNarrativas(narrativas.value, payload.narrativas)
      detenerVigilancia()
    })
    onNarrativa((entrada) => {
      narrativas.value = fusionarNarrativas(narrativas.value, [entrada])
    })
  } catch {
    // El socket es solo para actualizaciones en vivo; si falla la conexion,
    // la partida sigue jugable por REST (ver spec seccion 6).
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onTecla)
  detenerVigilancia()
  desconectar()
})
</script>

<template>
  <div class="map-session">
    <MapPlayerPanel :vista="vista" :jugador-id="jugadorId" />

    <div v-if="vista.estado === 'esperando'" class="esperando">
      Esperando a que el anfitrión inicie la partida…
    </div>

    <MapCanvas
      :vista="vista"
      :jugador-id="jugadorId"
      :seleccion="seleccion"
      :alcanzables="alcanzables"
      :constantes="constantes"
      @click-tile="onClickTile"
    />

    <MapActionBar :vista="vista" :jugador-id="jugadorId" @terminar-turno="onTerminarTurno" />

    <MapRoundLog :narrativas="narrativas" />

    <MapVictory
      v-if="vista.estado === 'terminado'"
      :vista="vista"
      :jugador-id="jugadorId"
      @salir="salir"
    />

    <MapDialogo :abierto="edificioMenuAbierto !== null" titulo="Ciudad" @cerrar="cerrarMenuEdificio">
      <MapCiudadMenu
        v-if="edificioMenuAbierto"
        :vista="vista"
        :jugador-id="jugadorId"
        :posicion="edificioMenuAbierto"
        :constantes="constantes"
        @construir="construir"
        @reclutar="reclutar"
        @cerrar="cerrarMenuEdificio"
      />
    </MapDialogo>

    <MapDialogo :abierto="fundarAbierto !== null" titulo="Fundar ciudad" @cerrar="fundarAbierto = null">
      <input
        v-model="nombreCiudad"
        class="entrada-nombre"
        placeholder="Nombre de la ciudad"
        @keyup.enter="confirmarFundar"
      >
      <small class="costo-fundar">Costo: {{ textoCostoCiudad }}</small>
      <em v-if="!puedeFundar" class="motivo-fundar">sin recursos</em>
      <button class="btn-primario" :disabled="!nombreCiudad.trim() || !puedeFundar" @click="confirmarFundar">
        Fundar
      </button>
    </MapDialogo>

    <MapDialogo :abierto="ataqueAbierto !== null" titulo="Atacar" @cerrar="ataqueAbierto = null">
      <div v-if="ataqueAbierto" class="ataque">
        <p class="ataque-linea">
          <strong>Tu ejército</strong>
          <span>{{ tileEn(ataqueAbierto.desde.x, ataqueAbierto.desde.y)?.ejercito?.tipo }}</span>
        </p>
        <p class="ataque-linea">
          <strong>Defensor</strong>
          <span>
            {{ tileEn(ataqueAbierto.hasta.x, ataqueAbierto.hasta.y)?.ciudad
              ? 'Ciudad ' + tileEn(ataqueAbierto.hasta.x, ataqueAbierto.hasta.y).ciudad.nombre
              : tileEn(ataqueAbierto.hasta.x, ataqueAbierto.hasta.y)?.ejercito?.tipo }}
          </span>
        </p>
        <p class="ataque-nota">
          Terreno del defensor:
          {{ tileEn(ataqueAbierto.hasta.x, ataqueAbierto.hasta.y)?.terreno }}
          <span v-if="tileEn(ataqueAbierto.hasta.x, ataqueAbierto.hasta.y)?.ciudad">
            · la ciudad suma defensa
          </span>
        </p>
        <button class="btn-primario" @click="confirmarAtaque">Atacar</button>
      </div>
    </MapDialogo>
  </div>
</template>

<style scoped>
.map-session {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem;
  color: #ecf0f1;
}

.esperando {
  background: rgba(52, 152, 219, 0.15);
  border-radius: 8px;
  padding: 0.75rem 1rem;
  color: #3498db;
  text-align: center;
}

.entrada-nombre {
  background: rgba(0, 0, 0, 0.3); color: #ecf0f1;
  border: 1px solid rgba(255, 255, 255, 0.2); border-radius: 6px;
  padding: 0.5rem 0.7rem; font-size: 1rem;
}
.costo-fundar { opacity: 0.7; font-size: 0.8rem; }
.motivo-fundar { color: #e67e22; font-size: 0.75rem; font-style: normal; }
.ataque { display: flex; flex-direction: column; gap: 0.4rem; }
.ataque-linea { display: flex; justify-content: space-between; gap: 1rem; margin: 0; }
.ataque-nota { opacity: 0.7; font-size: 0.8rem; margin: 0.3rem 0 0.6rem; }
.btn-primario {
  background: #3498db; color: #fff; border: 0; border-radius: 6px;
  padding: 0.5rem 0.9rem; cursor: pointer;
}
.btn-primario:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
