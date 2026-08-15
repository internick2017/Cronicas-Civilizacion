<!-- frontend/src/components/mapa/MapCanvas.vue -->
<script setup>
import { ref, onMounted, onUnmounted, watch } from 'vue'
import { Application, Container, Sprite, Graphics, Assets } from 'pixi.js'
import { SPRITE_TERRENO, SPRITE_CIUDAD, SPRITE_UNIDAD, colorDeJugador, cargarSprites } from '../../mapa/sprites.js'

const props = defineProps({
  vista: { type: Object, required: true },
  jugadorId: { type: String, required: true },
  seleccion: { type: Object, default: null },
  alcanzables: { type: Array, default: () => [] },
  constantes: { type: Object, default: null }
})
const emit = defineEmits(['click-tile'])

const TILE = 48 // pixeles por casilla en zoom 1
const ZOOM_MIN = 0.35
const ZOOM_MAX = 2.5

const contenedor = ref(null)
let app = null
let mundo = null       // container que se mueve y escala (la camara)
let capaTerreno = null
let capaTerritorio = null
let capaPiezas = null  // ciudades y ejercitos
let capaOverlay = null // seleccion, alcanzables
let capaNiebla = null

// Claves usadas para diffear la vista anterior contra la nueva y redibujar
// solo las capas cuyos datos relevantes realmente cambiaron. Ver comentario
// en actualizarDesdeVista() para la justificacion de esta estrategia.
let tamanoAnterior = null
let claveTerritorioAnterior = null
let clavePiezasAnterior = null
let claveNieblaAnterior = null

// Snapshot liviano (no la vista entera, solo lo que animarCambios necesita)
// del estado de ciudades/ejercitos en la ultima vez que se redibujo la capa
// de piezas. Se usa exclusivamente para decidir que animar; el diffeo real
// de "hace falta redibujar" lo sigue haciendo clavePiezasAnterior de arriba.
let piezasAnterior = null

// Sprites de ciudad actualmente en el mapa, indexados por "x:y". Se
// reconstruye en cada dibujarPiezas() y le permite a animarCambios() ubicar
// el sprite recien creado sin comparar por posicion (fragil: dos ciudades
// nunca comparten x/y, pero comparar floats de x/y invita a bugs sutiles).
let spritesCiudad = new Map()

// Estado de arrastre del mapa (paneo) vs. click en una casilla. Ver
// onPointerDown/Move/Up: un click real no debe mover el mouse mas de unos
// pocos pixeles, si no fue paneo y no debe emitir click-tile.
let arrastrando = false
let arrastreInicio = null
let huboArrastre = false

// Ids de requestAnimationFrame en vuelo (animarEscala/destellar), para poder
// cancelarlos en onUnmounted. Sin esto, una animacion en curso cuando el
// jugador sale de la partida sigue corriendo y termina tocando sprites ya
// destruidos por app.destroy().
const animacionesActivas = new Set()

// Set de claves "x:y" de las casillas que ya tienen sprite de terreno creado.
// El terreno es aditivo (ver comentario en actualizarTerreno): una vez que una
// casilla se descubre nunca vuelve a ocultarse, asi que no hace falta volver a
// dibujarla. Este set es lo que permite distinguir "ya tiene sprite" de
// "todavia no", sin comparar contra la vista anterior completa.
let terrenoDibujado = null

// Se pone en true la primera vez que la camara se centra sobre una capital
// propia real (no el centro de fallback del mapa). Ver comentario en
// centrarEnCapitalSiCorresponde: sin esta bandera, cada actualizacion de
// vista volveria a recentrar y pelearia contra el jugador moviendo el mapa
// a proposito.
let yaSeCentroEnCapital = false

const tamano = () => props.vista.config.tamanoMapa

// Salud maxima de un tipo de unidad, segun las constantes del backend. Si
// todavia no cargaron, no hay forma de saber el maximo real: no se inventa.
function saludMaximaDe(tipo) {
  const unidad = props.constantes?.unidades?.find((u) => u.tipo === tipo)
  return unidad ? unidad.salud : null
}

// --- Dibujado ---------------------------------------------------------

