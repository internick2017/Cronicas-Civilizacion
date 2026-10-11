import {
  PROBLEMAS, LIMITE_SENAL, LIMITE_PROBLEMA, GRAVEDAD_MAXIMA, MEDIDOR_NEUTRO,
  DISTANCIA_PROPAGACION, RONDAS_RECUPERACION, RESOLUCION_POR_NIVEL, JITTER_INICIAL, MAX_PROBLEMAS_NUEVOS_POR_RONDA,
} from '../constantes.js';
import { evento } from './comun.js';
import { formaEstadoDe } from './gobierno.js';
import { subdivisionResolutora, nivelDe } from './subdivisiones.js';
import { perdidaPoblacion } from './efectosProblemas.js';

// Problemas sociales por zona (ver docs/superpowers/specs/2026-10-12-subdivisiones-problemas-design.md).
// Solo existen en el Estado FEDERAL. Cada ciudad tiene un medidor por problema; al
// cruzar LIMITE_PROBLEMA aparece el problema y lo resuelve, solo y con oro, la
// subdivision de menor nivel que cubra todas las ciudades afectadas.

// --- Lectura con default (una partida vieja no trae ninguno de estos campos) ----
export const medidoresDe = (jugador) => structuredClone(jugador?.medidores ?? {});
export const problemasDe = (jugador) => structuredClone(jugador?.problemas ?? []);
const resueltosDe = (jugador) => structuredClone(jugador?.problemasResueltos ?? []);

const clave = (c) => `${c.x},${c.y}`;
const acotar = (n) => Math.max(0, Math.min(100, n));
const distancia = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

// --- Que mueve cada medidor -----------------------------------------------------
// Cada funcion devuelve cuanto SUBE (+) o BAJA (-) el medidor de UNA ciudad en una
// ronda. Reaccionan a cosas que el juego ya tiene (edificios, recursos, tropa,
// enemigos cerca). Son heuristicas: la direccion es lo que importa, las cifras se
// ajustan midiendo (ver tarea de balance). Si no hay presion (0) el medidor deriva
// de a 1 hacia el valor neutro, para que nada quede clavado para siempre.
const tiene = (ciudad, edificio) => ciudad.edificios.includes(edificio);

function enemigoCerca(estado, tile, jugadorId) {
  for (const t of estado.mapa) {
    if (t.ejercito && t.ejercito.dueno !== jugadorId && distancia(t, tile) <= DISTANCIA_PROPAGACION) return true;
  }
  return false;
}

const PRESION = {
  // Sin cuartel ni tropa que patrulle, crece. El cuartel la baja.
  inseguridad: ({ ciudad, tile, jugador }) =>
    tiene(ciudad, 'barracks') ? -2 : (tile.ejercito?.dueno === jugador.id ? -1 : 2),
  // Poca obra para tanta gente: faltan empleos.
  desempleo: ({ ciudad }) => (ciudad.edificios.length < 2 * ciudad.nivel ? 2 : -2),
  // Mucho oro acumulado sin gastar recalienta los precios.
  inflacion: ({ jugador }) => ((jugador.recursos?.gold ?? 0) > 300 ? 2 : -1),
  // Sin comida sobrante la gente empobrece; el granero ayuda.
  pobreza: ({ ciudad, jugador }) => ((jugador.recursos?.food ?? 0) < 50 ? 2 : (tiene(ciudad, 'granary') ? -2 : -1)),
  // Una ciudad que crecio sin granero se enferma.
  salud: ({ ciudad }) => (ciudad.nivel >= 2 && !tiene(ciudad, 'granary') ? 2 : -1),
  // Sin biblioteca no hay escuela.
  educacion: ({ ciudad }) => (tiene(ciudad, 'library') ? -2 : 2),
  // Sin aserradero ni cantera no hay con que construir viviendas y caminos.
  infraestructura: ({ ciudad }) => (tiene(ciudad, 'sawmill') || tiene(ciudad, 'quarry') ? -2 : 2),
  // Un imperio grande sin mercado que ordene el comercio se corrompe.
  corrupcion: ({ ciudad, nCiudades }) => (nCiudades > 5 && !tiene(ciudad, 'market') ? 2 : -1),
  // Sequias al azar; el rio y el granero amortiguan.
  clima: ({ ciudad, tile, rng }) =>
    (rng() < 0.08 ? 4 : 0) + (tile.terreno === 'river' ? -2 : (tiene(ciudad, 'granary') ? -1 : 0)),
  // Enemigos pegados a la frontera presionan; el cuartel contiene.
  inmigracion: ({ estado, ciudad, tile, jugador }) =>
    (enemigoCerca(estado, tile, jugador.id) ? (tiene(ciudad, 'barracks') ? 0 : 2) : -1),
};

