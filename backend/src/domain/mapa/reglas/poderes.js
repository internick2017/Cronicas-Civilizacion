import { EFECTOS_PODERES } from '../constantes.js';
import { perfilDeJugador } from './composicionGobierno.js';

// Modulo HOJA, como bandos.js: lo leen combate, militar, alianzas y los problemas
// sociales, y si importara reglas de gobierno habria ciclos.
export const poderesDe = (jugador) => perfilDeJugador(jugador).poderes;
export const tienePoder = (jugador, poder) => poderesDe(jugador).includes(poder);
const concentrado = (jugador, poder) => perfilDeJugador(jugador).concentrados.includes(poder);
export const poderExiste = (jugador, poder) => tienePoder(jugador, poder) || concentrado(jugador, poder);

export const enEmergencia = (estado, jugador) => (jugador?.emergenciaHasta ?? -1) >= estado.turno;

// Quien manda sin controles no cae mientras dura la emergencia; regulada por ley, si.
export const blindadoPorEmergencia = (estado, jugador) =>
  enEmergencia(estado, jugador) && concentrado(jugador, 'emergencia');

// El grupo alzado se frena si hay un poder que canaliza su reclamo.
export function poderQueFrena(jugador, grupo) {
  if (grupo === 'pueblo') return tienePoder(jugador, 'tribunicio') ? 'tribunicio' : null;
  return tienePoder(jugador, 'revisor') ? 'revisor' : null;
}

// Fraccion que los poderes suman a la produccion de UN recurso: lo que rinde cada uno,
// y en el oro lo que cuesta mantenerlos y lo que dejan los tratados.
export function bonoProduccionPorPoderes(jugador, recurso, aliados = 0) {
  const poderes = poderesDe(jugador);
  const bono = poderes.reduce((suma, p) => suma + (EFECTOS_PODERES[p].produccion?.[recurso] ?? 0), 0);
  if (recurso !== 'gold') return bono;
  const tratados = poderes.includes('federativo') ? aliados * EFECTOS_PODERES.federativo.oroPorAliado : 0;
  return bono + tratados + poderes.length * EFECTOS_PODERES.ejecutivo.oroPorInstitucion;
}
