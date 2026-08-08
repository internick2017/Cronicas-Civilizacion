import { tileEn, jugadorPorId, puedePagar } from '../MapGame.js';
import { UNIDADES } from '../constantes.js';
import { ReglaError } from '../errores.js';
import { validarTurno, evento } from './comun.js';

export function reclutar(estado, jugadorId, { x, y, tipo }) {
  validarTurno(estado, jugadorId);

  const tile = tileEn(estado, x, y);
  if (!tile) throw new ReglaError('POSICION_INVALIDA', 'Posición inválida');
  if (!tile.ciudad || tile.dueno !== jugadorId) throw new ReglaError('CIUDAD_AJENA', 'La ciudad no te pertenece');
  if (tile.ejercito) throw new ReglaError('CASILLA_OCUPADA', 'La casilla ya está ocupada');

  const definicion = UNIDADES[tipo];
  if (!definicion) throw new ReglaError('UNIDAD_DESCONOCIDA', `Unidad desconocida: ${tipo}`);
  if (definicion.requiereBarracks && !tile.ciudad.edificios.includes('barracks')) {
    throw new ReglaError('REQUIERE_BARRACKS', 'Esa unidad requiere barracks en la ciudad');
  }

  const jugador = jugadorPorId(estado, jugadorId);
  if (!puedePagar(jugador, definicion.costo)) {
    throw new ReglaError('RECURSOS_INSUFICIENTES', 'Recursos insuficientes');
  }

  return [
    evento('RecursosGastados', estado, jugadorId, { costo: definicion.costo }),
    evento('UnidadReclutada', estado, jugadorId, { x, y, tipo }),
  ];
}
