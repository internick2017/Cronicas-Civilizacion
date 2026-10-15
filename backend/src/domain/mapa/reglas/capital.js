import { jugadorPorId, tileEn, puedePagar } from '../MapGame.js';
import { ReglaError } from '../errores.js';
import { COSTO_MOVER_CAPITAL, RONDAS_SIN_PRODUCIR_MUDANZA } from '../constantes.js';
import { validarTurno, evento } from './comun.js';
import { escalarCosto, multiplicadorCostos } from './efectosProblemas.js';

// La capital elegida si sigue siendo suya; si no (partida vieja, nunca la movio,
// o se la capturaron), la ciudad propia de mayor nivel, la primera del mapa en un
// empate. Asi la capital "pasa sola" a la mas grande al perderla, sin evento.
export function capitalDe(estado, jugador) {
  if (!jugador) return null;
  const elegida = jugador.capital ? tileEn(estado, jugador.capital.x, jugador.capital.y) : null;
  if (elegida?.ciudad && elegida.dueno === jugador.id) return { x: elegida.x, y: elegida.y };
  let mayor = null;
  for (const t of estado.mapa) {
    if (t.ciudad && t.dueno === jugador.id && (!mayor || t.ciudad.nivel > mayor.ciudad.nivel)) mayor = t;
  }
  return mayor ? { x: mayor.x, y: mayor.y } : null;
}

export function esCapital(estado, jugador, x, y) {
  const capital = capitalDe(estado, jugador);
  return capital !== null && capital.x === x && capital.y === y;
}

// Ronda ABSOLUTA, igual que el cerco del saqueo (reglas/saqueo.js): mudarse dos
// veces seguidas renueva el plazo en vez de alargarlo.
export const mudanzaHasta = (turno) => turno + RONDAS_SIN_PRODUCIR_MUDANZA;
export const estaEnMudanza = (ciudad, turno) => (ciudad.mudanzaHasta ?? 0) > turno;

export function moverCapital(estado, jugadorId, { x, y }) {
  validarTurno(estado, jugadorId);
  const tile = tileEn(estado, x, y);
  if (!tile?.ciudad) throw new ReglaError('SIN_CIUDAD', 'No hay una ciudad ahí');
  if (tile.dueno !== jugadorId) throw new ReglaError('CIUDAD_AJENA', 'Solo podés mudar la capital a una ciudad tuya');
  const jugador = jugadorPorId(estado, jugadorId);
  if (esCapital(estado, jugador, x, y)) throw new ReglaError('YA_ES_CAPITAL', 'Esa ciudad ya es tu capital');
  const costo = escalarCosto(COSTO_MOVER_CAPITAL, multiplicadorCostos(jugador));
  if (!puedePagar(jugador, costo)) throw new ReglaError('RECURSOS_INSUFICIENTES', 'Recursos insuficientes');
  return [
    evento('RecursosGastados', estado, jugadorId, { costo }),
    evento('CapitalMovida', estado, jugadorId, { x, y, sinProducirHasta: mudanzaHasta(estado.turno) }),
  ];
}
