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

function dibujarTerreno() {
  limpiar(capaTerreno)
  for (const tile of props.vista.mapa) {
    if (!tile.descubierto) continue
    const url = SPRITE_TERRENO[tile.terreno]
    if (!url) continue
    const sprite = new Sprite(Assets.get(url))
    sprite.width = TILE
    sprite.height = TILE
    sprite.x = tile.x * TILE
    sprite.y = tile.y * TILE
    capaTerreno.addChild(sprite)
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
// de terreno queda directamente fuera del ciclo de actualizacion normal: se
// dibuja una unica vez (o si cambia el tamano del mapa).
function actualizarDesdeVista() {
  if (!app) return
  const vista = props.vista
  const tam = vista.config.tamanoMapa

  if (tam !== tamanoAnterior) {
    tamanoAnterior = tam
    dibujarTerreno()
  }

  const ct = claveTerritorio(vista)
  if (ct !== claveTerritorioAnterior) {
    claveTerritorioAnterior = ct
    dibujarTerritorio()
  }

  const cp = clavePiezas(vista)
  if (cp !== clavePiezasAnterior) {
    clavePiezasAnterior = cp
    dibujarPiezas()
  }

  const cn = claveNiebla(vista)
  if (cn !== claveNieblaAnterior) {
    claveNieblaAnterior = cn
    dibujarNiebla()
  }
}

// --- Interaccion ------------------------------------------------------

function onPointerDown(evento) {
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

  // Primer dibujado: fuerza las 4 capas (las claves "anterior" arrancan en
  // null, asi que actualizarDesdeVista() las redibuja todas la primera vez).
  actualizarDesdeVista()
  dibujarOverlay()
})

onUnmounted(() => {
  desmontado = true
  if (app) {
    app.destroy(true, { children: true })
    app = null
  }
})

watch(() => props.vista, actualizarDesdeVista, { deep: true })
watch(() => [props.seleccion, props.alcanzables], dibujarOverlay, { deep: true })
watch(() => props.constantes, dibujarPiezas, { deep: true })

defineExpose({ TILE, mundoRef: () => mundo, appRef: () => app })
</script>

<template>
  <div ref="contenedor" class="map-canvas" />
</template>

<style scoped>
.map-canvas {
  width: 100%;
  height: 70vh;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 8px;
  overflow: hidden;
  touch-action: none;
}
</style>
