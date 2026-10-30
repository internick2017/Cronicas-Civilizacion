<!-- frontend/src/components/mapa/MapSession.vue -->
<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useMapApi } from '../../composables/useMapApi.js'
import { useMapSocket } from '../../composables/useMapSocket.js'
import MapCanvas from './MapCanvas.vue'
import MapPlayerPanel from './MapPlayerPanel.vue'
import MapActionBar from './MapActionBar.vue'
import { puedeJugar } from './turno.js'
import { textoCosto, textoFalta } from './recursos.js'
import MapAlianzas from './MapAlianzas.vue'
import MapCiudadano from './MapCiudadano.vue'
import MapTema from './MapTema.vue'
import { tema } from '../../mapa/temas.js'
import { amigosDe, propuestasPara } from './alianzas.js'
import { deQuienEs } from './casilla.js'
import { colorCssDeJugador } from '../../mapa/sprites.js'
import MapRoundLog from './MapRoundLog.vue'
import MapVictory from './MapVictory.vue'
import MapDialogo from './MapDialogo.vue'
import MapCiudadMenu from './MapCiudadMenu.vue'
import MapAyuda from './MapAyuda.vue'
import MapCultura from './MapCultura.vue'
import MapCiencia from './MapCiencia.vue'
import MapGobiernoPanel from './MapGobiernoPanel.vue'

const props = defineProps({
  partidaInicial: { type: Object, required: true }
})
const emit = defineEmits(['salir', 'error'])

const { accion, vista: pedirVista, obtenerConstantes, iniciar: iniciarPartidaApi } = useMapApi()
const { seguirPartida, desconectar } = useMapSocket()

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

// El mapa ocupa toda la pantalla, asi que la cronica y la lista de ciudades
// van encima como paneles que se pueden cerrar en vez de apilados debajo
// (donde quedaban fuera de la vista y habia que scrollear para encontrarlos).
const canvasRef = ref(null)
const ciudadesAbierto = ref(false)
const ciudadanoAbierto = ref(false)
const temaAbierto = ref(false)
const ayudaAbierta = ref(false)
const gobiernoAbierto = ref(false)
const alianzasAbierto = ref(false)
// Sumar una maquina con la partida ya empezada.
const maquinaAbierta = ref(false)
const dificultadMaquina = ref('normal')
const sumarMaquina = async () => {
  maquinaAbierta.value = false
  await ejecutarAccion({ tipo: 'sumarMaquina', dificultadIA: dificultadMaquina.value })
}
const avisoAlianza = ref('')
// Yo y aquellos con los que estoy en paz (aliados y treguas): el backend no
// deja atacarlos ni entrar a lo que ocupan, asi que aca tampoco se ofrece.
const amigos = computed(() => amigosDe(vista.value, jugadorId))
const propuestasRecibidas = computed(() => propuestasPara(vista.value, jugadorId).length)
// Sin la mecanica Gobierno, el mismo panel queda solo con la moneda (si sigue prendida)
// y el boton pasa a llamarse Moneda.
const hayGobierno = computed(() => vista.value?.reglas?.gobierno !== false)
// Los cargos que asumio el jugador (ver backend reglas/cargos.js): lo que no lleva
// lo hace la maquina por el, asi que sus botones no se ofrecen.
const misCargos = computed(() => vista.value?.jugadores.find(j => j.id === jugadorId)?.cargos ?? ['estado', 'gobierno'])
const esJefeEstado = computed(() => misCargos.value.includes('estado'))
const esJefeGobierno = computed(() => misCargos.value.includes('gobierno'))
const esEspectador = computed(() => misCargos.value.length === 0)
const etiquetaCargos = computed(() => (esEspectador.value
  ? 'Ciudadano (la máquina gobierna)'
  : esJefeEstado.value && esJefeGobierno.value
    ? 'Jefe de Estado y de Gobierno'
    : esJefeEstado.value ? 'Jefe de Estado (la máquina lleva el gobierno)' : 'Jefe de Gobierno (la máquina lleva el Estado)'))
// Cuantos problemas activos o señales de aviso hay: el boton Gobierno lo muestra
// para que no haga falta abrirlo a mirar.
const avisosGobierno = computed(() => {
  const yo = vista.value?.jugadores.find(j => j.id === jugadorId)
  return (yo?.problemas?.length ?? 0) + (yo?.senales?.filter(s => s.estado === 'aviso').length ?? 0)
})

// La cronica se puede ocultar y la eleccion se recuerda: a quien no le interesa
// la narrativa no tiene que cerrarla en cada partida, y a quien si le interesa
// no se le esconde nunca. En un telefono arranca cerrada: ahi el panel se come el mapa.
const PREF_CRONICA = 'mapa.cronicaAbierta'
const prefCronica = localStorage.getItem(PREF_CRONICA)
const cronicaAbierta = ref(prefCronica ? prefCronica !== 'no' : window.innerWidth > 640)
watch(cronicaAbierta, (abierta) => {
  localStorage.setItem(PREF_CRONICA, abierta ? 'si' : 'no')
})

const misCiudades = computed(() =>
  vista.value.mapa
    .filter(t => t.ciudad && t.dueno === jugadorId)
    .map(t => ({ x: t.x, y: t.y, nombre: t.ciudad.nombre, nivel: t.ciudad.nivel }))
)

const culturaAbierta = ref(false)

const misRasgos = computed(() =>
  vista.value.jugadores.find(j => j.id === jugadorId)?.rasgos || []
)

const cienciaAbierta = ref(false)

const misTecnologias = computed(() =>
  vista.value.jugadores.find(j => j.id === jugadorId)?.tecnologias || []
)

const investigar = (tecnologia) => {
  cienciaAbierta.value = false
  ejecutarAccion({ tipo: 'investigar', tecnologia })
}

const adoptarRasgo = (rasgo) => {
  culturaAbierta.value = false
  ejecutarAccion({ tipo: 'adoptarRasgo', rasgo })
}

