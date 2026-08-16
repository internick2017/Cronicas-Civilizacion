// Jugador controlado por la maquina, para partidas de un jugador humano.
//
// No es una IA con modelo de lenguaje: son reglas heuristicas simples, del
// mismo tipo que el narrador local (ver narradorLocal.js). No hace falta mas
// para que la partida sea jugable sola: la IA no tiene que jugar OPTIMO, solo
// tiene que jugar RAZONABLE y nunca trabar el turno.
//
// Diseño: en cada paso se elige UNA accion con el estado actual (los
// recursos y el mapa cambian entre pasos, igual que si un humano jugara
// click a click), se ejecuta reusando las MISMAS reglas de dominio que usa
// un jugador humano (nunca se inventa un camino paralelo que pueda violar
// una regla del juego), y se repite hasta que no hay mas nada razonable que
// hacer o se llega al tope de pasos. Al final siempre se termina el turno:
// la IA nunca puede dejar la partida esperando a que ella actue.
import { tileEn, jugadorPorId, puedePagar } from './MapGame.js';
import { EDIFICIOS, UNIDADES, COSTO_CIUDAD } from './constantes.js';
import { aplicar } from './aplicar.js';
import { fundarCiudad, construir } from './reglas/ciudades.js';
import { reclutar } from './reglas/militar.js';
import { moverEjercito } from './reglas/movimiento.js';
import { atacar } from './reglas/combate.js';
import { terminarTurno } from './reglas/turnos.js';
import { ReglaError } from './errores.js';

// Backstop duro: protege contra un bug futuro que deje a decidirAccion
// devolviendo algo valido para siempre (p.ej. una regla nueva que la IA
// nunca deja de poder pagar). Muy por encima de lo que un turno real usa.
const PASOS_MAXIMOS = 60;
// Si una decision falla por una ReglaError 5 veces seguidas, algo quedo mal
// modelado (p.ej. dos "candidatos" que se invalidan mutuamente) y seguir
// probando no va a arreglarlo: mejor cerrar el turno que quedar reintentando.
const FALLOS_SEGUIDOS_MAXIMOS = 5;

// Construir primero: es lo que más compone entre turnos (cada edificio
// rinde para siempre) y evita el error de balance que encontramos jugando:
// aserradero/cantera van primero porque sin ellos el ingreso de madera y
// piedra puede quedar en cero para siempre si la capital no cayó en el
// terreno correcto.
const ORDEN_EDIFICIOS = ['sawmill', 'quarry', 'granary', 'market', 'library', 'barracks'];

const VECINOS_ORTOGONALES = [[0, -1], [0, 1], [-1, 0], [1, 0]];

function ciudadesDe(estado, jugadorId) {
  return estado.mapa.filter((t) => t.ciudad && t.dueno === jugadorId);
}

function ejercitosDe(estado, jugadorId) {
  return estado.mapa.filter((t) => t.ejercito && t.ejercito.dueno === jugadorId);
}

function vecinosOrtogonales(estado, x, y) {
  return VECINOS_ORTOGONALES
    .map(([dx, dy]) => tileEn(estado, x + dx, y + dy))
    .filter(Boolean);
}

function elegir(rng, opciones) {
  return opciones[Math.floor(rng() * opciones.length)];
}

// --- Decisiones, una por dominio de juego ---------------------------------

function decidirConstruccion(estado, jugadorId) {
  const jugador = jugadorPorId(estado, jugadorId);
  for (const tile of ciudadesDe(estado, jugadorId)) {
    const faltantes = ORDEN_EDIFICIOS.filter((tipo) => !tile.ciudad.edificios.includes(tipo));
    for (const tipo of faltantes) {
      if (puedePagar(jugador, EDIFICIOS[tipo].costo)) {
        return { tipo: 'construir', x: tile.x, y: tile.y, edificio: tipo };
      }
    }
  }
  return null;
}

// Un ejercito por ciudad y uno de mas, como techo: sin tope la IA gastaria
// TODO en guerreros apenas los pudiera pagar y nunca construiria ni fundaria.
function decidirReclutamiento(estado, jugadorId) {
  const jugador = jugadorPorId(estado, jugadorId);
  const ciudades = ciudadesDe(estado, jugadorId);
  if (ejercitosDe(estado, jugadorId).length >= ciudades.length + 1) return null;
  if (!puedePagar(jugador, UNIDADES.warrior.costo)) return null;

  const libre = ciudades.find((tile) => !tile.ejercito);
  return libre ? { tipo: 'reclutar', x: libre.x, y: libre.y, unidad: 'warrior' } : null;
}