// Valor inicial del medidor de una ciudad nueva: neutro +- JITTER_INICIAL, determinista
// (sale de las coordenadas y del tipo, no del azar) para que las ciudades no cruzen juntas.
function inicial(t, indiceTipo) {
  const desvio = ((t.x * 31 + t.y * 17 + indiceTipo * 13) % (2 * JITTER_INICIAL + 1)) - JITTER_INICIAL;
  return MEDIDOR_NEUTRO + desvio;
}

function mover(medidor, delta) {
  if (delta !== 0) return acotar(medidor + delta);
  if (medidor > MEDIDOR_NEUTRO) return medidor - 1;
  if (medidor < MEDIDOR_NEUTRO) return medidor + 1;
  return medidor;
}

// --- Una pasada por jugador federal ---------------------------------------------
function pasada(estado, jugador, rng) {
  const turno = estado.turno;
  const eventos = [];
  const propias = estado.mapa.filter(t => t.ciudad && t.dueno === jugador.id);
  const claves = new Set(propias.map(t => clave(t)));
  const tipos = Object.keys(PROBLEMAS);

  // 1. Un problema que nombra una ciudad perdida o capturada se descarta entero:
  // si los medidores siguen altos, vuelve a aparecer con las ciudades que quedan.
  let problemas = problemasDe(jugador);
  const perdidos = problemas.filter(p => p.ciudades.some(c => !claves.has(clave(c))));
  if (perdidos.length > 0) {
    eventos.push(evento('ProblemasDescartados', estado, jugador.id, { ids: perdidos.map(p => p.id) }));
    problemas = problemas.filter(p => !perdidos.includes(p));
  }
  const activoEn = (tipo, c) => problemas.some(p => p.tipo === tipo && p.ciudades.some(x => clave(x) === clave(c)));

  // 2. Medidores: ciudades nuevas nacen neutras, las perdidas desaparecen.
  const previos = jugador.medidores ?? {};
  const meds = {};
  for (const t of propias) {
    meds[clave(t)] = previos[clave(t)] ? { ...previos[clave(t)] }
      : Object.fromEntries(tipos.map((tp, i) => [tp, inicial(t, i)]));
    tipos.forEach((tp, i) => { if (meds[clave(t)][tp] === undefined) meds[clave(t)][tp] = inicial(t, i); });
  }
  for (const t of propias) {
    for (const tp of tipos) {
      if (activoEn(tp, t)) { meds[clave(t)][tp] = Math.max(meds[clave(t)][tp], LIMITE_PROBLEMA); continue; }
      const delta = PRESION[tp]({ estado, jugador, tile: t, ciudad: t.ciudad, nCiudades: propias.length, rng });
      meds[clave(t)][tp] = mover(meds[clave(t)][tp], delta);
    }
  }

  // 3. Surgen los problemas. Cada ciudad que cruza el limite abarca tambien a las
  // cercanas que ya estan en aviso del mismo tipo: asi un problema puede pisar dos
  // Freguesias y subir al Municipio que las contiene.
  let contador = jugador.contadorProblemas ?? 0;
  let nuevos = 0;
  // Se empieza por un tipo distinto cada ronda para que ninguno quede siempre ultimo
  // cuando el tope de nuevos por ronda deja problemas esperando.
  const orden = tipos.map((_, i) => tipos[(i + turno) % tipos.length]);
  for (const tp of orden) {
    const reclamadas = new Set();
    for (const t of propias) {
      if (nuevos >= MAX_PROBLEMAS_NUEVOS_POR_RONDA) break;
      if (meds[clave(t)][tp] < LIMITE_PROBLEMA || activoEn(tp, t) || reclamadas.has(clave(t))) continue;
      const grupo = [t];
      reclamadas.add(clave(t));
      for (const o of propias) {
        if (reclamadas.has(clave(o)) || activoEn(tp, o)) continue;
        // La inflacion es nacional: suma a toda ciudad en aviso, sin limite de distancia.
        if (meds[clave(o)][tp] >= LIMITE_SENAL && (PROBLEMAS[tp].global || distancia(t, o) <= DISTANCIA_PROPAGACION)) {
          grupo.push(o);
          reclamadas.add(clave(o));
        }
      }
      const ciudades = grupo.map(({ x, y }) => ({ x, y }));
      const sub = subdivisionResolutora(jugador, ciudades);
      const nivel = sub ? nivelDe(sub) : 1;
      contador += 1;
      const problema = {
        id: `pr${contador}`, tipo: tp, ciudades, gravedad: 1, desde: turno,
        resolutor: sub ? sub.id : null, listoEn: turno + RESOLUCION_POR_NIVEL[nivel].rondas,
      };
      problemas.push(problema);
      nuevos += 1;
      eventos.push(evento('ProblemaSurgido', estado, jugador.id, { problema }));
    }
  }

  // 4. Se resuelven los que ya estan listos (los de esta misma ronda, no). El
  // resolutor se vuelve a calcular ahora: si el jugador reorganizo el arbol, cuenta
  // el arbol de hoy. Sin oro, el problema empeora; nunca bloquea nada.
  let oro = jugador.recursos?.gold ?? 0;
  for (const p of problemas) {
    if (p.desde >= turno || p.listoEn > turno) continue;
    const sub = subdivisionResolutora(jugador, p.ciudades);
    const costo = RESOLUCION_POR_NIVEL[sub ? nivelDe(sub) : 1].oro;
    if (oro >= costo) {
      oro -= costo;
      eventos.push(evento('RecursosGastados', estado, jugador.id, { costo: { gold: costo } }));
      eventos.push(evento('ProblemaResuelto', estado, jugador.id, {
        id: p.id, tipo: p.tipo, ciudades: p.ciudades, resolutor: sub ? sub.id : null,
      }));
      for (const c of p.ciudades) meds[clave(c)][p.tipo] = Math.floor(LIMITE_PROBLEMA / 2);
    } else if (p.gravedad < GRAVEDAD_MAXIMA) {
      eventos.push(evento('ProblemaAgravado', estado, jugador.id, { id: p.id, gravedad: p.gravedad + 1 }));
    }
  }

  // Salud: cada ciudad con un problema de salud ACTIVO pierde poblacion esta ronda.
  for (const t of propias) {
    const perdida = perdidaPoblacion({ problemas: problemasDe(jugador).filter(p => !perdidos.some(q => q.id === p.id)) }, t.x, t.y);
    if (perdida > 0) eventos.push(evento('PoblacionAjustada', estado, jugador.id, { x: t.x, y: t.y, delta: -perdida }));
  }

  // Ultimo: marca la ronda como procesada (idempotencia) y guarda los medidores.
  eventos.push(evento('MedidoresActualizados', estado, jugador.id, { medidores: meds, ronda: turno }));
  return eventos;
}

