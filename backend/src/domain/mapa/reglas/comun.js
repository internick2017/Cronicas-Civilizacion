import { ReglaError } from '../errores.js';

export function validarTurno(estado, jugadorId) {
  if (estado.estado !== 'jugando') throw new ReglaError('PARTIDA_NO_ACTIVA', 'La partida no está activa');
  const actual = estado.jugadores[estado.indiceJugadorActual];
  if (!actual || actual.id !== jugadorId) throw new ReglaError('NO_ES_TU_TURNO', 'No es tu turno');
}

export const evento = (tipo, estado, jugadorId, datos = {}) =>
  ({ tipo, turno: estado.turno, jugadorId, datos });

// radio = 1 descubre el cuadrado de 3x3 alrededor. El rasgo cultural del
// idioma lo agranda (ver reglas/cultura.js#radioVision).
export function radioAlrededor(x, y, radio = 1) {
  const tiles = [];
  for (let dx = -radio; dx <= radio; dx++) {
    for (let dy = -radio; dy <= radio; dy++) tiles.push({ x: x + dx, y: y + dy });
  }
  return tiles;
}

export const radio1 = (x, y) => radioAlrededor(x, y, 1);
