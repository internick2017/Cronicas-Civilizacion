import { tileEn, jugadorPorId, puedePagar } from '../MapGame.js';
import { UNIDADES, CUARTEL, esNaval } from '../constantes.js';
import { ReglaError } from '../errores.js';
import { validarTurno, evento, marAdyacente } from './comun.js';
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

  const definicion = UNIDADES[unidad];
  if (!definicion) throw new ReglaError('UNIDAD_DESCONOCIDA', `Unidad desconocida: ${unidad}`);
  if (definicion.requiereBarracks && !tile.ciudad.edificios.includes('barracks')) {
    throw new ReglaError('REQUIERE_BARRACKS', 'Esa unidad requiere barracks en la ciudad');
  }

  // --- Donde nace la unidad ------------------------------------------------
  // La tropa de tierra nace EN la ciudad; el buque no puede, porque la ciudad
  // es tierra. Nace en una casilla de mar libre pegada al puerto.
  //
  // Se descarto dejar al buque parado sobre la casilla de la ciudad, que
  // parece mas comodo: romperia la regla de un ejercito por casilla, y un
  // buque amarrado ocuparia el lugar de la guarnicion que la defiende. Tener
  // armada te dejaria la ciudad desnuda sin que ninguna regla lo diga.
  let destino = tile;
  if (esNaval(unidad)) {
    if (definicion.requierePuerto && !tile.ciudad.edificios.includes('port')) {
      throw new ReglaError('REQUIERE_PUERTO', 'Esa unidad requiere un puerto en la ciudad');
    }
    // El primer mar libre, en el orden fijo de los vecinos ortogonales: la
    // eleccion tiene que ser determinista para que la partida se pueda
    // reproducir a partir de sus eventos.
    destino = marAdyacente(estado, x, y).find(t => !t.ejercito);
    if (!destino) throw new ReglaError('SIN_MAR_LIBRE', 'No hay una casilla de mar libre junto al puerto');
  } else if (tile.ejercito) {
    throw new ReglaError('CASILLA_OCUPADA', 'La casilla ya está ocupada');
  }

  const jugador = jugadorPorId(estado, jugadorId);
  if (!tieneTecnologiaRequerida(jugador, definicion.requiereTecnologia)) {
    throw new ReglaError('REQUIERE_TECNOLOGIA', `Esa unidad requiere la tecnología: ${definicion.requiereTecnologia}`);
  }

  // Un cuartel entrena mejor: lo reclutado ahi sale mas barato y con mas
  // movimiento. No es solo la llave para caballeria/catapulta.
  //
  // No se le aplica a los buques, aunque la ciudad tenga cuartel: un cuartel
  // entrena tropa, no marineros. El equivalente naval del cuartel es el
  // puerto, y lo que da es comercio y reparacion (ver PUERTO), no descuento.
  const tieneCuartel = tile.ciudad.edificios.includes('barracks') && !esNaval(unidad);
  const costo = tieneCuartel
    ? Object.fromEntries(Object.entries(definicion.costo).map(
      ([recurso, monto]) => [recurso, Math.round(monto * (1 - CUARTEL.descuentoReclutar))]))
    : definicion.costo;

  if (!puedePagar(jugador, costo)) {
    throw new ReglaError('RECURSOS_INSUFICIENTES', 'Recursos insuficientes');
  }

  return [
    evento('RecursosGastados', estado, jugadorId, { costo }),
    // Las coordenadas del evento son las del DESTINO, no las de la ciudad: para
    // la tropa de tierra son la misma casilla, y para un buque es el mar de al
    // lado. Asi aplicar.js no necesita saber nada de puertos ni de costas.
    evento('UnidadReclutada', estado, jugadorId, {
      x: destino.x, y: destino.y, tipo: unidad,
      bonoMovimiento: tieneCuartel ? CUARTEL.bonoMovimiento : 0,
    }),
  ];
}