const irACiudad = (ciudad) => {
  canvasRef.value?.irA(ciudad.x, ciudad.y)
  ciudadesAbierto.value = false
}
let pollEspera = null

// Reglas del juego (costos, stats). Vienen del backend para no duplicarlas.
// minJugadores tambien viene del backend (ver reglas/partida.js#iniciar): el
// 2 de aca es solo un valor de arranque para el primer render, antes de que
// responda /api/map/constantes.
const constantes = ref({ edificios: [], unidades: [], costoCiudad: {}, minJugadores: 2 })
const iniciando = ref(false)

const seleccion = ref(null)        // {x, y} del ejercito propio elegido
const ataqueAbierto = ref(null)    // {desde, hasta} | null

const tileEn = (x, y) => vista.value.mapa[y * vista.value.config.tamanoMapa + x]

const esMiTurno = computed(() => puedeJugar(vista.value, jugadorId))

// El backend no guarda un campo "anfitrion": lo unico estable es que
// `unirse` va empujando jugadores al arreglo en el orden en que entran
// (ver aplicar.js#JugadorUnido, que hace push y nunca reordena ni saca del
// arreglo), y quien crea la partida es siempre el primero en unirse
// (MapLobby.vue llama crearPartida y de inmediato unirse). Por eso
// jugadores[0] identifica al anfitrion de forma confiable mientras la
// partida sigue en 'esperando'.
const esAnfitrion = computed(() => vista.value.jugadores[0]?.id === jugadorId)
const jugadoresFaltantes = computed(() =>
  Math.max(0, constantes.value.minJugadores - vista.value.jugadores.length)
)
const puedeIniciar = computed(() => jugadoresFaltantes.value === 0)

// Adyacentes ortogonales (Manhattan 1) que el backend va a aceptar. Replica
// las validaciones de `reglas/movimiento.js` y `reglas/combate.js` (distancia
// Manhattan === 1, movimientoRestante > 0, destino no acuatico, destino con
// objetivo enemigo real, tierra libre o tierra ajena sin defensor) para no ofrecer acciones que van a ser
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
  // Un buque juega al reves que la tropa: solo entra al mar, y nunca a tierra.
  // El dato sale de GET /api/map/constantes, no de una lista de tipos copiada
  // aca: si mañana hay un segundo buque, esto no hay que tocarlo.
  const defDe = (tipo) => (constantes.value?.unidades || []).find(u => u.tipo === tipo)
  const esNaval = Boolean(defDe(origen.ejercito.tipo)?.naval)
  // Un transporte cargado puede bajar tropa a tierra, y la tropa puede subirse
  // a un transporte amigo en el mar: son las dos unicas veces que una unidad
  // "alcanza" una casilla del otro medio, y por eso se tratan como excepciones
  // explicitas en vez de aflojar el filtro de terreno.
  const capacidad = defDe(origen.ejercito.tipo)?.capacidad ?? 0
  const llevaCarga = (origen.ejercito.carga?.length ?? 0) > 0

  return [[1, 0], [-1, 0], [0, 1], [0, -1]]
    .map(([dx, dy]) => ({ x: x + dx, y: y + dy }))
    .filter(p => {
      const t = vista.value.config.tamanoMapa
      if (p.x < 0 || p.y < 0 || p.x >= t || p.y >= t) return false
      const tile = tileEn(p.x, p.y)
      if (!tile) return false
      // Niebla: sin datos para filtrar nada. Candidata (ver comentario arriba).
      if (!tile.descubierto) return true
      // Lo que ocupa un aliado (su tropa o su ciudad) no es destino ni objetivo:
      // movimiento.js y combate.js lo rechazan. Su tierra suelta si se puede pisar.
      const ocupadaPorAmigo =
        (tile.ejercito && tile.ejercito.dueno !== jugadorId && amigos.value.has(tile.ejercito.dueno)) ||
        (tile.ciudad && tile.dueno !== jugadorId && amigos.value.has(tile.dueno))
      if (ocupadaPorAmigo) return false

      // Excepcion 1: la tropa se sube a un transporte propio con lugar.
      const transporteConLugar = tile.ejercito && tile.ejercito.dueno === jugadorId &&
        (defDe(tile.ejercito.tipo)?.capacidad ?? 0) > (tile.ejercito.carga?.length ?? 0)
      if (!esNaval && transporteConLugar) return true
      // Excepcion 2: el transporte cargado baja tropa a una orilla libre.
      if (capacidad > 0 && llevaCarga && tile.terreno !== 'water' &&
        !tile.ejercito && !(tile.ciudad && tile.dueno !== jugadorId)) return true

      const ejercitoEnemigo = tile.ejercito && !amigos.value.has(tile.ejercito.dueno)
      const ciudadEnemiga = tile.ciudad && !amigos.value.has(tile.dueno)
      // Un buque NAVEGA solo por el mar, pero ATACA la costa desde ahi: una
      // ciudad o un ejercito enemigo pegado al mar es un objetivo valido (es
      // exactamente el saqueo, ver docs/adr/0003). Sin esta excepcion el
      // filtro de "solo agua" dejaba la armada sin poder tocar tierra, y el
      // saqueo era inalcanzable para un humano. El transporte no ataca (ataque
      // 0), asi que no entra aca.
      const puedeAtacarTierra = esNaval && (defDe(origen.ejercito.tipo)?.ataque ?? 0) > 0 &&
        Boolean(ejercitoEnemigo || ciudadEnemiga)
      if (!puedeAtacarTierra && (esNaval ? tile.terreno !== 'water' : tile.terreno === 'water')) return false
      // Un ejercito propio ya ocupando el destino: movimiento.js lo rechaza
      // con CASILLA_OCUPADA (y no es ataque, asi que tampoco es un objetivo
      // valido). No se ofrece como alcanzable.
      if (tile.ejercito && tile.ejercito.dueno === jugadorId) return false
      // Territorio ajeno SIN defensor (sin ejercito ni ciudad) SI es alcanzable:
      // movimiento.js deja entrar y tomarlo (la frontera es permeable, ver el
      // comentario de `estaDefendida` ahi). Este filtro lo rechazaba creyendo
      // que el backend pedia atacar, y por eso la maquina podia invadirte
      // (ella llama al dominio directo) y vos no podias invadirla a ella.
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
    return resultado
  } catch (err) {
    emit('error', err.mensaje || 'No se pudo ejecutar la acción.')
    return null
  }
}