function limpiar(capa) {
  // destroy() SIN opciones, a proposito: las texturas vienen de Assets.get()
  // y son compartidas entre sprites (ej. todos los tiles "plains" usan la
  // misma textura cacheada por PixiJS). Si se pasara destroy({texture: true})
  // se destruiria esa textura compartida y romperia cualquier otro sprite del
  // mapa que todavia la este usando. No "mejorar" esto sin cambiar tambien a
  // texturas no compartidas por sprite.
  capa.removeChildren().forEach(hijo => hijo.destroy())
}

// Reconstruccion completa de la capa de terreno: destruye todos los sprites
// existentes y arranca de cero. Solo corresponde usar esto cuando el mapa en
// si cambio (tamano distinto / otra partida), nunca en el ciclo normal de
// actualizacion por accion (ver actualizarTerreno mas abajo).
function dibujarTerrenoCompleto() {
  limpiar(capaTerreno)
  terrenoDibujado = new Set()
  actualizarTerreno()
}

// El terreno es ADITIVO: una casilla descubierta nunca vuelve a ocultarse
// (a diferencia de territorio/piezas/niebla, que si pueden cambiar de un lado
// a otro). Por eso no hace falta diffear con clave ni reconstruir la capa en
// cada actualizacion: alcanza con recorrer la vista y agregar sprite SOLO
// para las casillas descubiertas que todavia no tienen uno (rastreado en
// terrenoDibujado). Esto es lo que corrige el bug de "agujeros negros" al
// explorar sin reintroducir el costo de redibujar todo el mapa por accion.
function actualizarTerreno() {
  for (const tile of props.vista.mapa) {
    if (!tile.descubierto) continue
    const clave = `${tile.x}:${tile.y}`
    if (terrenoDibujado.has(clave)) continue
    const url = SPRITE_TERRENO[tile.terreno]
    if (!url) continue
    const sprite = new Sprite(Assets.get(url))
    sprite.width = TILE
    sprite.height = TILE
    sprite.x = tile.x * TILE
    sprite.y = tile.y * TILE
    capaTerreno.addChild(sprite)
    terrenoDibujado.add(clave)
  }
}

function dibujarTerritorio() {
  limpiar(capaTerritorio)
  const g = new Graphics()
  for (const tile of props.vista.mapa) {
    if (!tile.descubierto || !tile.dueno) continue
    g.rect(tile.x * TILE, tile.y * TILE, TILE, TILE)
      .fill({ color: colorDeJugador(props.vista.jugadores, tile.dueno), alpha: 0.22 })
  }
  capaTerritorio.addChild(g)
}

function dibujarPiezas() {
  // Guarda: el watcher de props.constantes puede disparar esta funcion antes
  // de que onMounted haya terminado de crear las capas de Pixi (ej. si las
  // constantes llegan mientras cargarSprites()/app.init() todavia estan en
  // vuelo). Sin esto, limpiar(capaPiezas) revienta contra null.
  if (!capaPiezas) return
  limpiar(capaPiezas)
  spritesCiudad.clear()
  for (const tile of props.vista.mapa) {
    if (!tile.descubierto) continue

    if (tile.ciudad) {
      const sprite = new Sprite(Assets.get(SPRITE_CIUDAD))
      sprite.width = TILE
      sprite.height = TILE
      sprite.x = tile.x * TILE
      sprite.y = tile.y * TILE
      if (tile.dueno) sprite.tint = colorDeJugador(props.vista.jugadores, tile.dueno)
      capaPiezas.addChild(sprite)
      spritesCiudad.set(`${tile.x}:${tile.y}`, sprite)
    }

    if (tile.ejercito) {
      const url = SPRITE_UNIDAD[tile.ejercito.tipo] || SPRITE_UNIDAD.warrior
      const sprite = new Sprite(Assets.get(url))
      sprite.width = TILE * 0.7
      sprite.height = TILE * 0.7
      sprite.x = tile.x * TILE + TILE * 0.15
      sprite.y = tile.y * TILE + TILE * 0.15
      if (tile.ejercito.dueno) {
        sprite.tint = colorDeJugador(props.vista.jugadores, tile.ejercito.dueno)
      }
      capaPiezas.addChild(sprite)

      // Barra de salud, solo si esta danado y se conoce el maximo real.
      const salud = tile.ejercito.salud
      const maxSalud = saludMaximaDe(tile.ejercito.tipo)
      if (typeof salud === 'number' && maxSalud && salud < maxSalud) {
        const barra = new Graphics()
        barra.rect(tile.x * TILE + 4, tile.y * TILE + TILE - 7, TILE - 8, 4).fill({ color: 0x000000, alpha: 0.6 })
        barra.rect(tile.x * TILE + 4, tile.y * TILE + TILE - 7, (TILE - 8) * (salud / maxSalud), 4).fill({ color: 0x2ecc71 })
        capaPiezas.addChild(barra)
      }
    }
  }
}

