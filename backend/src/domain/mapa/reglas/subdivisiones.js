import { jugadorPorId, tileEn } from '../MapGame.js';
import { ReglaError } from '../errores.js';
import { evento } from './comun.js';
import { aplicar } from '../aplicar.js';
import { construir, mejorarCiudad, LARGO_MAXIMO_NOMBRE_CIUDAD } from './ciudades.js';
import { formaEstadoDe, estaEnPoder } from './gobierno.js';
import {
  NIVEL_MAXIMO_ADMINISTRADO, TIPOS_SUBDIVISION, TIPO_SUBDIVISION_LEGADO, CAPACIDAD_CIUDADES_POR_NIVEL,
} from '../constantes.js';

// Que edificios prefiere construir una subdivision, en orden, segun la
// prioridad que le puso el jugador. Cuando no queda ninguno por construir (o
// no alcanza para pagarlo), mejora el nivel de la ciudad.
export const PRIORIDADES = {
  defensa: ['barracks'],
  comida: ['granary'],
  ciencia: ['library'],
  economia: ['market', 'sawmill', 'quarry'],
};

// --- Lectura del arbol -------------------------------------------------------
// Toda lectura pasa por aca: una subdivision guardada antes de la jerarquia no
// trae `tipo`, `padreId` ni `prioridad`, y se lee como un Municipio sin padre.
// Tampoco trae `cabecera`: se lee sin cabecera.
// Los accesores devuelven COPIAS: mutar el resultado nunca toca el estado.
const normalizar = (s) => ({
  id: s.id,
  nombre: s.nombre,
  tipo: Object.hasOwn(TIPOS_SUBDIVISION, s.tipo) ? s.tipo : TIPO_SUBDIVISION_LEGADO,
  padreId: s.padreId ?? null,
  prioridad: s.prioridad ?? null,
  ciudades: (s.ciudades ?? []).map(({ x, y }) => ({ x, y })),
  cabecera: s.cabecera ? { x: s.cabecera.x, y: s.cabecera.y } : null,
});

export const subdivisionesDe = (jugador) => (jugador?.subdivisiones ?? []).map(normalizar);
export const subdivisionPorId = (jugador, id) => subdivisionesDe(jugador).find(s => s.id === id) ?? null;
export const tipoDe = (sub) => normalizar(sub).tipo;
export const nivelDe = (sub) => TIPOS_SUBDIVISION[tipoDe(sub)].nivel;
export const padreIdDe = (sub) => sub.padreId ?? null;

// Del padre hacia arriba (la mas cercana primero). El Pais no aparece: es virtual.
export function ancestros(jugador, sub) {
  const todas = subdivisionesDe(jugador);
  const cadena = [];
  let actual = sub;
  while (actual && padreIdDe(actual) !== null && cadena.length < todas.length) {
    actual = todas.find(s => s.id === padreIdDe(actual)) ?? null;
    if (actual) cadena.push(actual);
  }
  return cadena;
}

const clave = (c) => `${c.x},${c.y}`;

// Las ciudades directas de la subdivision mas las de todas sus descendientes.
export function territorioDe(jugador, sub) {
  const todas = subdivisionesDe(jugador);
  const vistas = new Set();
  const resultado = [];
  const recorrer = (s) => {
    if (vistas.has(s.id)) return; // cinta de seguridad contra un ciclo imposible
    vistas.add(s.id);
    for (const c of s.ciudades) if (!resultado.some(r => clave(r) === clave(c))) resultado.push(c);
    for (const hija of todas.filter(h => padreIdDe(h) === s.id)) recorrer(hija);
  };
  recorrer(normalizar(sub));
  return resultado;
}

// La subdivision DIRECTA de una ciudad (la mas chica de su rama), o null si va
// suelta, o sea bajo el Pais.
export const subdivisionDeCiudad = (jugador, x, y) =>
  subdivisionesDe(jugador).find(s => s.ciudades.some(c => c.x === x && c.y === y)) ?? null;