// La maquina contesta una propuesta en el acto: sin este aviso, al proponerle
// la propuesta simplemente desaparecia y no se sabia si habia dicho que si.
const onAccionAlianza = async (datosAccion) => {
  avisoAlianza.value = ''
  const resultado = await ejecutarAccion(datosAccion)
  if (!resultado || datosAccion.tipo !== 'proponerAlianza') return
  const nombre = vista.value.jugadores.find(j => j.id === datosAccion.para)?.nombre ?? 'Ese jugador'
  const tipos = (resultado.eventos ?? []).map(e => e.tipo)
  if (tipos.includes('AlianzaFormada')) avisoAlianza.value = `${nombre} aceptó: ya son aliados.`
  else if (tipos.includes('AlianzaRechazada')) avisoAlianza.value = `${nombre} rechazó la alianza. La máquina solo acepta cuando va perdiendo.`
}

const onTerminarTurno = () => ejecutarAccion({ tipo: 'terminarTurno' })

// Modo espectador: nadie aprieta "terminar turno", lo hace esto. Se mira cada
// vista nueva (no esMiTurno) porque en secuencial los bots juegan dentro de la
// misma respuesta y el turno vuelve a ser mio sin pasar nunca por false.
const PAUSA_ESPECTADOR_MS = 1500
let turnoEspectador = null
let desmontada = false
const programarTurnoEspectador = () => {
  if (desmontada || turnoEspectador || !esEspectador.value || !esMiTurno.value || vista.value.estado !== 'jugando') return
  turnoEspectador = setTimeout(async () => {
    await onTerminarTurno()
    turnoEspectador = null
    // La vista nueva pudo llegar mientras esperabamos la respuesta: se revisa aca.
    programarTurnoEspectador()
  }, PAUSA_ESPECTADOR_MS)
}
watch(vista, programarTurnoEspectador, { immediate: true })

const onIniciarPartida = async () => {
  if (!puedeIniciar.value || iniciando.value) return
  iniciando.value = true
  try {
    await iniciarPartidaApi(id)
    await refrescarVista()
    detenerVigilancia()
  } catch (err) {
    emit('error', err.mensaje || 'No se pudo iniciar la partida.')
  } finally {
    iniciando.value = false
  }
}

// Mismo criterio que combate.js: hay objetivo enemigo solo si hay un
// ejercito ajeno o una ciudad ajena en la casilla (no alcanza con que el
// territorio sea de otro jugador: esas casillas ya se excluyen de
// alcanzables porque el backend tampoco acepta atacarlas).
const esEnemigo = (tile) =>
  Boolean(tile.ejercito && !amigos.value.has(tile.ejercito.dueno)) ||
  Boolean(tile.ciudad && !amigos.value.has(tile.dueno))

// De quien es lo ultimo ajeno que se toco (se muestra debajo del mapa). Tocar
// cualquier otra cosa lo borra.
const casillaAjena = ref(null)

const onClickTile = (posicion) => {
  const tile = tileEn(posicion.x, posicion.y)
  if (!tile) return
  casillaAjena.value = deQuienEs(vista.value, jugadorId, tile, constantes.value)

  // 1. Con un ejercito seleccionado, un click en casilla alcanzable es una orden.
  if (seleccion.value) {
    const alcanzable = alcanzables.value.some(p => p.x === posicion.x && p.y === posicion.y)
    if (alcanzable) {
      const desde = { ...seleccion.value }
      // esEnemigo() es false para una casilla en niebla (no trae ejercito ni
      // ciudad), asi que hacia la niebla SIEMPRE se intenta mover, nunca
      // atacar. Es lo correcto: el frontend no puede saber si abajo hay un
      // enemigo, y no debe adivinarlo. Decide el backend.
      // El orden importa: subir y bajar tropa se deciden ANTES que mover o
      // atacar, porque son las dos acciones donde origen y destino estan en
      // medios distintos y `moverEjercito` las rechazaria.
      const origen = tileEn(desde.x, desde.y)
      const defDe = (tipo) => (constantes.value?.unidades || []).find(u => u.tipo === tipo)
      const origenEsTransporte = (defDe(origen?.ejercito?.tipo)?.capacidad ?? 0) > 0
      const destinoEsTransportePropio = tile.ejercito && tile.ejercito.dueno === jugadorId &&
        (defDe(tile.ejercito.tipo)?.capacidad ?? 0) > 0

      seleccion.value = null
      if (!origenEsTransporte && destinoEsTransportePropio) {
        ejecutarAccion({ tipo: 'embarcar', desde, hasta: posicion })
      } else if (origenEsTransporte && tile.descubierto && tile.terreno !== 'water') {
        ejecutarAccion({ tipo: 'desembarcar', desde, hasta: posicion })
      } else if (esEnemigo(tile)) {
        seleccion.value = { ...desde }
        ataqueAbierto.value = { desde, hasta: posicion }
      } else {
        ejecutarAccion({ tipo: 'moverEjercito', desde, hasta: posicion })
      }
      return
    }
    // Click fuera del alcance: se deselecciona y sigue el flujo normal.
    seleccion.value = null
  }

  // De aca en adelante todos los caminos leen terreno/dueno/ciudad/ejercito,
  // que una casilla en niebla NO trae ({x, y, descubierto: false}). El unico
  // camino valido para la niebla es el movimiento de arriba; sin ejercito
  // seleccionado (o con la casilla fuera de alcance) un click en niebla no
  // hace nada, que es lo correcto: no hay nada que el jugador conozca ahi.
  if (!tile.descubierto) return

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

  // 4. Territorio propio SIN ciudad (lo reclamaste caminando un ejercito
  // encima): ahi se puede fundar. fundarCiudad (backend) exige territorio
  // propio, asi que esta es la unica casilla donde el dialogo no termina
  // rechazado.
  if (!tile.ciudad && tile.dueno === jugadorId) {
    nombreCiudad.value = ''
    fundarAbierto.value = posicion
    return
  }

  // 5. Casilla sin dueño (tuya o ajena): fundarCiudad la rechaza, avisar el
  // motivo real en vez de abrir el dialogo para fallar contra el backend.
  if (!tile.ciudad && tile.dueno === null) {
    emit('error', 'Para fundar ahí primero tenés que reclamar el territorio moviendo un ejército encima.')
  }
}

