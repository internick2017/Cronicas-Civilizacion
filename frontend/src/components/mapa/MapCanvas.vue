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

const tamano = () => props.vista.config.tamanoMapa

// Salud maxima de un tipo de unidad, segun las constantes del backend. Si
// todavia no cargaron, no hay forma de saber el maximo real: no se inventa.
function saludMaximaDe(tipo) {
  const unidad = props.constantes?.unidades?.find((u) => u.tipo === tipo)
  return unidad ? unidad.salud : null
}

// --- Dibujado ---------------------------------------------------------

function limpiar(capa) {
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

function redibujar() {
  if (!app) return
  dibujarTerreno()
  dibujarTerritorio()
  dibujarPiezas()
  dibujarOverlay()
  dibujarNiebla()
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

onMounted(async () => {
  await cargarSprites()

  app = new Application()
  await app.init({
    background: 0x0f1419,
    resizeTo: contenedor.value,
    antialias: false
  })
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

  redibujar()
})

onUnmounted(() => {
  if (app) {
    app.destroy(true, { children: true })
    app = null
  }
})

watch(() => props.vista, redibujar, { deep: true })
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
