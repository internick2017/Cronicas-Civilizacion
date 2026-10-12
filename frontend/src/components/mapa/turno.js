// De quien es el turno, leido de la vista. Vive en un solo lugar porque lo
// preguntan la sesion, el panel y la barra: en una partida secuencial manda
// `indiceJugadorActual`; en una simultanea juegan todos hasta que terminan.
export const esSimultaneo = (vista) => vista.config?.modoTurno === 'simultaneo'

export const yaTermino = (vista, jugadorId) => (vista.listos ?? []).includes(jugadorId)

export function puedeJugar(vista, jugadorId) {
  if (!esSimultaneo(vista)) return vista.jugadores[vista.indiceJugadorActual]?.id === jugadorId
  const yo = vista.jugadores.find(j => j.id === jugadorId)
  return Boolean(yo?.activo) && !yaTermino(vista, jugadorId)
}

// A quienes se esta esperando para cerrar la ronda (solo simultaneo).
export const faltanTerminar = (vista) =>
  vista.jugadores.filter(j => j.activo && !yaTermino(vista, j.id))