// Contra quien pega un ataque: si hay soldado en la casilla, el golpe es contra el, aunque
// este dentro de una ciudad (el backend resuelve igual, combate.js). Antes el dialogo
// nombraba solo a la ciudad y parecia que al soldado no se lo podia atacar.
const soldadoEnCiudad = computed(() => {
  const t = ataqueAbierto.value && tileEn(ataqueAbierto.value.hasta.x, ataqueAbierto.value.hasta.y)
  return Boolean(t?.ejercito && t?.ciudad)
})
const textoDefensor = computed(() => {
  const t = ataqueAbierto.value && tileEn(ataqueAbierto.value.hasta.x, ataqueAbierto.value.hasta.y)
  if (!t) return ''
  const unidad = (constantes.value?.unidades || []).find(u => u.tipo === t.ejercito?.tipo)
  const soldado = t.ejercito
    ? `${unidad?.nombre ?? t.ejercito.tipo} (${t.ejercito.salud}${unidad?.salud ? '/' + unidad.salud : ''})`
    : null
  const ciudad = t.ciudad ? `Ciudad ${t.ciudad.nombre} (${t.ciudad.salud}/${t.ciudad.saludMax})` : null
  return [soldado, ciudad].filter(Boolean).join(' dentro de la ')
})

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
const monedaPropia = computed(() => vista.value.jugadores.find(j => j.id === jugadorId)?.moneda)
const faltaParaFundar = computed(() =>
  textoFalta(constantes.value.costoCiudad, recursosPropios.value, monedaPropia.value))
const puedeFundar = computed(() => !faltaParaFundar.value)
const textoCostoCiudad = computed(() => textoCosto(constantes.value.costoCiudad, monedaPropia.value))

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

const mejorarCiudad = () => {
  if (!edificioMenuAbierto.value) return
  const { x, y } = edificioMenuAbierto.value
  edificioMenuAbierto.value = null
  ejecutarAccion({ tipo: 'mejorarCiudad', x, y })
}

const renombrarCiudad = (nombre) => {
  if (!edificioMenuAbierto.value) return
  const { x, y } = edificioMenuAbierto.value
  edificioMenuAbierto.value = null
  ejecutarAccion({ tipo: 'renombrarCiudad', x, y, nombre })
}

const moverCapital = () => {
  if (!edificioMenuAbierto.value) return
  const { x, y } = edificioMenuAbierto.value
  edificioMenuAbierto.value = null
  ejecutarAccion({ tipo: 'moverCapital', x, y })
}

// Las acciones de gobierno cierran el panel igual que las de ciudad: el
// resultado (aprobada o rechazada la votacion) se lee en la vista nueva.
const proponerGobierno = (gobierno, oro) => {
  gobiernoAbierto.value = false
  ejecutarAccion({ tipo: 'proponerGobierno', gobierno, oro })
}
const darVentajas = (grupo, oro) => {
  gobiernoAbierto.value = false
  ejecutarAccion({ tipo: 'darVentajas', grupo, oro })
}
const cambiarFormaEstado = (formaEstado) => {
  gobiernoAbierto.value = false
  ejecutarAccion({ tipo: 'cambiarFormaEstado', formaEstado })
}

// Estas dos NO cierran el panel: se suelen crear varias seguidas.
const crearSubdivision = (datos) => ejecutarAccion({ tipo: 'crearSubdivision', ...datos })
const quitarSubdivision = (id) => ejecutarAccion({ tipo: 'quitarSubdivision', id })
const renombrarSubdivision = (id, nombre) => ejecutarAccion({ tipo: 'renombrarSubdivision', id, nombre })
const asignarCiudades = (id, ciudades) => ejecutarAccion({ tipo: 'asignarCiudades', id, ciudades })
const desasignarCiudades = (id, ciudades) => ejecutarAccion({ tipo: 'desasignarCiudades', id, ciudades })
const elegirCabecera = (subdivisionId, ciudad) =>
  ejecutarAccion({ tipo: 'elegirCabecera', subdivisionId, x: ciudad?.x ?? null, y: ciudad?.y ?? null })

const cerrarMenuEdificio = () => {
  edificioMenuAbierto.value = null
}

const salir = () => {
  limpiarSesion()
  emit('salir')
}

const salidaAbierta = ref(false)