function dibujarOverlay() {
  // Guarda: igual que en dibujarPiezas, el watcher de seleccion/alcanzables
  // puede disparar esta funcion antes de que onMounted termine de crear las
  // capas de Pixi (cargarSprites()/app.init() todavia en vuelo). Sin esto,
  // limpiar(capaOverlay) revienta contra null.
  if (!capaOverlay) return
  limpiar(capaOverlay)
  const g = new Graphics()
  for (const pos of props.alcanzables) {
    g.rect(pos.x * TILE, pos.y * TILE, TILE, TILE).fill({ color: 0xf1c40f, alpha: 0.25 })
    g.rect(pos.x * TILE + 1, pos.y * TILE + 1, TILE - 2, TILE - 2).stroke({ width: 2, color: 0xf1c40f })
  }
  if (props.seleccion) {
    g.rect(props.seleccion.x * TILE + 1, props.seleccion.y * TILE + 1, TILE - 2, TILE - 2)
      .stroke({ width: 3, color: 0xffffff })
  }
  capaOverlay.addChild(g)
}

function dibujarNiebla() {
  limpiar(capaNiebla)
  const g = new Graphics()
  for (const tile of props.vista.mapa) {
    if (tile.descubierto) continue
    g.rect(tile.x * TILE, tile.y * TILE, TILE, TILE).fill({ color: 0x0a0a0f, alpha: 0.96 })
  }
  capaNiebla.addChild(g)
}

// --- Animaciones --------------------------------------------------------

// Snapshot liviano de ciudades/ejercitos: solo lo que animarCambios necesita
// para detectar "aparecio" / "perdio salud", no la vista completa (evita un
// structuredClone caro de un mapa de hasta 60x60 en cada accion).
function snapshotPiezas(vista) {
  const mapa = new Map()
  for (const tile of vista.mapa) {
    if (!tile.descubierto) continue
    if (tile.ciudad || tile.ejercito) {
      mapa.set(`${tile.x}:${tile.y}`, {
        ciudad: !!tile.ciudad,
        salud: tile.ejercito ? tile.ejercito.salud : null
      })
    }
  }
  return mapa
}

// Compara el estado nuevo contra el snapshot anterior para saber que animar.
// El backend no manda "que paso", manda "como quedo todo": hay que inferir
// el evento comparando. Se llama DESPUES de dibujarPiezas(), asi
// spritesCiudad ya tiene el sprite recien creado para animar.
function animarCambios(vista, previa) {
  if (!previa) return // primer dibujado: nada que comparar todavia
  for (const tile of vista.mapa) {
    if (!tile.descubierto) continue
    const clave = `${tile.x}:${tile.y}`
    const antes = previa.get(clave)

    // Ciudad nueva: aparece creciendo.
    if (tile.ciudad && !(antes && antes.ciudad)) {
      const sprite = spritesCiudad.get(clave)
      if (sprite) animarEscala(sprite, 0.2, 1, 250)
    }

    // Ejercito danado: destello rojo.
    if (tile.ejercito && antes && antes.salud != null && tile.ejercito.salud < antes.salud) {
      destellar(tile.x, tile.y, 0xe74c3c)
    }
  }
}

