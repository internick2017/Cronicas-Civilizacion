import { ReglaError } from '../errores.js';

export function validarTurno(estado, jugadorId) {
  if (estado.estado !== 'jugando') throw new ReglaError('PARTIDA_NO_ACTIVA', 'La partida no está activa');
  const actual = estado.jugadores[estado.indiceJugadorActual];
  if (!actual || actual.id !== jugadorId) throw new ReglaError('NO_ES_TU_TURNO', 'No es tu turno');
}

export const evento = (tipo, estado, jugadorId, datos = {}) =>
  ({ tipo, turno: estado.turno, jugadorId, datos });

export function radio1(x, y) {
  const tiles = [];
  for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) tiles.push({ x: x + dx, y: y + dy });
  return tiles;
}