// Irse no es solo cerrar la pantalla: si el jugador desaparece y era su turno,
// los demas quedan esperando para siempre a alguien que no vuelve. Por eso se
// avisa al backend (accion 'abandonar') antes de volver al lobby.
// Si la partida todavia no arranco no hay turno que destrabar, y el backend
// rechaza la accion: en ese caso se sale igual, sin molestar al jugador.
const confirmarSalida = async () => {
  salidaAbierta.value = false
  if (vista.value.estado === 'jugando') {
    try {
      await accion(id, jugadorId, token, { tipo: 'abandonar' })
    } catch {
      // Que falle el aviso no puede dejar al jugador atrapado en la partida.
    }
  }
  salir()
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

  // El socket es solo para actualizaciones en vivo; si no conecta, la partida
  // sigue jugable por REST (ver spec seccion 6) y socket.io sigue reintentando.
  seguirPartida(id, jugadorId, token, {
    alEstado: (payload) => {
      vista.value = payload
      if (payload.narrativas) narrativas.value = fusionarNarrativas(narrativas.value, payload.narrativas)
      detenerVigilancia()
    },
    alNarrativa: (entrada) => {
      narrativas.value = fusionarNarrativas(narrativas.value, [entrada])
    },
    alUnirse: () => {
      // error transitorio: la proxima jugada o reconexion trae la vista
      refrescarVista().catch(() => {})
    }
  })
})

onUnmounted(() => {
  window.removeEventListener('keydown', onTecla)
  detenerVigilancia()
  desconectar()
  desmontada = true
  clearTimeout(turnoEspectador)
})
</script>