// Propia, o la del padre, o la de mas arriba, o economia. Sin subdivision (null)
// es el Pais: tambien economia.
export function prioridadEfectiva(jugador, sub) {
  if (!sub) return PRIORIDAD_POR_DEFECTO;
  for (const s of [normalizar(sub), ...ancestros(jugador, sub)]) {
    if (s.prioridad) return s.prioridad;
  }
  return PRIORIDAD_POR_DEFECTO;
}

// Quien resuelve un problema que afecta a estas ciudades: la subdivision de
// MENOR nivel (numero de nivel mas alto) cuyo territorio las contiene a todas.
// null = el Pais (no hay ninguna que las cubra, o no se pidio ninguna ciudad).
export function subdivisionResolutora(jugador, ciudades) {
  if (!ciudades || ciudades.length === 0) return null;
  const candidatas = subdivisionesDe(jugador)
    .map(s => ({ s, territorio: territorioDe(jugador, s) }))
    .filter(({ territorio }) => ciudades.every(c => territorio.some(t => clave(t) === clave(c))));
  if (candidatas.length === 0) return null;
  // Desempate determinista: mayor numero de nivel, luego territorio mas chico, luego id.
  candidatas.sort((a, b) =>
    nivelDe(b.s) - nivelDe(a.s) || a.territorio.length - b.territorio.length || a.s.id.localeCompare(b.s.id));
  return candidatas[0].s;
}

// La cabecera guardada solo vale si sigue siendo una ciudad del jugador dentro del
// territorio de la subdivision: una ciudad capturada o reasignada a otra rama la
// pierde sola, sin evento.
export function cabeceraDe(estado, jugador, sub) {
  const { cabecera } = normalizar(sub);
  if (!cabecera || !territorioDe(jugador, sub).some(c => clave(c) === clave(cabecera))) return null;
  const tile = tileEn(estado, cabecera.x, cabecera.y);
  return tile?.ciudad && tile.dueno === jugador.id ? cabecera : null;
}

// Claves "x,y" de las ciudades que rinden el bono de cabecera: las cubiertas por al
// menos una subdivision (propia o ancestro) con cabecera valida que no sean esa
// misma cabecera. Es un conjunto, asi que no se acumula entre niveles.
export function ciudadesConBonoCabecera(estado, jugador) {
  const conBono = new Set();
  if (formaEstadoDe(jugador) !== 'federal') return conBono;
  for (const sub of subdivisionesDe(jugador)) {
    const cabecera = cabeceraDe(estado, jugador, sub);
    if (!cabecera) continue;
    for (const c of territorioDe(jugador, sub)) if (clave(c) !== clave(cabecera)) conBono.add(clave(c));
  }
  return conBono;
}

function jugadorFederal(estado, jugadorId) {
  if (estado.estado !== 'jugando') throw new ReglaError('PARTIDA_NO_ACTIVA', 'La partida no está activa');
  const jugador = jugadorPorId(estado, jugadorId);
  if (!jugador) throw new ReglaError('JUGADOR_DESCONOCIDO', `Jugador desconocido: ${jugadorId}`);
  if (!estaEnPoder(jugador)) throw new ReglaError('SIN_PODER', 'No tenés el poder para organizar el Estado');
  if (formaEstadoDe(jugador) !== 'federal') throw new ReglaError('NO_ES_FEDERAL', 'Solo un Estado federal tiene subdivisiones');
  return jugador;
}

const nombreLimpio = (nombre) => {
  const limpio = typeof nombre === 'string' ? nombre.trim() : '';
  if (!limpio || limpio.length > LARGO_MAXIMO_NOMBRE_CIUDAD) throw new ReglaError('NOMBRE_INVALIDO', 'Nombre inválido');
  return limpio;
};

function ciudadesPropias(estado, jugadorId, ciudades) {
  if (!Array.isArray(ciudades)) throw new ReglaError('CIUDAD_INVALIDA', 'Ciudades inválidas');
  const elegidas = [];
  for (const ciudad of ciudades) {
    if (!Number.isInteger(ciudad?.x) || !Number.isInteger(ciudad?.y)) {
      throw new ReglaError('CIUDAD_INVALIDA', 'Ciudad inválida');
    }
    const tile = estado.mapa.find(t => t.x === ciudad.x && t.y === ciudad.y);
    if (!tile?.ciudad || tile.dueno !== jugadorId) throw new ReglaError('CIUDAD_AJENA', 'Solo podés asignar tus propias ciudades');
    if (!elegidas.some(c => c.x === ciudad.x && c.y === ciudad.y)) elegidas.push({ x: ciudad.x, y: ciudad.y });
  }
  return elegidas;
}