function animarEscala(sprite, desde, hasta, ms) {
  const anchoFinal = sprite.width
  const altoFinal = sprite.height
  const inicio = performance.now()
  // idPropio guarda el id del frame que esta por ejecutarse (no el
  // siguiente): se borra de animacionesActivas apenas ese frame corre, sea
  // que la animacion siga o termine aca. Si no se borrara, el Set crece para
  // siempre con ids de frames que ya se ejecutaron y nunca van a cancelarse.
  let idPropio = null
  const paso = () => {
    if (idPropio !== null) animacionesActivas.delete(idPropio)
    if (sprite.destroyed) return // componente/capa destruidos a mitad de animacion
    const t = Math.min(1, (performance.now() - inicio) / ms)
    const escala = desde + (hasta - desde) * t
    sprite.width = anchoFinal * escala
    sprite.height = altoFinal * escala
    if (t < 1) {
      idPropio = requestAnimationFrame(paso)
      animacionesActivas.add(idPropio)
    }
  }
  paso()
}

function destellar(x, y, color) {
  if (!capaOverlay) return
  const g = new Graphics()
  g.rect(x * TILE, y * TILE, TILE, TILE).fill({ color, alpha: 0.6 })
  capaOverlay.addChild(g)
  const inicio = performance.now()
  let idPropio = null
  const paso = () => {
    if (idPropio !== null) animacionesActivas.delete(idPropio)
    if (g.destroyed) return
    const t = Math.min(1, (performance.now() - inicio) / 350)
    g.alpha = 0.6 * (1 - t)
    if (t < 1) {
      idPropio = requestAnimationFrame(paso)
      animacionesActivas.add(idPropio)
    } else {
      g.destroy()
    }
  }
  paso()
}

// --- Camara: zoom y paneo ------------------------------------------------

function aplicarZoom(delta, centro) {
  const anterior = mundo.scale.x
  const nuevo = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, anterior * (delta > 0 ? 0.9 : 1.1)))
  if (nuevo === anterior) return
  // Se hace zoom hacia el puntero, no hacia el origen: si no, el mapa se
  // escapa de la pantalla apenas te acercas.
  const factor = nuevo / anterior
  mundo.x = centro.x - (centro.x - mundo.x) * factor
  mundo.y = centro.y - (centro.y - mundo.y) * factor
  mundo.scale.set(nuevo)
}

function centrarEn(x, y, zoom) {
  if (zoom != null) mundo.scale.set(zoom)
  mundo.x = app.screen.width / 2 - x * TILE * mundo.scale.x
  mundo.y = app.screen.height / 2 - y * TILE * mundo.scale.y
}

// Calcula el rectangulo (en casillas) que contiene todas las casillas
// descubiertas, con un margen para que no quede pegado al borde de la
// pantalla, y el zoom que hace entrar ese rectangulo en el lienzo actual
// (respetando ZOOM_MIN/ZOOM_MAX). Devuelve null si todavia no hay NADA
// descubierto (partida en 'esperando' antes de que exista la capital): en
// ese caso no hay rectangulo posible y quien llama debe usar un fallback.
const MARGEN_ENCUADRE = 1.5 // casillas de aire alrededor de la zona descubierta

function calcularEncuadre() {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const tile of props.vista.mapa) {
    if (!tile.descubierto) continue
    if (tile.x < minX) minX = tile.x
    if (tile.x > maxX) maxX = tile.x
    if (tile.y < minY) minY = tile.y
    if (tile.y > maxY) maxY = tile.y
  }
  if (minX === Infinity) return null

  const anchoCasillas = (maxX - minX + 1) + MARGEN_ENCUADRE * 2
  const altoCasillas = (maxY - minY + 1) + MARGEN_ENCUADRE * 2
  const centroX = (minX + maxX + 1) / 2
  const centroY = (minY + maxY + 1) / 2

  const zoomAncho = app.screen.width / (anchoCasillas * TILE)
  const zoomAlto = app.screen.height / (altoCasillas * TILE)
  const zoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.min(zoomAncho, zoomAlto)))

  return { x: centroX, y: centroY, zoom }
}