<template>
  <div class="map-session">
    <MapPlayerPanel :vista="vista" :jugador-id="jugadorId" :constantes="constantes" @sumar-maquina="maquinaAbierta = true" @elegir-tema="temaAbierto = true" @renombrar-pais="nombre => ejecutarAccion({ tipo: 'renombrarPais', nombre })" />

    <div v-if="vista.estado === 'esperando'" class="sala-espera">
      <p class="sala-codigo">
        Código de la partida: <strong>{{ partidaInicial.codigo }}</strong>
      </p>

      <p class="sala-titulo">
        Jugadores unidos ({{ vista.jugadores.length }}/{{ constantes.minJugadores }} mínimo)
      </p>
      <ul class="sala-lista">
        <li v-for="(j, i) in vista.jugadores" :key="j.id">
          {{ j.nombre }}<span v-if="i === 0" class="sala-etiqueta"> (anfitrión)</span>
        </li>
      </ul>

      <template v-if="esAnfitrion">
        <button class="btn-primario" :disabled="!puedeIniciar || iniciando" @click="onIniciarPartida">
          Iniciar partida
        </button>
        <p v-if="!puedeIniciar" class="sala-motivo">
          Faltan {{ jugadoresFaltantes }} jugador{{ jugadoresFaltantes === 1 ? '' : 'es' }} para poder iniciar.
        </p>
      </template>
      <p v-else class="sala-motivo">
        Esperando a que el anfitrión inicie la partida…
      </p>
    </div>

    <div class="zona-mapa">
      <div class="botonera-paneles">
        <span class="etiqueta-cargos" title="Tu cargo">🎖️ {{ etiquetaCargos }}</span>
        <button class="btn-panel" title="Ciudades" @click="ciudadesAbierto = !ciudadesAbierto">
          <span aria-hidden="true">🏙️</span><span class="btn-texto">Ciudades ({{ misCiudades.length }})</span>
        </button>
        <button v-if="narrativas.length" class="btn-panel" :title="cronicaAbierta ? 'Ocultar crónica' : 'Ver crónica'" @click="cronicaAbierta = !cronicaAbierta">
          <span aria-hidden="true">📖</span><span class="btn-texto">{{ cronicaAbierta ? 'Ocultar crónica' : 'Ver crónica' }}</span>
        </button>
        <button v-if="esEspectador && hayGobierno" class="btn-panel" title="Tu vida de ciudadano" @click="ciudadanoAbierto = true">
          <span aria-hidden="true">🧑</span><span class="btn-texto">Ciudadano</span>
        </button>
        <button v-if="esJefeGobierno && vista.reglas?.rasgos !== false" class="btn-panel" title="Rasgos culturales" @click="culturaAbierta = true">
          <span aria-hidden="true">🎭</span><span class="btn-texto">Cultura</span>
        </button>
        <button v-if="esJefeGobierno && vista.reglas?.tecnologias !== false" class="btn-panel" title="Tecnologías" @click="cienciaAbierta = true">
          <span aria-hidden="true">🔬</span><span class="btn-texto">Ciencia</span>
        </button>
        <button v-if="esJefeGobierno && hayGobierno" class="btn-panel" title="Gobierno" @click="gobiernoAbierto = true">
          <span aria-hidden="true">🏛️</span><span class="btn-texto">Gobierno</span><span v-if="avisosGobierno" class="insignia-aviso">{{ avisosGobierno }}</span>
        </button>
        <button v-else-if="esJefeGobierno && vista.reglas?.moneda !== false" class="btn-panel" title="Moneda" @click="gobiernoAbierto = true">
          <span aria-hidden="true">💰</span><span class="btn-texto">Moneda</span>
        </button>
        <button v-if="esJefeEstado && vista.reglas?.alianzas !== false" class="btn-panel" title="Alianzas" @click="alianzasAbierto = true">
          <span aria-hidden="true">🤝</span><span class="btn-texto">Alianzas</span><span v-if="propuestasRecibidas" class="insignia-aviso">{{ propuestasRecibidas }}</span>
        </button>
        <button class="btn-panel" title="Manual de Instrucciones" @click="ayudaAbierta = true">
          <span aria-hidden="true">ℹ️</span><span class="btn-texto">Manual</span>
        </button>
        <button class="btn-panel btn-salir" title="Salir de la partida" @click="salidaAbierta = true">
          <span aria-hidden="true">🚪</span><span class="btn-texto">Salir</span>
        </button>
      </div>

      <!-- Los paneles flotan solo sobre el mapa: si flotaran sobre toda la zona
           taparian la botonera, como le pasaba a la cronica. -->
      <div class="lienzo">
        <!-- shortcut: cambiar de tema remonta el mapa y vuelve a centrar la camara; alcanza porque se cambia rara vez. -->
        <MapCanvas
          ref="canvasRef"
          :key="tema"
          :vista="vista"
          :jugador-id="jugadorId"
          :seleccion="seleccion"
          :alcanzables="alcanzables"
          :constantes="constantes"
          @click-tile="onClickTile"
        />

        <aside v-if="ciudadesAbierto" class="panel-flotante panel-ciudades">
          <h3>Mis ciudades</h3>
          <p v-if="misCiudades.length === 0" class="panel-vacio">
            Todavía no tenés ciudades.
          </p>
          <button
            v-for="ciudad in misCiudades"
            :key="`${ciudad.x},${ciudad.y}`"
            class="item-ciudad"
            @click="irACiudad(ciudad)"
          >
            <span>{{ ciudad.nombre }}</span>
            <small>nivel {{ ciudad.nivel }}</small>
          </button>
        </aside>

        <div v-if="cronicaAbierta && narrativas.length" class="panel-flotante panel-cronica">
          <button class="cerrar-cronica" title="Ocultar la crónica" aria-label="Ocultar la crónica" @click="cronicaAbierta = false">✕</button>
          <MapRoundLog :narrativas="narrativas" />
        </div>
      </div>
    </div>

    <p v-if="casillaAjena" :class="['casilla-ajena', casillaAjena.relacion]">
      <span class="color-bando" :style="{ background: colorCssDeJugador(vista.jugadores, casillaAjena.duenoId) }"></span>
      {{ casillaAjena.texto }}
    </p>

    <MapActionBar :vista="vista" :jugador-id="jugadorId" @terminar-turno="onTerminarTurno" />

    <MapVictory
      v-if="vista.estado === 'terminado'"
      :vista="vista"
      :jugador-id="jugadorId"
      @salir="salir"
    />

    <MapDialogo :abierto="salidaAbierta" titulo="¿Salir de la partida?" @cerrar="salidaAbierta = false">
      <p class="salida-aviso">
        Vas a volver al menú para crear o unirte a otra partida.
      </p>
      <p class="salida-aviso salida-fuerte">
        No hay vuelta atrás: abandonás esta partida y los demás siguen jugando sin vos.
      </p>
      <button class="btn-primario btn-peligro" @click="confirmarSalida">Sí, salir</button>
    </MapDialogo>

    <MapDialogo :abierto="temaAbierto" titulo="Apariencia" @cerrar="temaAbierto = false">
      <MapTema />
    </MapDialogo>

    <MapDialogo :abierto="ciudadanoAbierto" titulo="Tu vida de ciudadano" @cerrar="ciudadanoAbierto = false">
      <MapCiudadano
        :vista="vista"
        :jugador-id="jugadorId"
        :constantes="constantes"
        @manifestarse="postura => ejecutarAccion({ tipo: 'manifestarse', postura })"
      />
    </MapDialogo>

    <MapDialogo :abierto="culturaAbierta" titulo="Rasgos culturales" @cerrar="culturaAbierta = false">
      <MapCultura
        :constantes="constantes"
        :recursos="recursosPropios"
        :rasgos="misRasgos"
        :es-tu-turno="esMiTurno"
        @adoptar="adoptarRasgo"
      />
    </MapDialogo>

    <MapDialogo :abierto="cienciaAbierta" titulo="Tecnologías" @cerrar="cienciaAbierta = false">
      <MapCiencia
        :constantes="constantes"
        :recursos="recursosPropios"
        :tecnologias="misTecnologias"
        :es-tu-turno="esMiTurno"
        @investigar="investigar"
      />
    </MapDialogo>

    <MapDialogo :abierto="gobiernoAbierto" :titulo="hayGobierno ? 'Gobierno' : 'Moneda'" @cerrar="gobiernoAbierto = false">
      <MapGobiernoPanel
        v-if="gobiernoAbierto"
        :vista="vista"
        :jugador-id="jugadorId"
        :constantes="constantes"
        @proponer="proponerGobierno"
        @ventajas="darVentajas"
        @forma="cambiarFormaEstado"
        @crear-subdivision="crearSubdivision"
        @renombrar-subdivision="renombrarSubdivision"
        @asignar-ciudades="asignarCiudades"
        @desasignar-ciudades="desasignarCiudades"
        @quitar-subdivision="quitarSubdivision"
        @elegir-cabecera="elegirCabecera"
        @nombrar-moneda="(nombre, simbolo) => ejecutarAccion({ tipo: 'nombrarMoneda', nombre, simbolo })"
        @acunar="(oro) => ejecutarAccion({ tipo: 'acunarMoneda', oro })"
        @nombrar-gobierno="(nombre) => ejecutarAccion({ tipo: 'nombrarGobierno', nombre })"
        @impuestos="(nivel) => ejecutarAccion({ tipo: 'fijarImpuestos', nivel })"
        @mandato="(rondas) => ejecutarAccion({ tipo: 'fijarMandato', rondas })"
        @cerrar="gobiernoAbierto = false"
      />
    </MapDialogo>

    <MapDialogo :abierto="maquinaAbierta" titulo="Sumar una máquina" @cerrar="maquinaAbierta = false">
      <p class="salida-aviso">
        Entra una civilización nueva manejada por la máquina, con su capital en la tierra libre más
        alejada de todos. Arranca de cero, así que si la partida va avanzada llega de atrás.
      </p>
      <label class="campo-maquina">
        Dificultad
        <select v-model="dificultadMaquina">
          <option v-for="d in constantes.dificultadesIA || []" :key="d.tipo" :value="d.tipo">{{ d.nombre }}</option>
        </select>
      </label>
      <button class="btn-primario" @click="sumarMaquina">Sumar</button>
    </MapDialogo>

    <MapDialogo v-if="vista?.reglas?.alianzas !== false" :abierto="alianzasAbierto" titulo="Alianzas" @cerrar="alianzasAbierto = false; avisoAlianza = ''">
      <MapAlianzas :vista="vista" :jugador-id="jugadorId" :aviso="avisoAlianza" @accion="onAccionAlianza" />
    </MapDialogo>

    <MapDialogo :abierto="ayudaAbierta" titulo="Manual de Instrucciones" @cerrar="ayudaAbierta = false">
      <MapAyuda :constantes="constantes" :config="vista?.config" :reglas="vista?.reglas" />
    </MapDialogo>

    <MapDialogo :abierto="edificioMenuAbierto !== null" :titulo="edificioMenuAbierto ? tileEn(edificioMenuAbierto.x, edificioMenuAbierto.y)?.ciudad?.nombre || 'Ciudad' : 'Ciudad'" @cerrar="cerrarMenuEdificio">
      <MapCiudadMenu
        v-if="edificioMenuAbierto"
        :vista="vista"
        :jugador-id="jugadorId"
        :posicion="edificioMenuAbierto"
        :constantes="constantes"
        @construir="construir"
        @reclutar="reclutar"
        @mejorar="mejorarCiudad"
        @renombrar="renombrarCiudad"
        @hacer-capital="moverCapital"
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
      <!-- El boton se deshabilita por dos motivos distintos y antes solo se explicaba
           uno: sin el aviso del nombre vacio, el jugador cree que le faltan recursos. -->
      <em v-if="faltaParaFundar" class="motivo-fundar">{{ faltaParaFundar }}</em>
      <em v-else-if="!nombreCiudad.trim()" class="motivo-fundar">poné un nombre para la ciudad</em>
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
          <span>{{ textoDefensor }}</span>
        </p>
        <p class="ataque-nota">
          Terreno del defensor:
          {{ tileEn(ataqueAbierto.hasta.x, ataqueAbierto.hasta.y)?.terreno }}
          <span v-if="tileEn(ataqueAbierto.hasta.x, ataqueAbierto.hasta.y)?.ciudad">
            · la ciudad suma defensa
          </span>
        </p>
        <p v-if="soldadoEnCiudad" class="ataque-nota">
          El golpe cae sobre el soldado: la ciudad no pierde vida hasta que lo derrotes.
        </p>
        <button class="btn-primario" @click="confirmarAtaque">Atacar</button>
      </div>
    </MapDialogo>
  </div>
