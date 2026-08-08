import { tileEn, jugadorPorId, puedePagar } from '../MapGame.js';
import { COSTO_CIUDAD, EDIFICIOS } from '../constantes.js';
import { ReglaError } from '../errores.js';
import { validarTurno, evento, radio1 } from './comun.js';

export function fundarCiudad(estado, jugadorId, { x, y, nombre }) {
  validarTurno(estado, jugadorId);

  const tile = tileEn(estado, x, y);
  if (!tile || tile.terreno === 'water') throw new ReglaError('POSICION_INVALIDA', 'Posición inválida');
  if (tile.ciudad || tile.dueno) throw new ReglaError('CASILLA_OCUPADA', 'La casilla ya está ocupada');

  const jugador = jugadorPorId(estado, jugadorId);
  if (!puedePagar(jugador, COSTO_CIUDAD)) {
    throw new ReglaError('RECURSOS_INSUFICIENTES', 'Recursos insuficientes');
  }

  return [
    evento('RecursosGastados', estado, jugadorId, { costo: COSTO_CIUDAD }),
    evento('CiudadFundada', estado, jugadorId, { x, y, nombre }),
    evento('TerritorioDescubierto', estado, jugadorId, { tiles: radio1(x, y) }),
  ];
}

export function construir(estado, jugadorId, { x, y, edificio }) {
  validarTurno(estado, jugadorId);

  const tile = tileEn(estado, x, y);
  if (!tile) throw new ReglaError('POSICION_INVALIDA', 'Posición inválida');
  if (!tile.ciudad || tile.dueno !== jugadorId) throw new ReglaError('CIUDAD_AJENA', 'La ciudad no te pertenece');

  const definicion = EDIFICIOS[edificio];
  if (!definicion) throw new ReglaError('EDIFICIO_DESCONOCIDO', `Edificio desconocido: ${edificio}`);
  if (tile.ciudad.edificios.includes(edificio)) {
    throw new ReglaError('EDIFICIO_DUPLICADO', 'Ese edificio ya fue construido');
  }

  const jugador = jugadorPorId(estado, jugadorId);
  if (!puedePagar(jugador, definicion.costo)) {
    throw new ReglaError('RECURSOS_INSUFICIENTES', 'Recursos insuficientes');
  }

  return [
    evento('RecursosGastados', estado, jugadorId, { costo: definicion.costo }),
    evento('EdificioConstruido', estado, jugadorId, { x, y, edificio }),
  ];
}