// Se llama al cerrar CADA ronda (ver terminarTurno). Idempotente por ronda: una
// peticion que cierra varias rondas da lo mismo que varias peticiones.
export function cerrarRondaProblemas(estado, rng) {
  const eventos = [];
  for (const jugador of estado.jugadores) {
    if (!jugador.activo) continue;
    if (formaEstadoDe(jugador) !== 'federal') {
      // Pasar a unitario cierra los problemas sin costo y congela los medidores.
      const activos = problemasDe(jugador);
      if (activos.length > 0) {
        eventos.push(evento('ProblemasDescartados', estado, jugador.id, { ids: activos.map(p => p.id) }));
      }
      continue;
    }
    if ((jugador.problemasRonda ?? 0) >= estado.turno) continue;
    eventos.push(...pasada(estado, jugador, rng));
  }
  return eventos;
}

// Para la vista del propio jugador: avisos antes del limite y recuperacion despues
// de resolver. Los medidores crudos no se muestran: son diez numeros por ciudad.
export function senalesDe(estado, jugador) {
  const senales = [];
  const meds = jugador?.medidores ?? {};
  const problemas = jugador?.problemas ?? [];
  for (const tp of Object.keys(PROBLEMAS)) {
    const ciudades = [];
    for (const [k, valores] of Object.entries(meds)) {
      const [x, y] = k.split(',').map(Number);
      const activo = problemas.some(p => p.tipo === tp && p.ciudades.some(c => c.x === x && c.y === y));
      if (!activo && valores[tp] >= LIMITE_SENAL && valores[tp] < LIMITE_PROBLEMA) ciudades.push({ x, y });
    }
    if (ciudades.length > 0) senales.push({ tipo: tp, ciudades, estado: 'aviso' });
  }
  for (const r of resueltosDe(jugador)) {
    if (r.ronda >= estado.turno - RONDAS_RECUPERACION) {
      senales.push({ tipo: r.tipo, ciudades: r.ciudades, estado: 'recuperacion' });
    }
  }
  return senales;
}

// Los problemas ACTIVOS para la vista, con el resolutor, el nivel y el costo de HOY (los que va a
// cobrar el backend), no los guardados cuando el problema surgio: si el jugador reorganizo el arbol
// entre tanto, la pantalla tiene que mostrar lo mismo que se cobra.
export function problemasParaLaVista(estado, jugador) {
  return problemasDe(jugador).map(p => {
    const sub = subdivisionResolutora(jugador, p.ciudades);
    const nivel = sub ? nivelDe(sub) : 1;
    return {
      ...p,
      resolutorActual: sub ? sub.id : null,
      nivelResolutor: nivel,
      costoResolver: RESOLUCION_POR_NIVEL[nivel].oro,
      rondasRestantes: Math.max(0, p.listoEn - estado.turno),
    };
  });
}
