// De quien es lo que hay en una casilla ajena, para decirselo al jugador cuando
// la toca: en el mapa un rival se reconoce solo por el color.

import { aliadosDe, enTreguaCon } from './alianzas.js'

const RELACION = { aliado: 'tu aliado', tregua: 'en tregua con vos', rival: 'rival' }

function relacionCon(vista, jugadorId, otroId) {
  if (aliadosDe(vista, jugadorId).includes(otroId)) return 'aliado'
  if (enTreguaCon(vista).includes(otroId)) return 'tregua'
  return 'rival'
}

/**
 * Lo que hay de OTRO jugador en la casilla, o null si no hay nada ajeno (o la
 * casilla esta en la niebla). Manda la tropa sobre la ciudad y la ciudad sobre
 * la tierra: es lo que el jugador tiene delante.
 */
export function deQuienEs(vista, jugadorId, tile, constantes) {
  if (!tile?.descubierto) return null
  const tropaAjena = tile.ejercito && tile.ejercito.dueno !== jugadorId
  const tierraAjena = tile.dueno && tile.dueno !== jugadorId
  if (!tropaAjena && !tierraAjena) return null

  const duenoId = tropaAjena ? tile.ejercito.dueno : tile.dueno
  const dueno = vista.jugadores.find(j => j.id === duenoId)
  if (!dueno) return null

  let que = 'Tierra'
  if (tropaAjena) {
    que = constantes?.unidades?.find(u => u.tipo === tile.ejercito.tipo)?.nombre ?? 'Tropa'
  } else if (tile.ciudad) {
    que = `La ciudad ${tile.ciudad.nombre ?? ''}`.trim()
  }
  const relacion = relacionCon(vista, jugadorId, duenoId)
  return {
    duenoId,
    relacion,
    texto: `${que} de ${dueno.nombre} (${dueno.civilizacion}), ${RELACION[relacion]}`,
  }
}
