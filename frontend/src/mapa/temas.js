import { ref } from 'vue'
import { TINTE_TERRENO } from './sprites.js'
import './temas.css'

// Apariencias del modo mapa. Cada jugador elige la suya y queda en su dispositivo:
// no cambia reglas ni lo que ven los demas. Los colores de interfaz viven en
// temas.css; aca va lo que PixiJS no puede leer de CSS (el mapa).
//
// Los tintes multiplican el sprite, igual que TINTE_TERRENO: mar, rio y montana
// tienen que seguir distinguiendose en todos los temas.
export const TEMAS = [
  {
    id: 'mando',
    nombre: 'Sala de mando',
    icono: '🛰️',
    descripcion: 'Azul petróleo y ámbar. Oscuro y técnico.',
    mapa: { fondo: 0x0a141c, niebla: [0x16242e, 0x22333f], costa: 0x0d2b45, ribera: 0x2e6b7a, tintes: TINTE_TERRENO },
  },
  {
    id: 'campana',
    nombre: 'Mesa de campaña',
    icono: '📜',
    descripcion: 'Pergamino, tinta y serif. Como un mapa antiguo.',
    mapa: {
      fondo: 0xd9c9a3,
      niebla: [0xb8a67f, 0xc9b892],
      costa: 0x3f5d63,
      ribera: 0x6f8f86,
      tintes: {
        water: 0x5f8f9c, river: 0xa8d0c0, mountains: 0xb09a80, hills: 0xc4a878,
        desert: 0xf0dcae, forest: 0x9aa878, plains: 0xf0e4b8,
      },
    },
  },
  {
    id: 'mesa',
    nombre: 'Juego de mesa',
    icono: '🎲',
    descripcion: 'Colores vivos y formas redondas. Para jugar en familia.',
    mapa: {
      // Gris lila y no azul: lo no descubierto, en celeste, se leia como agua.
      fondo: 0xc6c2cf,
      niebla: [0xc6c2cf, 0xb5b1c0],
      costa: 0x1b4f8a,
      ribera: 0x2e8fb0,
      tintes: {
        water: 0x3aa8f0, river: 0x7fe0e0, mountains: 0xc9a27a, hills: 0xe0b080,
        desert: 0xffe08a, forest: 0x70d070, plains: 0xffffff,
      },
    },
  },
]

const CLAVE = 'mapa.tema'
const TEMA_POR_DEFECTO = 'mando'

function leerGuardado() {
  try {
    const guardado = localStorage.getItem(CLAVE)
    return TEMAS.some(t => t.id === guardado) ? guardado : TEMA_POR_DEFECTO
  } catch {
    return TEMA_POR_DEFECTO
  }
}

export const tema = ref(leerGuardado())
document.documentElement.dataset.tema = tema.value

export function elegirTema(id) {
  if (!TEMAS.some(t => t.id === id)) return
  tema.value = id
  document.documentElement.dataset.tema = id
  try {
    localStorage.setItem(CLAVE, id)
  } catch {
    // Sin almacenamiento el tema dura hasta recargar: no vale la pena avisar.
  }
}

export const paletaDeMapa = () => TEMAS.find(t => t.id === tema.value).mapa