// Una subdivision (y todas las que la contienen) no puede pasar de la capacidad de su nivel
// despues de recibir estas ciudades. Las que YA estaban en su territorio no suman.
function validarCapacidad(jugador, nivel, territorioActual, ancestrosDeLaSubdivision, ciudadesNuevas) {
  const excede = (tope, actual) => {
    if (tope === undefined) return false;
    const union = [...actual];
    for (const c of ciudadesNuevas) if (!union.some(u => u.x === c.x && u.y === c.y)) union.push(c);
    return union.length > tope;
  };
  if (excede(CAPACIDAD_CIUDADES_POR_NIVEL[nivel], territorioActual)) {
    throw new ReglaError('CAPACIDAD_EXCEDIDA', `Una subdivisión de ese nivel admite hasta ${CAPACIDAD_CIUDADES_POR_NIVEL[nivel]} ciudades`);
  }
  for (const a of ancestrosDeLaSubdivision) {
    if (excede(CAPACIDAD_CIUDADES_POR_NIVEL[nivelDe(a)], territorioDe(jugador, a))) {
      throw new ReglaError('CAPACIDAD_EXCEDIDA', `${a.nombre} no admite más de ${CAPACIDAD_CIUDADES_POR_NIVEL[nivelDe(a)]} ciudades`);
    }
  }
}

// Una subdivision solo cuelga de otra de nivel ESTRICTAMENTE mayor (numero de
// nivel menor): un Municipio no puede estar dentro de otro Municipio. Se pueden
// saltear niveles. Las ciudades que ya estaban en otra subdivision SE MUEVEN a la
// nueva (cada ciudad pertenece a una sola, ver aplicar.js).
export function crearSubdivision(estado, jugadorId, { nombre, tipoSubdivision = TIPO_SUBDIVISION_LEGADO, padreId = null, prioridad = null, ciudades = [] }) {
  // OJO: el campo de entrada NO puede llamarse `tipo`: en una accion `tipo` ya es el
  // nombre de la accion ('crearSubdivision'), y el servicio pasa la accion entera.
  const jugador = jugadorFederal(estado, jugadorId);
  const limpio = nombreLimpio(nombre);
  if (!Object.hasOwn(TIPOS_SUBDIVISION, tipoSubdivision)) throw new ReglaError('TIPO_INVALIDO', 'Tipo de subdivisión inválido');
  if (padreId !== null) {
    const padre = subdivisionPorId(jugador, padreId);
    if (!padre) throw new ReglaError('SUBDIVISION_DESCONOCIDA', 'La subdivisión padre no existe');
    if (nivelDe(padre) >= TIPOS_SUBDIVISION[tipoSubdivision].nivel) {
      throw new ReglaError('JERARQUIA_INVALIDA', 'Una subdivisión solo puede estar dentro de otra de nivel mayor');
    }
  }
  if (prioridad !== null && !Object.hasOwn(PRIORIDADES, prioridad)) throw new ReglaError('PRIORIDAD_INVALIDA', 'Prioridad inválida');
  const elegidas = ciudadesPropias(estado, jugadorId, ciudades);
  const padreCreacion = padreId !== null ? subdivisionPorId(jugador, padreId) : null;
  validarCapacidad(jugador, TIPOS_SUBDIVISION[tipoSubdivision].nivel, [], padreCreacion ? [padreCreacion, ...ancestros(jugador, padreCreacion)] : [], elegidas);

  // Id determinista (no aleatorio): el log de eventos tiene que reproducir la partida.
  const id = `sub${subdivisionesDe(jugador).reduce((m, s) => Math.max(m, Number(s.id.slice(3))), 0) + 1}`;
  return [evento('SubdivisionCreada', estado, jugadorId, { id, nombre: limpio, tipo: tipoSubdivision, padreId, prioridad, ciudades: elegidas })];
}

