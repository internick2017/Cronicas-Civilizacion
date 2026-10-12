import { RAZAS } from '../constantes.js';
import { ReglaError } from '../errores.js';

// La raza se elige al unirse y no cambia. Las partidas guardadas ANTES de que
// existieran las razas no tienen el campo: se lee siempre por aca para que una
// partida vieja no reviente y, sobre todo, siga jugando SIN bonos ni penalizaciones.
//
// Object.hasOwn y no `id in RAZAS`: 'toString' o 'constructor' pasarian el `in`.
export function definicionDeRaza(jugador) {
  const id = jugador?.raza;
  return id && Object.hasOwn(RAZAS, id) ? RAZAS[id] : null;
}

// Devuelve el id normalizado: null si no se eligio ninguna (comportamiento
// historico) y error si se eligio una que no existe.
export function validarRaza(raza) {
  if (raza === undefined || raza === null || raza === '') return null;
  if (typeof raza !== 'string' || !Object.hasOwn(RAZAS, raza)) {
    throw new ReglaError('RAZA_DESCONOCIDA', `Raza desconocida: ${raza}`);
  }
  return raza;
}

// Cuanto suma la raza a la produccion de UN recurso, como fraccion (puede ser
// negativa). Lo consume multiplicadorProduccion (gobierno.js), que lo aplica al
// final sobre el total y arrastra el decimal al turno siguiente.
export function produccionPorcentualDeRaza(jugador, recurso) {
  return definicionDeRaza(jugador)?.produccionPorcentual?.[recurso] ?? 0;
}

// Bono PLANO de ataque a todas las unidades (se suma al de metalurgia).
export function bonoAtaquePorRaza(jugador) {
  return definicionDeRaza(jugador)?.bonoAtaqueUnidades ?? 0;
}

// Bono PLANO de defensa a las unidades, no a las ciudades (se suma al de fortificacion).
export function bonoDefensaUnidadPorRaza(jugador) {
  return definicionDeRaza(jugador)?.bonoDefensaUnidades ?? 0;
}

// Casillas extra de vision (se suma al idioma propio).
export function visionExtraPorRaza(jugador) {
  return definicionDeRaza(jugador)?.visionExtra ?? 0;
}

// Multiplicador de defensa de ciudad: 1 si no hay bono, para poder multiplicar
// siempre sin condicionales (igual que bonoDefensaPorRasgos, con el que se multiplica).
export function multiplicadorDefensaCiudadPorRaza(jugador) {
  return 1 + (definicionDeRaza(jugador)?.bonoDefensaCiudad ?? 0);
}