</template>

<style scoped>
/* La partida ocupa exactamente una pantalla y no scrollea: antes el mapa media
   80vh fijos y el encabezado lo empujaba, asi que habia que bajar para ver el
   tablero y mas abajo todavia para encontrar la cronica. dvh en vez de vh
   porque en celulares y tablets la barra del navegador se muestra y se
   esconde, y con vh el layout salta. */
.map-session {
  /* Fija a la ventana a proposito: el #app global tiene max-width 1280px y
     padding, asi que dentro de esa caja la partida nunca podria ocupar la
     pantalla (de ahi las franjas negras a los costados en monitores anchos).
     z-index bajo para que el toast de errores, que esta en 1001, siga arriba. */
  position: fixed;
  inset: 0;
  z-index: 1;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  padding: 0.6rem;
  color: rgb(var(--t-texto));
  background: rgb(var(--t-fondo));
  overflow: hidden;
}

/* Contenedor del mapa: se come todo el alto sobrante. min-height 0 es lo que
   permite que un hijo flexible pueda ACHICARSE (sin esto un flex item nunca
   baja de su contenido y vuelve a aparecer el scroll). */
.zona-mapa {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  /* Contiene el gesto tactil DENTRO del mapa en vez de bloquear el scroll de
     toda la pagina: bloquearlo con overflow hidden en <html> desactivaba de
     paso el "tirar para recargar" de Android, que en tablet es la unica forma
     comoda de refrescar. El lienzo ya tiene touch-action: none, asi que
     arrastrar el mapa no mueve nada; fuera del mapa el gesto sigue vivo. */
  overscroll-behavior: contain;
}

.lienzo {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
}

/* Los botones bajan de renglon cuando no entran. En una sola fila, en un
   telefono los ultimos (Alianzas, Manual, Salir) quedaban fuera de la pantalla
   y no habia forma de llegar a ellos: la fila no se podia deslizar. */
.botonera-paneles {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
}

.btn-panel {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: rgb(var(--t-flotante) / 0.85);
  color: rgb(var(--t-texto));
  border: 1px solid rgb(var(--t-tinta) / 0.2);
  border-radius: calc(var(--t-radio) * 6px);
  padding: 0.4rem 0.7rem;
  min-height: 44px;
  cursor: pointer;
  font-size: 0.85rem;
  white-space: nowrap;
}

.etiqueta-cargos { font-size: 0.75rem; opacity: 0.85; align-self: center; }
.btn-panel:hover { background: rgb(var(--t-info) / 0.35); }

/* Salir es la unica accion de la botonera que no se puede deshacer: se separa
   del resto y se tiñe para que nadie la toque de paso. */
.btn-salir { margin-left: 0.6rem; border-color: rgb(var(--t-peligro) / 0.5); }
.btn-salir:hover { background: rgb(var(--t-peligro) / 0.35); }

.salida-aviso { margin: 0; line-height: 1.45; }

/* De quien es la casilla ajena que se toco. */
.casilla-ajena {
  margin: 0;
  padding: 0.45rem 0.75rem;
  border-radius: calc(var(--t-radio) * 8px);
  background: rgb(var(--t-tinta) / 0.07);
  border-left: 4px solid rgb(var(--t-peligro));
  color: rgb(var(--t-texto));
  font-size: 0.85rem;
}
.casilla-ajena.aliado { border-left-color: rgb(var(--t-exito)); }
.casilla-ajena.tregua { border-left-color: rgb(var(--t-aviso)); }
.casilla-ajena .color-bando {
  display: inline-block;
  width: 0.9em;
  height: 0.9em;
  border-radius: calc(var(--t-radio) * 3px);
  border: 1px solid rgb(var(--t-tinta) / 0.6);
  margin-right: 0.35rem;
  vertical-align: -0.1em;
}
.campo-maquina { display: flex; flex-direction: column; gap: 0.3rem; }
.campo-maquina select {
  background: rgb(var(--t-control)); color: rgb(var(--t-texto)); border: 1px solid rgb(var(--t-tinta) / 0.2);
  border-radius: calc(var(--t-radio) * 6px); padding: 0.5rem;
}
.salida-fuerte { color: rgb(var(--t-alerta)); }
.btn-peligro { background: rgb(var(--t-peligro-fuerte)); margin-top: 0.4rem; }

