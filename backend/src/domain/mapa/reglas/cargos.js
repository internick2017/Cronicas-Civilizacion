import { ReglaError } from '../errores.js';

// Cada jugador asume al unirse uno o los dos cargos. El Jefe de Estado lleva las
// relaciones con otros paises (diplomacia y guerra); el Jefe de Gobierno, los
// asuntos internos. Lo que el jugador no asume lo hace la maquina por el: ver
// jugarCargosIA en ia.js y MapGameService#_accion.
export const CARGOS = ['estado', 'gobierno'];

export const ACCIONES_DE_CARGO = {
  estado: [
    'atacar', 'moverEjercito', 'embarcar', 'desembarcar', 'reclutar',
    'proponerAlianza', 'retirarAlianza', 'responderAlianza', 'romperAlianza', 'regalarRecursos',
  ],
  gobierno: [
    'fundarCiudad', 'construir', 'adoptarRasgo', 'investigar', 'mejorarCiudad', 'renombrarCiudad', 'moverCapital',
    'proponerGobierno', 'cambiarFormaEstado', 'darVentajas', 'fijarImpuestos', 'fijarMandato', 'nombrarGobierno',
    'crearSubdivision', 'quitarSubdivision', 'renombrarSubdivision', 'asignarCiudades', 'desasignarCiudades',
    'elegirCabecera', 'renombrarPais', 'nombrarMoneda', 'acunarMoneda',
  ],
};

// Una partida guardada antes de los cargos no los trae: se juega con los dos.
// Una lista vacia es otra cosa: el modo espectador (easter egg), donde la
// maquina lleva el pais entero y el jugador solo mira.
export const cargosDe = (jugador) => (Array.isArray(jugador?.cargos)
  ? jugador.cargos.filter(c => CARGOS.includes(c))
  : [...CARGOS]);

export function validarCargos(cargos) {
  if (cargos == null) return [...CARGOS];
  if (!Array.isArray(cargos) || !cargos.every(c => CARGOS.includes(c))) {
    throw new ReglaError('CARGOS_INVALIDOS', 'Elegí Jefe de Estado, Jefe de Gobierno o los dos');
  }
  return CARGOS.filter(c => cargos.includes(c));
}

export const cargosQueFaltan = (jugador) => CARGOS.filter(c => !cargosDe(jugador).includes(c));

// null si la accion es libre (terminar turno, abandonar...) o el jugador tiene el cargo.
export function cargoQueFalta(jugador, tipoDeAccion) {
  const cargo = CARGOS.find(c => ACCIONES_DE_CARGO[c].includes(tipoDeAccion));
  return cargo && !cargosDe(jugador).includes(cargo) ? cargo : null;
}
