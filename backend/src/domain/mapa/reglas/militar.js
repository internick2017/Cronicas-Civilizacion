import { tileEn, jugadorPorId, puedePagar } from '../MapGame.js';
import { UNIDADES } from '../constantes.js';
import { ReglaError } from '../errores.js';
import { validarTurno, evento } from './comun.js';
import { tieneTecnologiaRequerida } from './tecnologia.js';

// El objeto `accion` que llega desde MapGameService trae `tipo` como campo de
// ENRUTAMIENTO ('reclutar', 'construir', ...) y se pasa completo, sin
// modificar, a la regla elegida (ver REGLAS_POR_TIPO en MapGameService). Si
// esta regla tambien destructurara su parametro como `tipo`, pisaria el valor
// de enrutamiento: `tipo` siempre seria la string 'reclutar', nunca el tipo de
// unidad pedido, y UNIDADES['reclutar'] no existe -> UNIDAD_DESCONOCIDA
// SIEMPRE. Por eso el parametro de entrada se llama `unidad`, igual que
// `construir` ya usa `edificio` en vez de reusar `tipo`. El EVENTO emitido
// abajo si sigue usando el campo `tipo` (evento.datos.tipo): ese objeto es
// otro (los datos del evento, no la accion), no hay colision ahi, y
// aplicar.js/narradorLocal.js ya leen `datos.tipo` para UnidadReclutada.
export function reclutar(estado, jugadorId, { x, y, unidad }) {
  validarTurno(estado, jugadorId);

  const tile = tileEn(estado, x, y);
  if (!tile) throw new ReglaError('POSICION_INVALIDA', 'Posición inválida');
  if (!tile.ciudad || tile.dueno !== jugadorId) throw new ReglaError('CIUDAD_AJENA', 'La ciudad no te pertenece');
  if (tile.ejercito) throw new ReglaError('CASILLA_OCUPADA', 'La casilla ya está ocupada');

  const definicion = UNIDADES[unidad];
  if (!definicion) throw new ReglaError('UNIDAD_DESCONOCIDA', `Unidad desconocida: ${unidad}`);
  if (definicion.requiereBarracks && !tile.ciudad.edificios.includes('barracks')) {
    throw new ReglaError('REQUIERE_BARRACKS', 'Esa unidad requiere barracks en la ciudad');
  }

  const jugador = jugadorPorId(estado, jugadorId);
  if (!tieneTecnologiaRequerida(jugador, definicion.requiereTecnologia)) {
    throw new ReglaError('REQUIERE_TECNOLOGIA', `Esa unidad requiere la tecnología: ${definicion.requiereTecnologia}`);
  }
  if (!puedePagar(jugador, definicion.costo)) {
    throw new ReglaError('RECURSOS_INSUFICIENTES', 'Recursos insuficientes');
  }

  return [
    evento('RecursosGastados', estado, jugadorId, { costo: definicion.costo }),
    evento('UnidadReclutada', estado, jugadorId, { x, y, tipo: unidad }),
  ];
}