.panel-flotante {
  position: absolute;
  z-index: 2;
  background: rgb(var(--t-flotante) / 0.92);
  border: 1px solid rgb(var(--t-tinta) / 0.15);
  border-radius: calc(var(--t-radio) * 8px);
}

.panel-ciudades {
  top: 0.75rem;
  left: 0.75rem;
  width: 15rem;
  max-height: 60%;
  overflow-y: auto;
  padding: 0.6rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.panel-ciudades h3 { margin: 0 0 0.3rem; font-size: 1rem; color: rgb(var(--t-aviso)); }
.panel-vacio { opacity: 0.6; font-style: italic; margin: 0; font-size: 0.85rem; }

.item-ciudad {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
  background: rgb(var(--t-tinta) / 0.06);
  color: rgb(var(--t-texto));
  border: 0;
  border-radius: calc(var(--t-radio) * 6px);
  padding: 0.45rem 0.6rem;
  min-height: 44px;
  cursor: pointer;
  text-align: left;
  font-size: 0.85rem;
}

.item-ciudad:hover { background: rgb(var(--t-info) / 0.35); }
.item-ciudad small { opacity: 0.6; font-size: 0.75rem; }

/* La cronica es el corazon narrativo del juego: va a la vista, no enterrada
   al pie de la pagina. Ancho acotado para no tapar el mapa. El alto lo sigue
   poniendo el propio MapRoundLog (30vh), para no tener dos reglas peleando
   por el mismo max-height. */
.panel-cronica {
  top: 0.75rem;
  right: 0.75rem;
  width: min(24rem, 38%);
}

.cerrar-cronica {
  position: absolute;
  top: 0;
  right: 0;
  z-index: 1;
  width: 44px;
  height: 44px;
  background: transparent;
  color: rgb(var(--t-texto-suave));
  border: 0;
  font-size: 0.85rem;
  cursor: pointer;
}

.cerrar-cronica:hover { color: rgb(var(--t-sobre)); }

/* La cronica ahora vive dentro de un panel que ya pone fondo y borde: sin
   esto se veria un recuadro dentro de otro. */
.panel-cronica :deep(.round-log) {
  background: transparent;
  border: 0;
}

/* En telefonos no hay lugar para paneles al costado: el 38% del ancho deja una
   columna de texto ilegible. Pasan a ocupar el ancho del mapa, arriba, para no
   tapar el boton de recentrar. La botonera baja al pie, al alcance del pulgar:
   solo iconos para que todas entren en una fila y el mapa se quede con el alto. */
@media (max-width: 640px) {
  .map-session { padding: 0.4rem; gap: 0.3rem; }

  .panel-cronica, .panel-ciudades {
    top: 0.5rem;
    left: 0.5rem;
    right: 0.5rem;
    width: auto;
  }
  .panel-ciudades { max-height: 45%; }

  .botonera-paneles {
    order: 1;
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(0, 1fr);
    gap: 0.2rem;
  }
  .etiqueta-cargos, .btn-texto { display: none; }
  .btn-panel { position: relative; justify-content: center; padding: 0; font-size: 1.2rem; }
  .btn-salir { margin-left: 0; }
  .insignia-aviso { position: absolute; top: 0; right: 0; margin: 0; }
}

.sala-espera {
  background: rgb(var(--t-info) / 0.15);
  border-radius: calc(var(--t-radio) * 8px);
  padding: 1rem 1.25rem;
  color: rgb(var(--t-texto));
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}

.sala-codigo {
  margin: 0;
  font-size: 1rem;
}

.sala-codigo strong {
  color: rgb(var(--t-info));
  letter-spacing: 0.2rem;
}

.sala-titulo {
  margin: 0.25rem 0 0;
  font-size: 0.85rem;
  color: rgb(var(--t-texto-suave));
}

.sala-lista {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.sala-etiqueta {
  color: rgb(var(--t-aviso));
  font-size: 0.75rem;
}

.sala-motivo {
  margin: 0.25rem 0 0;
  color: rgb(var(--t-alerta));
  font-size: 0.85rem;
}

.insignia-aviso {
  margin-left: 0.35rem; background: rgb(var(--t-alerta)); color: rgb(var(--t-sobre)); border-radius: 999px;
  padding: 0 0.4rem; font-size: 0.75rem; font-weight: 700;
}
.entrada-nombre {
  background: rgb(var(--t-sombra) / 0.3); color: rgb(var(--t-texto));
  border: 1px solid rgb(var(--t-tinta) / 0.2); border-radius: calc(var(--t-radio) * 6px);
  padding: 0.5rem 0.7rem; font-size: 1rem;
}
.costo-fundar { opacity: 0.7; font-size: 0.75rem; }
.motivo-fundar { color: rgb(var(--t-alerta)); font-size: 0.75rem; font-style: normal; }
.ataque { display: flex; flex-direction: column; gap: 0.4rem; }
.ataque-linea { display: flex; justify-content: space-between; gap: 1rem; margin: 0; }
.ataque-nota { opacity: 0.7; font-size: 0.75rem; margin: 0.3rem 0 0.6rem; }
.btn-primario {
  background: rgb(var(--t-info)); color: rgb(var(--t-sobre)); border: 0; border-radius: calc(var(--t-radio) * 6px);
  padding: 0.5rem 0.9rem; min-height: 44px; font-size: 0.85rem; cursor: pointer;
}
.btn-primario:disabled { opacity: 0.6; cursor: not-allowed; }
</style>
