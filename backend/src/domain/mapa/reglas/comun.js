import { ReglaError } from '../errores.js';
import { tileEn } from '../MapGame.js';

// Turno simultaneo: todos juegan la misma ronda a la vez y la ronda cierra
// cuando todos terminaron. `estado.listos` guarda quienes ya terminaron ESTA
// ronda; una partida secuencial (o guardada antes de que existiera) no lo trae.
export const esSimultaneo = (estado) => estado.config.modoTurno === 'simultaneo';
export const listosDe = (estado) => estado.listos ?? [];

export function validarTurno(estado, jugadorId) {
  if (estado.estado !== 'jugando') throw new ReglaError('PARTIDA_NO_ACTIVA', 'La partida no está activa');
  if (esSimultaneo(estado)) {
    const jugador = estado.jugadores.find(j => j.id === jugadorId);
    if (!jugador?.activo) throw new ReglaError('JUGADOR_INACTIVO', 'Ya no estás en la partida');
    if (listosDe(estado).includes(jugadorId)) {
      throw new ReglaError('YA_TERMINASTE', 'Ya terminaste tu turno: esperá a que terminen los demás');
    }
    return;
  }
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

// --- Costa ---------------------------------------------------------------
// Vive en comun.js y no en una regla puntual porque lo necesitan cuatro
// lugares distintos: construir el puerto, reclutar un buque, curarlo al cerrar
// la ronda, y la IA para decidir si le sirve una ciudad.

export const VECINOS_ORTOGONALES = [[0, -1], [0, 1], [-1, 0], [1, 0]];

export const vecinosOrtogonales = (estado, x, y) =>
  VECINOS_ORTOGONALES.map(([dx, dy]) => tileEn(estado, x + dx, y + dy)).filter(Boolean);

// Casillas de MAR pegadas a (x, y). El rio NO cuenta, y esa es toda la razon
// por la que mar y rio son terrenos separados: un rio se vadea pero no se
// navega, asi que una ciudad plantada sobre un rio no puede tener puerto.
export const marAdyacente = (estado, x, y) =>
  vecinosOrtogonales(estado, x, y).filter(t => t.terreno === 'water');

// Una ciudad es costera si toca el mar. Se pregunta por la CASILLA y no por la
// ciudad porque la respuesta es del terreno, no de lo que se construyo encima.
export const esCostera = (estado, x, y) => marAdyacente(estado, x, y).length > 0;
