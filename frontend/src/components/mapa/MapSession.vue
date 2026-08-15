<!-- frontend/src/components/mapa/MapSession.vue -->
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
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
const constantes = ref({ edificios: [], unidades: [] })

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

const onClickTile = (posicion) => {
  const tile = vista.value.mapa[posicion.y * vista.value.config.tamanoMapa + posicion.x]
  if (!tile) return

  if (tile.ciudad && tile.dueno === jugadorId) {
    edificioMenuAbierto.value = posicion
    return
  }

  if (!tile.ciudad && (tile.dueno === jugadorId || tile.dueno === null)) {
    nombreCiudad.value = ''
    fundarAbierto.value = posicion
  }
}

const confirmarFundar = () => {
  const nombre = nombreCiudad.value.trim()
  if (!nombre || !fundarAbierto.value) return
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

onMounted(async () => {
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
      <button class="btn-primario" :disabled="!nombreCiudad.trim()" @click="confirmarFundar">
        Fundar
      </button>
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
.btn-primario {
  background: #3498db; color: #fff; border: 0; border-radius: 6px;
  padding: 0.5rem 0.9rem; cursor: pointer;
}
.btn-primario:disabled { opacity: 0.45; cursor: not-allowed; }
</style>