// Reencuadra la camara para que la zona descubierta ocupe el lienzo (en vez
// de arrancar siempre en zoom 1, que deja un parche minusculo de terreno
// perdido en un mar de niebla). Si todavia no hay nada descubierto, cae al
// centro del mapa completo sin tocar el zoom.
function reencuadrarZonaDescubierta() {
  const encuadre = calcularEncuadre()
  if (!encuadre) {
    centrarEn(tamano() / 2, tamano() / 2)
    return
  }
  centrarEn(encuadre.x, encuadre.y, encuadre.zoom)
}

// Devuelve null si la capital propia todavia no existe (partida en
// 'esperando', o el jugador headed con codigo antes de que el anfitrion
// inicie). A diferencia de antes, NO cae a un fallback del centro del mapa:
// ese fallback es responsabilidad de quien llama (ver centrarEnCapitalSiCorresponde
// y recentrar), porque "no hay capital todavia" y "la capital esta en el
// centro" son cosas distintas y conviene no confundirlas.
function capitalPropia() {
  const tile = props.vista.mapa.find(t => t.descubierto && t.ciudad && t.dueno === props.jugadorId)
  return tile ? { x: tile.x, y: tile.y } : null
}

// Centra la camara en la capital propia la PRIMERA VEZ que aparece (por
// ejemplo, quien se unio con codigo entra con la partida en 'esperando', sin
// ciudad todavia; cuando el anfitrion inicia y su capital aparece en el
// proximo actualizarDesdeVista, recien ahi hay algo real para centrar). No
// vuelve a centrar despues de la primera vez: si lo hiciera, pelearia contra
// el jugador cada vez que el mueve el mapa a proposito (paneo/zoom). El
// recentrado manual posterior lo cubre el boton (ver recentrar()).
function centrarEnCapitalSiCorresponde() {
  if (yaSeCentroEnCapital || !app) return
  const capital = capitalPropia()
  if (!capital) return
  reencuadrarZonaDescubierta()
  yaSeCentroEnCapital = true
}

// Recentrado manual (boton "Ir a mi capital"): siempre reencuadra, sin
// importar si ya se centro antes. Si todavia no hay nada descubierto
// (partida 'esperando'), reencuadrarZonaDescubierta() cae al centro del
// mapa, para que el boton nunca quede sin efecto visible.
function recentrar() {
  if (!app) return
  reencuadrarZonaDescubierta()
  yaSeCentroEnCapital = true
}

// Claves de comparacion: strings compactos con solo los datos que le importan
// a cada capa. Si la clave no cambio respecto de la vista anterior, esa capa
// ni se toca. Evita reconstruir sprites de casillas que no cambiaron.
function claveTerritorio(vista) {
  return vista.mapa.map(t => (t.descubierto && t.dueno) ? `${t.x}:${t.y}:${t.dueno}` : '').join('|')
}
function clavePiezas(vista) {
  return vista.mapa.map(t => {
    if (!t.descubierto || (!t.ciudad && !t.ejercito)) return ''
    const c = t.ciudad ? `c${t.dueno || ''}` : ''
    const e = t.ejercito ? `e${t.ejercito.tipo}${t.ejercito.dueno || ''}:${t.ejercito.salud}` : ''
    return `${t.x}:${t.y}:${c}${e}`
  }).join('|')
}
function claveNiebla(vista) {
  return vista.mapa.map(t => (t.descubierto ? '1' : '0')).join('')
}

