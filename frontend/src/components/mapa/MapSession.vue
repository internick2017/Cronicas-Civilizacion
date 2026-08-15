<!-- frontend/src/components/mapa/MapSession.vue -->
<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { useMapApi } from '../../composables/useMapApi.js'
import { useMapSocket } from '../../composables/useMapSocket.js'
import MapGrid from './MapGrid.vue'
import MapPlayerPanel from './MapPlayerPanel.vue'
import MapActionBar from './MapActionBar.vue'

const props = defineProps({
  partidaInicial: { type: Object, required: true }
})
const emit = defineEmits(['salir', 'error'])

const { accion, vista: pedirVista } = useMapApi()
const { conectar, desconectar, unirseAPartida, onEstado } = useMapSocket()

const id = props.partidaInicial.id
const jugadorId = props.partidaInicial.jugadorId
const token = props.partidaInicial.token
const vista = ref(props.partidaInicial.vista)

const edificioMenuAbierto = ref(null) // {x, y} | null
let pollEspera = null

const EDIFICIOS = [
  { tipo: 'granary', nombre: 'Granero' },
  { tipo: 'market', nombre: 'Mercado' },
  { tipo: 'library', nombre: 'Biblioteca' },
  { tipo: 'barracks', nombre: 'Cuartel' }
]

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
    const nombre = window.prompt('Nombre de la ciudad:')
    if (!nombre) return
    ejecutarAccion({ tipo: 'fundarCiudad', x: posicion.x, y: posicion.y, nombre })
  }
}

const construir = (edificio) => {
  if (!edificioMenuAbierto.value) return
  const { x, y } = edificioMenuAbierto.value
  edificioMenuAbierto.value = null
  ejecutarAccion({ tipo: 'construir', x, y, edificio })
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
      detenerVigilancia()
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

    <MapGrid
      :mapa="vista.mapa"
      :tamano-mapa="vista.config.tamanoMapa"
      :jugador-id="jugadorId"
      @click-tile="onClickTile"
    />

    <MapActionBar :vista="vista" :jugador-id="jugadorId" @terminar-turno="onTerminarTurno" />

    <div v-if="edificioMenuAbierto" class="edificio-menu-overlay" @click.self="cerrarMenuEdificio">
      <div class="edificio-menu">
        <h3>Construir</h3>
        <button
          v-for="ed in EDIFICIOS"
          :key="ed.tipo"
          class="btn-secondary"
          @click="construir(ed.tipo)"
        >
          {{ ed.nombre }}
        </button>
        <button class="btn-secondary" @click="cerrarMenuEdificio">Cancelar</button>
      </div>
    </div>
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

.edificio-menu-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.edificio-menu {
  background: #2c3e50;
  border-radius: 12px;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  min-width: 220px;
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.1);
  color: #ecf0f1;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 6px;
  padding: 0.5rem 0.8rem;
  cursor: pointer;
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.2);
}
</style>
