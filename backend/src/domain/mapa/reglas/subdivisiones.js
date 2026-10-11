import { jugadorPorId, tileEn } from '../MapGame.js';
import { ReglaError } from '../errores.js';
import { evento } from './comun.js';
import { aplicar } from '../aplicar.js';
import { construir, mejorarCiudad, LARGO_MAXIMO_NOMBRE_CIUDAD } from './ciudades.js';
import { formaEstadoDe, estaEnPoder } from './gobierno.js';
import { NIVEL_MAXIMO_ADMINISTRADO } from '../constantes.js';

// Que edificios prefiere construir una subdivision, en orden, segun la
// prioridad que le puso el jugador. Cuando no queda ninguno por construir (o
// no alcanza para pagarlo), mejora el nivel de la ciudad.
export const PRIORIDADES = {
  defensa: ['barracks'],
  comida: ['granary'],
  ciencia: ['library'],
  economia: ['market', 'sawmill', 'quarry'],
};

// Lectura con default: una partida vieja no trae el campo.
export const subdivisionesDe = (jugador) => jugador?.subdivisiones ?? [];

function jugadorFederal(estado, jugadorId) {
  if (estado.estado !== 'jugando') throw new ReglaError('PARTIDA_NO_ACTIVA', 'La partida no está activa');
  const jugador = jugadorPorId(estado, jugadorId);
  if (!jugador) throw new ReglaError('JUGADOR_DESCONOCIDO', `Jugador desconocido: ${jugadorId}`);
  if (!estaEnPoder(jugador)) throw new ReglaError('SIN_PODER', 'No tenés el poder para organizar el Estado');
  if (formaEstadoDe(jugador) !== 'federal') throw new ReglaError('NO_ES_FEDERAL', 'Solo un Estado federal tiene subdivisiones');
  return jugador;
}

export function crearSubdivision(estado, jugadorId, { nombre, prioridad, ciudades }) {
  const jugador = jugadorFederal(estado, jugadorId);
  const limpio = typeof nombre === 'string' ? nombre.trim() : '';
  if (!limpio || limpio.length > LARGO_MAXIMO_NOMBRE_CIUDAD) throw new ReglaError('NOMBRE_INVALIDO', 'Nombre inválido');
  if (!Object.hasOwn(PRIORIDADES, prioridad)) throw new ReglaError('PRIORIDAD_INVALIDA', 'Prioridad inválida');
  if (!Array.isArray(ciudades) || ciudades.length === 0) throw new ReglaError('SIN_CIUDADES', 'Elegí al menos una ciudad');

  const yaAsignadas = new Set(subdivisionesDe(jugador).flatMap(s => s.ciudades.map(c => `${c.x},${c.y}`)));
  const elegidas = [];
  for (const ciudad of ciudades) {
    if (!Number.isInteger(ciudad?.x) || !Number.isInteger(ciudad?.y)) {
      throw new ReglaError('CIUDAD_INVALIDA', 'Ciudad inválida');
    }
    const { x, y } = ciudad;
    const tile = estado.mapa.find(t => t.x === x && t.y === y);
    if (!tile?.ciudad || tile.dueno !== jugadorId) throw new ReglaError('CIUDAD_AJENA', 'Solo podés asignar tus propias ciudades');
    const clave = `${x},${y}`;
    if (yaAsignadas.has(clave)) throw new ReglaError('CIUDAD_YA_ASIGNADA', 'Esa ciudad ya está en otra subdivisión');
    yaAsignadas.add(clave);
    elegidas.push({ x, y });
  }

  // Id determinista (no aleatorio): el log de eventos tiene que reproducir la partida.
  const id = `sub${subdivisionesDe(jugador).reduce((m, s) => Math.max(m, Number(s.id.slice(3))), 0) + 1}`;
  return [evento('SubdivisionCreada', estado, jugadorId, { id, nombre: limpio, prioridad, ciudades: elegidas })];
}

export function quitarSubdivision(estado, jugadorId, { id }) {
  const jugador = jugadorFederal(estado, jugadorId);
  if (!subdivisionesDe(jugador).some(s => s.id === id)) {
    throw new ReglaError('SUBDIVISION_DESCONOCIDA', 'Esa subdivisión no existe');
  }
  return [evento('SubdivisionQuitada', estado, jugadorId, { id })];
}

// Prioridad de las ciudades que el jugador no puso en ninguna subdivision: en
// un Estado federal TODAS las ciudades se administran solas; las subdivisiones
// solo sirven para elegir otra prioridad. Sin esto, pasar a federal sin crear
// subdivisiones no hacia nada (visto en una partida real).
export const PRIORIDAD_POR_DEFECTO = 'economia';

// Una accion por ciudad por turno: primero lo que pide la prioridad, despues
// mejorar la ciudad. Se prueba sobre una COPIA donde cada evento se aplica
// antes de elegir la siguiente accion (el oro gastado en una ciudad tiene que
// verse en la siguiente); devuelve los eventos para que quien llama los aplique
// al estado real. Una ReglaError solo significa "esta ciudad no puede ahora".
export function administrarSubdivisiones(estado, jugadorId) {
  const jugador = jugadorPorId(estado, jugadorId);
  if (!jugador || formaEstadoDe(jugador) !== 'federal') return [];

  const grupos = subdivisionesDe(jugador).map(s => ({ prioridad: s.prioridad, ciudades: s.ciudades }));
  const asignadas = new Set(grupos.flatMap(g => g.ciudades.map(c => `${c.x},${c.y}`)));
  const sueltas = estado.mapa
    .filter(t => t.ciudad && t.dueno === jugadorId && !asignadas.has(`${t.x},${t.y}`))
    .map(t => ({ x: t.x, y: t.y }));
  if (sueltas.length > 0) grupos.push({ prioridad: PRIORIDAD_POR_DEFECTO, ciudades: sueltas });
  if (grupos.length === 0) return [];

  const copia = structuredClone(estado);
  const eventos = [];
  for (const { prioridad, ciudades } of grupos) {
    for (const { x, y } of ciudades) {
      const intentos = [
        ...(Object.hasOwn(PRIORIDADES, prioridad) ? PRIORIDADES[prioridad] : []).map(edificio => () => construir(copia, jugadorId, { x, y, edificio })),
        // Mejora sola solo hasta NIVEL_MAXIMO_ADMINISTRADO (ver constantes.js).
        ...(tileEn(copia, x, y)?.ciudad?.nivel < NIVEL_MAXIMO_ADMINISTRADO
          ? [() => mejorarCiudad(copia, jugadorId, { x, y })] : []),
      ];
      for (const intento of intentos) {
        try {
          const evs = intento();
          aplicar(copia, evs);
          eventos.push(...evs);
          break;
        } catch (err) {
          if (!(err instanceof ReglaError)) throw err;
        }
      }
    }
  }
  return eventos;
}