// Estrategia de redibujado incremental (CRITICO, ver review de task-8):
// el watch profundo sobre props.vista se dispara con cada accion de
// cualquier jugador (llega por socket), y en un mapa de 60x60 eso puede ser
// muchas veces por minuto. Redibujar TODO el arbol de sprites (destruir +
// recrear terreno + territorio + piezas + niebla) en cada una de esas
// actualizaciones es carisimo y ademas innecesario: el terreno jamas cambia
// despues de generado, y territorio/piezas/niebla normalmente solo cambian
// en unas pocas casillas por accion (ej. una unidad se mueve, se revela
// niebla alrededor de un explorador).
//
// Se eligio diffear por clave (string derivado de los campos relevantes de
// cada capa) contra la vista anterior, en vez de reusar/mutar sprites
// existentes casilla por casilla. Es mas simple de razonar y mantener que un
// reconciliador tipo virtual-DOM, y ya reduce el costo real de ~O(casillas)
// objetos Pixi por accion a ~O(casillas) SOLO cuando esa capa especifica
// cambio, y a practicamente cero cuando no cambio nada en esa capa. La capa
// de terreno usa una estrategia distinta (aditiva, ver actualizarTerreno):
// se reconstruye entera solo si cambia el tamano del mapa, y en el resto de
// los casos solo se agregan sprites para las casillas recien descubiertas.
function actualizarDesdeVista() {
  if (!app) return
  const vista = props.vista
  const tam = vista.config.tamanoMapa

  if (tam !== tamanoAnterior) {
    tamanoAnterior = tam
    dibujarTerrenoCompleto()
  } else {
    actualizarTerreno()
  }

  const ct = claveTerritorio(vista)
  if (ct !== claveTerritorioAnterior) {
    claveTerritorioAnterior = ct
    dibujarTerritorio()
  }

  const cp = clavePiezas(vista)
  if (cp !== clavePiezasAnterior) {
    clavePiezasAnterior = cp
    const previa = piezasAnterior
    dibujarPiezas()
    animarCambios(vista, previa)
    piezasAnterior = snapshotPiezas(vista)
  }

  const cn = claveNiebla(vista)
  if (cn !== claveNieblaAnterior) {
    claveNieblaAnterior = cn
    dibujarNiebla()
  }

  centrarEnCapitalSiCorresponde()
}

// --- Interaccion ------------------------------------------------------

// El paneo y el click en una casilla comparten el mismo gesto (pointer
// down -> up). Se distinguen por umbral de movimiento: si el puntero se
// movio mas de unos pixeles entre down y up, fue arrastre y NO se emite
// click-tile. Sin esto, cada vez que el jugador mueve el mapa se le abriria
// el dialogo de accion de la casilla donde solto el mouse.
//
// OJO (bug real detectado en review): el umbral tiene que medirse contra el
// punto FIJO donde empezo el gesto (puntoDown), no contra la posicion de
// mundo actualizada en el evento anterior. Si se compara contra mundo.x/y ya
// movido, cada pointermove individual vuelve a arrancar de "cero" y un
// arrastre lento hecho de muchos pasos chicos (cualquier mouse/trackpad de
// alta frecuencia de reporte) nunca acumula lo suficiente para superar el
// umbral: huboArrastre queda en false y se emite click-tile igual. Por eso
// puntoDown guarda la posicion GLOBAL del puntero en el pointerdown y se
// mantiene fija durante todo el gesto; arrastreInicio, aparte, guarda el
// offset necesario para mover mundo.
let puntoDown = null

function onPointerDown(evento) {
  arrastrando = true
  huboArrastre = false
  puntoDown = { x: evento.global.x, y: evento.global.y }
  arrastreInicio = { x: evento.global.x - mundo.x, y: evento.global.y - mundo.y }
}

function onPointerMove(evento) {
  if (!arrastrando) return
  if (Math.abs(evento.global.x - puntoDown.x) > 3 || Math.abs(evento.global.y - puntoDown.y) > 3) {
    huboArrastre = true
  }
  mundo.x = evento.global.x - arrastreInicio.x
  mundo.y = evento.global.y - arrastreInicio.y
}

function onPointerUp(evento) {
  arrastrando = false
  if (huboArrastre) return // fue un paneo, no un click en la casilla
  const local = mundo.toLocal(evento.global)
  const x = Math.floor(local.x / TILE)
  const y = Math.floor(local.y / TILE)
  if (x < 0 || y < 0 || x >= tamano() || y >= tamano()) return
  emit('click-tile', { x, y })
}

// --- Ciclo de vida ----------------------------------------------------

// Bandera de desmontaje: onMounted tiene dos await (cargarSprites, app.init)
// antes de los cuales el jugador puede salir de la partida y desmontar este
// componente. Si eso pasa, onUnmounted corre con app todavia null y no limpia
// nada; sin esta bandera, el onMounted que sigue en vuelo terminaria creando
// la Application, haciendo appendChild sobre un ref ya desmontado (o null,
// crash), y dejando un contexto WebGL vivo que nunca se destruye (fuga de
// GPU). Se chequea despues de CADA await.
let desmontado = false

