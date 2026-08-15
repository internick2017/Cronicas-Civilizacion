// Mapeo de valores del dominio a archivos de sprite. Un solo lugar donde
// cambiar el arte sin tocar el renderizador.
import { Assets } from 'pixi.js'

const BASE = '/assets/mapa'

export const SPRITE_TERRENO = {
  plains: `${BASE}/terreno-plains.png`,
  forest: `${BASE}/terreno-forest.png`,
  mountains: `${BASE}/terreno-mountains.png`,
  desert: `${BASE}/terreno-desert.png`,
  water: `${BASE}/terreno-water.png`,
  hills: `${BASE}/terreno-hills.png`
}

export const SPRITE_CIUDAD = `${BASE}/ciudad.png`

export const SPRITE_UNIDAD = {
  warrior: `${BASE}/unidad-warrior.png`,
  archer: `${BASE}/unidad-archer.png`,
  spearman: `${BASE}/unidad-spearman.png`,
  cavalry: `${BASE}/unidad-cavalry.png`,
  catapult: `${BASE}/unidad-catapult.png`
}

// Colores de bando. Se aplican como tinte sobre el MISMO sprite, asi no hacen
// falta cinco juegos de arte distintos.
export const COLORES_JUGADOR = [0x3498db, 0xe74c3c, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xe67e22, 0x1abc9c, 0xecf0f1]

export const colorDeJugador = (jugadores, jugadorId) => {
  const i = jugadores.findIndex(j => j.id === jugadorId)
  return i === -1 ? 0xffffff : COLORES_JUGADOR[i % COLORES_JUGADOR.length]
}

export async function cargarSprites() {
  const urls = [
    ...Object.values(SPRITE_TERRENO),
    SPRITE_CIUDAD,
    ...Object.values(SPRITE_UNIDAD)
  ]
  await Assets.load(urls)
}
