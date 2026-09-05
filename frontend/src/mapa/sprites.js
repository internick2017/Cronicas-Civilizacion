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
  hills: `${BASE}/terreno-hills.png`,
  // El rio reusa el arte del agua y se distingue por el tinte (ver
  // TINTE_TERRENO): es agua, pero clara y corriente, no el mar profundo.
  river: `${BASE}/terreno-water.png`
}

// Color por el que se MULTIPLICA cada sprite de terreno al dibujarlo.
//
// Los sprites de Kenney vienen casi todos como campos planos y palidos, y dos
// de ellos eran el problema real de legibilidad del mapa: la montana es un
// gris AZULADO palido y el agua un celeste palido, o sea el mismo valor y casi
// la misma saturacion. A 48 pixeles por casilla, y con el tinte de territorio
// y la niebla encima, no habia forma de distinguir una cordillera de un mar.
//
// El tinte multiplica, asi que solo puede oscurecer: cada valor de aca es
// "hacia donde" se lleva ese terreno, nunca un color final. Se eligio esto
// antes que arte nuevo porque arregla la confusion en un solo archivo y se
// deshace en una linea si no convence.
export const TINTE_TERRENO = {
  // Azul profundo: el mar tiene que ser lo mas saturado del tablero, porque es
  // lo unico que hay que reconocer de un vistazo sin pensar.
  water: 0x2f6fb0,
  // Verde agua, no azul: el rio tiene que salirse de la familia del mar. Con
  // un celeste (era 0x7fc8d8) compartia tinte Y dibujo con el mar, y a 48
  // pixeles se leian igual; el dueno del juego lo confirmo mirandolo. La otra
  // mitad del arreglo es ROTACION_TERRENO, aca abajo.
  river: 0x7fd8b0,
  // Gris piedra tibio, sin nada de azul: es lo que deja de parecerse al agua.
  mountains: 0xb0a89c,
  // Marron calido, para separarla del desierto palido de al lado.
  hills: 0xc8b090,
  // Arena mas saturada: el desierto era casi blanco y competia con todo.
  desert: 0xf0d090,
  // El bosque se oscurece para no confundirse con la llanura, que queda tal
  // cual esta (el tinte no puede aclarar, asi que se separa al reves).
  forest: 0x90c090,
  plains: 0xffffff
}

// Cuanto se GIRA el sprite de cada terreno al dibujarlo, en radianes.
//
// El rio reusa el arte del agua, asi que compartia con el mar hasta el dibujo
// de las olas: mismo patron, mismo angulo, y solo un tinte de diferencia. Con
// un cuarto de vuelta la corriente corre perpendicular al mar, que es una
// diferencia que el ojo agarra antes de mirar el color.
//
// Se hace aca y no con arte nuevo porque no hay sprite de rio, y girar el que
// hay cuesta una linea y se deshace en una linea.
export const ROTACION_TERRENO = {
  river: Math.PI / 2
}

export const SPRITE_CIUDAD = `${BASE}/ciudad.png`

export const SPRITE_UNIDAD = {
  warrior: `${BASE}/unidad-warrior.png`,
  archer: `${BASE}/unidad-archer.png`,
  spearman: `${BASE}/unidad-spearman.png`,
  cavalry: `${BASE}/unidad-cavalry.png`,
  catapult: `${BASE}/unidad-catapult.png`,
  // El legionario existe en el dominio desde la tecnologia 'formacionMilitar',
  // pero no tenia sprite: el renderizador caia a `|| SPRITE_UNIDAD.warrior` y
  // se dibujaba como un guerrero, o sea que la unidad que desbloquea una
  // tecnologia entera era invisible en el tablero.
  legionary: `${BASE}/unidad-legionary.png`,
  warship: `${BASE}/unidad-warship.png`,
  transport: `${BASE}/unidad-transport.png`
}

// Colores de bando. Se aplican como tinte sobre el MISMO sprite, asi no hacen
// falta cinco juegos de arte distintos, y ademas como relleno del territorio.
//
// NO HAY AZUL NI TURQUESA a proposito, y no es capricho: el primer color de
// esta lista era 0x3498db (azul) y el septimo 0x1abc9c (turquesa), asi que el
// jugador 1 pintaba todo su territorio del color del mar. Eso era la mitad del
// problema de "no se distingue la tierra del agua", y no se arreglaba
// oscureciendo el oceano. Se reemplazaron por rosa y marron para no perder
// capacidad: siguen siendo ocho bandos distinguibles entre si.
export const COLORES_JUGADOR = [0xe74c3c, 0x2ecc71, 0xf1c40f, 0x9b59b6, 0xe67e22, 0xecf0f1, 0xe84393, 0x795548]

export const colorDeJugador = (jugadores, jugadorId) => {
  const i = jugadores.findIndex(j => j.id === jugadorId)
  return i === -1 ? 0xffffff : COLORES_JUGADOR[i % COLORES_JUGADOR.length]
}

export async function cargarSprites() {
  // Set y no array: el rio y el mar comparten el mismo archivo (se distinguen
  // por tinte), asi que sin deduplicar se le pediria a Assets la misma URL dos
  // veces.
  const urls = [...new Set([
    ...Object.values(SPRITE_TERRENO),
    SPRITE_CIUDAD,
    ...Object.values(SPRITE_UNIDAD)
  ])]
  await Assets.load(urls)
}