onMounted(async () => {
  await cargarSprites()
  if (desmontado) return

  const nuevaApp = new Application()
  await nuevaApp.init({
    background: 0x0f1419,
    resizeTo: contenedor.value,
    antialias: false
  })
  if (desmontado) {
    // Ya se desmonto mientras esperabamos app.init(): el contexto WebGL ya
    // fue creado, hay que destruirlo para no dejarlo vivo sin dueno.
    nuevaApp.destroy(true, { children: true })
    return
  }
  app = nuevaApp
  contenedor.value.appendChild(app.canvas)

  mundo = new Container()
  capaTerreno = new Container()
  capaTerritorio = new Container()
  capaPiezas = new Container()
  capaOverlay = new Container()
  capaNiebla = new Container()
  mundo.addChild(capaTerreno, capaTerritorio, capaPiezas, capaOverlay, capaNiebla)
  app.stage.addChild(mundo)

  app.stage.eventMode = 'static'
  app.stage.hitArea = app.screen
  app.stage.on('pointerdown', onPointerDown)
  app.stage.on('pointermove', onPointerMove)
  app.stage.on('pointerup', onPointerUp)
  app.stage.on('pointerupoutside', () => { arrastrando = false })
  app.canvas.addEventListener('wheel', (e) => {
    e.preventDefault()
    aplicarZoom(e.deltaY, { x: e.offsetX, y: e.offsetY })
  }, { passive: false })

  // Primer dibujado: fuerza las 4 capas (las claves "anterior" arrancan en
  // null, asi que actualizarDesdeVista() las redibuja todas la primera vez).
  // piezasAnterior sigue siendo null en ese primer paso, asi que
  // animarCambios() no tiene nada contra que comparar: no tiene sentido
  // animar la aparicion de todo el mapa al entrar a la partida.
  actualizarDesdeVista()
  dibujarOverlay()

  // Si ya hay capital propia (ej. quien crea la partida y la inicia de una),
  // se reencuadra de entrada sobre la zona descubierta. Si no (quien se unio
  // con codigo y todavia esta en 'esperando'), actualizarDesdeVista() se
  // encarga de reencuadrar apenas aparezca en una vista posterior; hasta
  // entonces se arranca en el centro del mapa completo, mejor que quedar en
  // (0,0).
  const capital = capitalPropia()
  if (capital) {
    reencuadrarZonaDescubierta()
    yaSeCentroEnCapital = true
  } else {
    centrarEn(tamano() / 2, tamano() / 2)
  }
})

onUnmounted(() => {
  desmontado = true
  animacionesActivas.forEach(id => cancelAnimationFrame(id))
  animacionesActivas.clear()
  if (app) {
    app.destroy(true, { children: true })
    app = null
  }
})

watch(() => props.vista, actualizarDesdeVista, { deep: true })
watch(() => [props.seleccion, props.alcanzables], dibujarOverlay, { deep: true })
watch(() => props.constantes, dibujarPiezas, { deep: true })

defineExpose({ TILE, mundoRef: () => mundo, appRef: () => app, recentrar })
</script>

<template>
  <div class="map-canvas-wrap">
    <div ref="contenedor" class="map-canvas" />
    <button type="button" class="btn-recentrar" title="Ir a mi capital" @click="recentrar">
      🏠 Mi capital
    </button>
  </div>
</template>

<style scoped>
.map-canvas-wrap {
  position: relative;
}

.map-canvas {
  width: 100%;
  height: 70vh;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  overflow: hidden;
  touch-action: none;
}

.btn-recentrar {
  position: absolute;
  bottom: 0.75rem;
  right: 0.75rem;
  background: rgba(15, 20, 25, 0.85);
  color: #ecf0f1;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  padding: 0.5rem 0.8rem;
  cursor: pointer;
  font-size: 0.9rem;
}

.btn-recentrar:hover {
  background: rgba(52, 152, 219, 0.35);
}
</style>