export function renombrarSubdivision(estado, jugadorId, { id, nombre }) {
  const jugador = jugadorFederal(estado, jugadorId);
  if (!subdivisionPorId(jugador, id)) throw new ReglaError('SUBDIVISION_DESCONOCIDA', 'Esa subdivisión no existe');
  return [evento('SubdivisionRenombrada', estado, jugadorId, { id, nombre: nombreLimpio(nombre) })];
}

export function asignarCiudades(estado, jugadorId, { id, ciudades }) {
  const jugador = jugadorFederal(estado, jugadorId);
  if (!subdivisionPorId(jugador, id)) throw new ReglaError('SUBDIVISION_DESCONOCIDA', 'Esa subdivisión no existe');
  const elegidas = ciudadesPropias(estado, jugadorId, ciudades);
  const destino = subdivisionPorId(jugador, id);
  validarCapacidad(jugador, nivelDe(destino), territorioDe(jugador, destino), ancestros(jugador, destino), elegidas);
  return [evento('CiudadesAsignadas', estado, jugadorId, { id, ciudades: elegidas })];
}

// Sacar ciudades de una subdivision: pasan a su padre (o, sin padre, quedan bajo el Pais).
// Es lo que hace el "desmarcar" de la interfaz: sin esto la unica forma de soltar una ciudad
// era quitar la subdivision entera.
export function desasignarCiudades(estado, jugadorId, { id, ciudades }) {
  const jugador = jugadorFederal(estado, jugadorId);
  const sub = subdivisionPorId(jugador, id);
  if (!sub) throw new ReglaError('SUBDIVISION_DESCONOCIDA', 'Esa subdivisión no existe');
  if (!Array.isArray(ciudades)) throw new ReglaError('CIUDAD_INVALIDA', 'Ciudades inválidas');
  const propias = sub.ciudades.filter(c => ciudades.some(x => x?.x === c.x && x?.y === c.y));
  return [evento('CiudadesDesasignadas', estado, jugadorId, { id, ciudades: propias })];
}

// Quitar REUBICA: las hijas y las ciudades directas pasan al padre (o, sin padre,
// las hijas quedan sin padre y las ciudades sueltas bajo el Pais). Nada se pierde.
export function quitarSubdivision(estado, jugadorId, { id }) {
  const jugador = jugadorFederal(estado, jugadorId);
  if (!subdivisionPorId(jugador, id)) {
    throw new ReglaError('SUBDIVISION_DESCONOCIDA', 'Esa subdivisión no existe');
  }
  return [evento('SubdivisionQuitada', estado, jugadorId, { id })];
}

// Gratis. `x: null` la quita. La cabecera tiene que ser una ciudad propia del
// territorio de la subdivision (directa o de una hija).
export function elegirCabecera(estado, jugadorId, { subdivisionId, x, y }) {
  const jugador = jugadorFederal(estado, jugadorId);
  const sub = subdivisionPorId(jugador, subdivisionId);
  if (!sub) throw new ReglaError('SUBDIVISION_DESCONOCIDA', 'Esa subdivisión no existe');
  if (x === null) return [evento('CabeceraElegida', estado, jugadorId, { id: subdivisionId, x: null, y: null })];
  ciudadesPropias(estado, jugadorId, [{ x, y }]);
  if (!territorioDe(jugador, sub).some(c => c.x === x && c.y === y)) {
    throw new ReglaError('FUERA_DE_SUBDIVISION', 'La cabecera tiene que ser una ciudad de esa subdivisión');
  }
  return [evento('CabeceraElegida', estado, jugadorId, { id: subdivisionId, x, y })];
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

  // TODAS las ciudades propias se administran: cada una con la prioridad
  // efectiva de su subdivision directa (o economia si va suelta, bajo el Pais).
  const ciudades = estado.mapa.filter(t => t.ciudad && t.dueno === jugadorId);
  if (ciudades.length === 0) return [];
  const grupos = ciudades.map(t => ({
    prioridad: prioridadEfectiva(jugador, subdivisionDeCiudad(jugador, t.x, t.y)),
    ciudades: [{ x: t.x, y: t.y }],
  }));

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
