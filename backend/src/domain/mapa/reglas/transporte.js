import { tileEn } from '../MapGame.js';
import { CAPACIDAD_DE, esTransporte, esNaval } from '../constantes.js';
import { ReglaError } from '../errores.js';
import { validarTurno, evento, radioAlrededor } from './comun.js';
import { radioVision } from './cultura.js';

// Embarcar y desembarcar: las dos unicas acciones donde una unidad cambia de
// medio. Viven en su propio archivo y no dentro de movimiento.js porque no son
// movimiento: la tropa no ocupa la casilla del transporte, se mete ADENTRO de
// el (ver `carga` en aplicar.js), y eso es otra cosa.
//
// Se embarca y se desembarca desde CUALQUIER costa, no solo en puertos. El
// puerto sirve para construir barcos, no para usarlos: con la regla contraria
// solo se podria desembarcar donde el enemigo ya te dejo un puerto, o sea
// nunca donde importa, y el desembarco anfibio es el motivo entero de que
// existan los transportes.
//
// Las dos acciones consumen el movimiento de LA TROPA, no el del transporte,
// que gasta el suyo solo navegando. Asi una invasion tarda dos turnos y queda
// una ventana para interceptarla, que es para lo que existen los buques.

const adyacente = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;

export function embarcar(estado, jugadorId, { desde, hasta }) {
  validarTurno(estado, jugadorId);

  const tileTropa = tileEn(estado, desde.x, desde.y);
  const tileBarco = tileEn(estado, hasta.x, hasta.y);
  if (!tileTropa || !tileBarco) throw new ReglaError('POSICION_INVALIDA', 'Posición inválida');

  if (!tileTropa.ejercito || tileTropa.ejercito.dueno !== jugadorId) {
    throw new ReglaError('SIN_EJERCITO', 'No tenés un ejército propio en esa casilla');
  }
  // Una unidad naval no se sube a otra: un transporte no lleva transportes.
  if (esNaval(tileTropa.ejercito.tipo)) {
    throw new ReglaError('OBJETIVO_INVALIDO', 'Un barco no puede embarcarse en otro');
  }
  if (tileTropa.ejercito.movimientoRestante <= 0) {
    throw new ReglaError('UNIDAD_SIN_MOVIMIENTO', 'La unidad no tiene movimiento restante');
  }
  if (!adyacente(desde, hasta)) throw new ReglaError('DESTINO_NO_ADYACENTE', 'El destino no es adyacente');

  const barco = tileBarco.ejercito;
  if (!barco || barco.dueno !== jugadorId || !esTransporte(barco.tipo)) {
    throw new ReglaError('OBJETIVO_INVALIDO', 'No hay un transporte propio en esa casilla');
  }
  if ((barco.carga?.length ?? 0) >= CAPACIDAD_DE(barco.tipo)) {
    throw new ReglaError('TRANSPORTE_LLENO', 'El transporte no tiene lugar');
  }

  return [evento('TropaEmbarcada', estado, jugadorId, {
    desde: { x: desde.x, y: desde.y },
    hasta: { x: hasta.x, y: hasta.y },
  })];
}

export function desembarcar(estado, jugadorId, { desde, hasta }) {
  validarTurno(estado, jugadorId);

  const tileBarco = tileEn(estado, desde.x, desde.y);
  const tileTierra = tileEn(estado, hasta.x, hasta.y);
  if (!tileBarco || !tileTierra) throw new ReglaError('POSICION_INVALIDA', 'Posición inválida');

  const barco = tileBarco.ejercito;
  if (!barco || barco.dueno !== jugadorId || !esTransporte(barco.tipo)) {
    throw new ReglaError('SIN_EJERCITO', 'No tenés un transporte propio en esa casilla');
  }
  if (!barco.carga || barco.carga.length === 0) {
    throw new ReglaError('TRANSPORTE_VACIO', 'El transporte no lleva tropa');
  }
  if (!adyacente(desde, hasta)) throw new ReglaError('DESTINO_NO_ADYACENTE', 'El destino no es adyacente');

  // Baja la ULTIMA que subio. No es arbitrario: sin un criterio fijo, la misma
  // partida reproducida desde sus eventos podria bajar otra unidad.
  const tropa = barco.carga[barco.carga.length - 1];
  if (tropa.movimientoRestante <= 0) {
    throw new ReglaError('UNIDAD_SIN_MOVIMIENTO', 'La unidad no tiene movimiento restante');
  }

  // Desembarcar es un movimiento normal a tierra, con las MISMAS reglas que
  // caminar (ver reglas/movimiento.js): no se cae al mar, no se cae sobre algo
  // defendido, y no se pisa una casilla propia ya ocupada.
  if (tileTierra.terreno === 'water') {
    throw new ReglaError('TERRENO_INTRANSITABLE', 'La tropa no puede desembarcar en el mar');
  }
  const estaDefendida =
    (tileTierra.ejercito && tileTierra.ejercito.dueno !== jugadorId) ||
    (tileTierra.ciudad && tileTierra.dueno !== jugadorId);
  if (estaDefendida) throw new ReglaError('OBJETIVO_INVALIDO', 'La casilla es enemiga; no se puede desembarcar ahí');
  if (tileTierra.ejercito) throw new ReglaError('CASILLA_OCUPADA', 'Ya tenés un ejército en esa casilla');

  const eventos = [
    evento('TropaDesembarcada', estado, jugadorId, {
      desde: { x: desde.x, y: desde.y },
      hasta: { x: hasta.x, y: hasta.y },
    }),
    evento('TerritorioDescubierto', estado, jugadorId, {
      tiles: radioAlrededor(hasta.x, hasta.y, radioVision(estado.jugadores.find(j => j.id === jugadorId))),
    }),
  ];

  // Pisar es tomar, tambien cuando se llega por mar: es lo que convierte un
  // desembarco en una invasion y no en un paseo. Misma condicion que
  // moverEjercito, y el mar queda afuera solo, porque aca el destino es tierra.
  if (tileTierra.dueno !== jugadorId) {
    eventos.push(evento('TerritorioReclamado', estado, jugadorId, {
      x: hasta.x, y: hasta.y, duenoAnterior: tileTierra.dueno ?? null,
    }));
  }

  return eventos;
}