function decidirMilitar(estado, jugadorId, rng) {
  for (const origen of ejercitosDe(estado, jugadorId)) {
    if (origen.ejercito.movimientoRestante <= 0) continue;
    const vecinos = vecinosOrtogonales(estado, origen.x, origen.y);

    const objetivo = vecinos.find((t) =>
      (t.ejercito && t.ejercito.dueno !== jugadorId) || (t.ciudad && t.dueno !== jugadorId));
    if (objetivo) {
      return { tipo: 'atacar', desde: { x: origen.x, y: origen.y }, hasta: { x: objetivo.x, y: objetivo.y } };
    }

    const transitables = vecinos.filter((t) =>
      t.terreno !== 'water' &&
      !(t.dueno && t.dueno !== jugadorId) &&
      !(t.ejercito && t.ejercito.dueno === jugadorId));
    if (transitables.length === 0) continue;

    // Prioriza explorar (moverse hacia lo que todavia no descubrio) sobre
    // deambular por territorio ya conocido: una IA que solo pisa lo que ya
    // ve nunca encuentra al rival ni agranda su propio mapa.
    const sinExplorar = transitables.filter((t) => !t.descubiertoPor.includes(jugadorId));
    const destino = elegir(rng, sinExplorar.length ? sinExplorar : transitables);
    return { tipo: 'moverEjercito', desde: { x: origen.x, y: origen.y }, hasta: { x: destino.x, y: destino.y } };
  }
  return null;
}

function decidirFundacion(estado, jugadorId, rng) {
  const jugador = jugadorPorId(estado, jugadorId);
  if (!puedePagar(jugador, COSTO_CIUDAD)) return null;

  const candidatas = estado.mapa.filter((t) =>
    t.dueno === jugadorId && !t.ciudad && t.terreno !== 'water');
  if (candidatas.length === 0) return null;

  const elegida = elegir(rng, candidatas);
  const numero = ciudadesDe(estado, jugadorId).length + 1;
  return { tipo: 'fundarCiudad', x: elegida.x, y: elegida.y, nombre: `${jugador.civilizacion} ${numero}` };
}

function decidirAccion(estado, jugadorId, rng) {
  return decidirConstruccion(estado, jugadorId) ??
    decidirReclutamiento(estado, jugadorId) ??
    decidirMilitar(estado, jugadorId, rng) ??
    decidirFundacion(estado, jugadorId, rng) ??
    null;
}

const EJECUTORES = {
  construir: (estado, jugadorId, a) => construir(estado, jugadorId, a),
  reclutar: (estado, jugadorId, a) => reclutar(estado, jugadorId, a),
  moverEjercito: (estado, jugadorId, a) => moverEjercito(estado, jugadorId, a),
  atacar: (estado, jugadorId, a, rng) => atacar(estado, jugadorId, a, rng),
  fundarCiudad: (estado, jugadorId, a) => fundarCiudad(estado, jugadorId, a),
};

/**
 * Juega el turno completo de un jugador-bot: MUTA `estado` (aplica cada
 * evento a medida que decide, igual que MapGameService hace por cada accion
 * humana) y devuelve la lista plana de eventos generados, terminando siempre
 * con terminarTurno.
 */
export function jugarTurnoIA(estado, jugadorId, rng) {
  const eventos = [];
  let fallosSeguidos = 0;

  for (let paso = 0; paso < PASOS_MAXIMOS; paso++) {
    const decision = decidirAccion(estado, jugadorId, rng);
    if (!decision) break;

    try {
      const evs = EJECUTORES[decision.tipo](estado, jugadorId, decision, rng);
      aplicar(estado, evs);
      eventos.push(...evs);
      fallosSeguidos = 0;
    } catch (err) {
      // Una ReglaError significa que la decision ya no era valida (el estado
      // pudo cambiar entre elegirla y ejecutarla): se descarta ese paso, no
      // se rompe el turno. Cualquier OTRO error es un bug real y se propaga.
      if (!(err instanceof ReglaError)) throw err;
      fallosSeguidos++;
      if (fallosSeguidos >= FALLOS_SEGUIDOS_MAXIMOS) break;
    }
  }

  const cierre = terminarTurno(estado, jugadorId);
  aplicar(estado, cierre);
  eventos.push(...cierre);
  return eventos;
}
