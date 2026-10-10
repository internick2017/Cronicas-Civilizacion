import { SAQUEO } from '../constantes.js';

// Proporcional con piso y techo, y acotado a lo que la victima realmente tiene:
// si no tiene oro el saqueo no da nada, pero el combate ocurrio igual.
export function botinDe(oroVictima) {
  const proporcional = Math.round(oroVictima * SAQUEO.fraccion);
  return Math.min(oroVictima, Math.min(SAQUEO.maximo, Math.max(SAQUEO.minimo, proporcional)));
}

// Ronda desde la cual la ciudad vuelve a producir. Es un numero ABSOLUTO y no
// un contador que baja, para que saquear dos veces renueve el cerco en vez de
// alargarlo (ver aplicar.js, que se queda con el mayor).
export const saqueadaHasta = (turno) => turno + SAQUEO.rondasSinProduccion;

// `?? 0` cubre las partidas guardadas antes de que existiera el campo.
export const estaSaqueada = (ciudad, turno) => (ciudad.saqueadaHasta ?? 0) > turno;
