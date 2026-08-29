import { tileEn, jugadorPorId, puedePagar } from '../MapGame.js';
import { COSTO_CIUDAD, EDIFICIOS, COSTO_MEJORA_CIUDAD } from '../constantes.js';
import { ReglaError } from '../errores.js';
import { validarTurno, evento, radio1, esCostera } from './comun.js';
import { tieneTecnologiaRequerida } from './tecnologia.js';

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

  // El puerto es el unico edificio con una condicion de GEOGRAFIA y no de
  // tecnologia ni de recursos: sin mar al lado no hay donde amarrar. Se
  // comprueba aca, con el resto de las precondiciones, y no en el costo,
  // porque no es algo que se pueda pagar.
  if (definicion.requiereCosta && !esCostera(estado, x, y)) {
    throw new ReglaError('REQUIERE_COSTA', 'Ese edificio requiere una ciudad con mar adyacente');
  }

  const jugador = jugadorPorId(estado, jugadorId);
  if (!tieneTecnologiaRequerida(jugador, definicion.requiereTecnologia)) {
    throw new ReglaError('REQUIERE_TECNOLOGIA', `Ese edificio requiere la tecnología: ${definicion.requiereTecnologia}`);
  }
  if (!puedePagar(jugador, definicion.costo)) {
    throw new ReglaError('RECURSOS_INSUFICIENTES', 'Recursos insuficientes');
  }

  return [
    evento('RecursosGastados', estado, jugadorId, { costo: definicion.costo }),
    evento('EdificioConstruido', estado, jugadorId, { x, y, edificio }),
  ];
}

// Subir el nivel de UNA ciudad puntual, a diferencia de una tecnologia (que
// es de toda la civilizacion): cada nivel cuesta mas que el anterior, y hoy
// solo mejora su defensa (defensaCiudad(nivel) ya escalaba con esto, pero
// nada permitia subir `nivel` mas alla de 1 hasta ahora).
export function mejorarCiudad(estado, jugadorId, { x, y }) {
  validarTurno(estado, jugadorId);

  const tile = tileEn(estado, x, y);
  if (!tile) throw new ReglaError('POSICION_INVALIDA', 'Posición inválida');
  if (!tile.ciudad || tile.dueno !== jugadorId) throw new ReglaError('CIUDAD_AJENA', 'La ciudad no te pertenece');

  const jugador = jugadorPorId(estado, jugadorId);
  const costo = COSTO_MEJORA_CIUDAD(tile.ciudad.nivel);
  if (!puedePagar(jugador, costo)) {
    throw new ReglaError('RECURSOS_INSUFICIENTES', 'Recursos insuficientes');
  }

  return [
    evento('RecursosGastados', estado, jugadorId, { costo }),
    evento('CiudadMejorada', estado, jugadorId, { x, y }),
  ];
}
