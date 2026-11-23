import { ReglaError } from '../errores.js';
import { jugadorPorId } from '../MapGame.js';
import { evento, validarTurno } from './comun.js';
import { mecanicaActiva } from './modo.js';
import { entero } from '../rng.js';

// Eventos de ronda (mecanica elegible `eventos`, apagada por defecto): de vez en
// cuando le pasa algo a UN jugador y debe decidir. Cada opcion es un `cambio` de
// recursos (negativo = pierde o paga, positivo = gana). Si no contesta antes de
// que cierre la proxima ronda, se aplica `aceptar`: no decidir tambien es decidir.
export const PROBABILIDAD_EVENTO = 0.3;

export const EVENTOS_RONDA = {
  peste: {
    pagar: { gold: -40 }, aceptar: { food: -30, gold: -20 },
  },
  sequia: {
    pagar: { gold: -30 }, aceptar: { food: -60 },
  },
  hambruna: {
    pagar: { gold: -50 }, aceptar: { food: -80 },
  },
  terremoto: {
    pagar: { gold: -50 }, aceptar: { wood: -40, stone: -40 },
  },
  hallazgo_ruinas: {
    pagar: { gold: -40, wood: 60, stone: 60 }, aceptar: {},
  },
};
const TIPOS = Object.keys(EVENTOS_RONDA);

// Lo que de verdad se mueve: nunca se pierde mas de lo que hay (los recursos no quedan bajo cero).
function cambioReal(jugador, cambio) {
  return Object.fromEntries(Object.entries(cambio)
    .map(([r, c]) => [r, c < 0 ? -Math.min(-c, jugador.recursos[r] ?? 0) : c])
    .filter(([, c]) => c !== 0));
}

const resuelto = (estado, quien, jugador, tipo, opcion) =>
  evento('EventoResuelto', estado, quien, {
    jugadorId: jugador.id, evento: tipo, opcion, cambio: cambioReal(jugador, EVENTOS_RONDA[tipo][opcion]),
  });

// Al cerrar la ronda: lo que quedo sin contestar se acepta, y quizas llega un evento nuevo.
export function cerrarRondaEventos(estado, quien, rng) {
  if (!mecanicaActiva(estado, 'eventos')) return [];
  const activos = estado.jugadores.filter(j => j.activo);
  const eventos = [];
  for (const j of activos) {
    if (j.eventoPendiente) eventos.push(resuelto(estado, quien, j, j.eventoPendiente.tipo, 'aceptar'));
  }
  if (activos.length > 0 && rng() < PROBABILIDAD_EVENTO) {
    const j = activos[entero(rng, activos.length)];
    eventos.push(evento('EventoDeRonda', estado, quien, { jugadorId: j.id, evento: TIPOS[entero(rng, TIPOS.length)] }));
  }
  return eventos;
}

export function responderEvento(estado, jugadorId, { opcion }) {
  validarTurno(estado, jugadorId);
  const jugador = jugadorPorId(estado, jugadorId);
  const pendiente = jugador.eventoPendiente;
  if (!pendiente) throw new ReglaError('SIN_EVENTO', 'No hay ningún evento esperando tu respuesta');
  if (opcion !== 'pagar' && opcion !== 'aceptar') throw new ReglaError('OPCION_INVALIDA', 'La opción debe ser pagar o aceptar');
  // Aceptar nunca se bloquea: lo que no alcanza se pierde hasta quedar en cero.
  for (const [r, c] of Object.entries(opcion === 'pagar' ? EVENTOS_RONDA[pendiente.tipo].pagar : {})) {
    if (c < 0 && (jugador.recursos[r] ?? 0) < -c) throw new ReglaError('RECURSOS_INSUFICIENTES', 'Recursos insuficientes');
  }
  return [resuelto(estado, jugadorId, jugador, pendiente.tipo, opcion)];
}
