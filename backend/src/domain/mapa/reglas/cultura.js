import { jugadorPorId, puedePagar } from '../MapGame.js';
import { RASGOS_CULTURALES } from '../constantes.js';
import { ReglaError } from '../errores.js';
import { validarTurno, evento } from './comun.js';

// Los rasgos son de la CIVILIZACION, no de una ciudad: se adoptan una vez y
// valen para todo lo que tengas y para todo lo que fundes despues.
export function adoptarRasgo(estado, jugadorId, { rasgo }) {
  validarTurno(estado, jugadorId);

  const definicion = RASGOS_CULTURALES[rasgo];
  if (!definicion) throw new ReglaError('RASGO_DESCONOCIDO', `Rasgo desconocido: ${rasgo}`);

  const jugador = jugadorPorId(estado, jugadorId);
  if (rasgosDe(jugador).includes(rasgo)) {
    throw new ReglaError('RASGO_YA_ADOPTADO', 'Ya adoptaste ese rasgo');
  }

  const costo = { culture: definicion.costo };
  if (!puedePagar(jugador, costo)) {
    throw new ReglaError('RECURSOS_INSUFICIENTES', 'Cultura insuficiente');
  }

  return [
    evento('RecursosGastados', estado, jugadorId, { costo }),
    evento('RasgoAdoptado', estado, jugadorId, { rasgo }),
  ];
}

// Las partidas guardadas ANTES de que existieran los rasgos no tienen el campo.
// Se lee siempre por aca para que una partida vieja no reviente al cargarse.
export function rasgosDe(jugador) {
  return jugador?.rasgos ?? [];
}

// Cuanto suma cada ciudad por los rasgos adoptados (se aplica POR ciudad, igual
// que el bono de terreno y los edificios).
export function produccionPorRasgos(jugador) {
  const total = {};
  for (const rasgo of rasgosDe(jugador)) {
    for (const [recurso, cantidad] of Object.entries(RASGOS_CULTURALES[rasgo]?.produccionCiudad ?? {})) {
      total[recurso] = (total[recurso] ?? 0) + cantidad;
    }
  }
  return total;
}

// Radio de descubrimiento: 1 casilla alrededor, mas lo que aporte el idioma.
export function radioVision(jugador) {
  return 1 + rasgosDe(jugador).reduce(
    (extra, rasgo) => extra + (RASGOS_CULTURALES[rasgo]?.visionExtra ?? 0), 0);
}

// Multiplicador extra de defensa de ciudad por rasgos (el arte). Devuelve 1
// cuando no hay ninguno, para poder multiplicar siempre sin condicionales.
export function bonoDefensaPorRasgos(jugador) {
  return 1 + rasgosDe(jugador).reduce(
    (extra, rasgo) => extra + (RASGOS_CULTURALES[rasgo]?.bonoDefensaCiudad ?? 0), 0);
}
