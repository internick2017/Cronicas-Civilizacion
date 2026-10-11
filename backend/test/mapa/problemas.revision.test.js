import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { MapGameRepo } from '../../src/db/MapGameRepo.js';
import { MapGameService } from '../../src/services/MapGameService.js';
import { crearEstado, jugadorPorId, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { terminarTurno } from '../../src/domain/mapa/reglas/turnos.js';
import { cambiarFormaEstado } from '../../src/domain/mapa/reglas/gobierno.js';
import { botinDe } from '../../src/domain/mapa/reglas/saqueo.js';
import { vistaJugador } from '../../src/domain/mapa/reglas/visibilidad.js';
import { problemasDe, medidoresDe } from '../../src/domain/mapa/reglas/problemas.js';
import {
  crearSubdivision, asignarCiudades, desasignarCiudades, subdivisionPorId, subdivisionDeCiudad,
  subdivisionesDe,
} from '../../src/domain/mapa/reglas/subdivisiones.js';
import { organizarSubdivisionesIA } from '../../src/domain/mapa/iaSubdivisiones.js';
import { jugarTurnoIA } from '../../src/domain/mapa/ia.js';
import { crearRng } from '../../src/domain/mapa/rng.js';

let e, p1, A, B;
const k = (c) => `${c.x},${c.y}`;
const codigo = (fn) => { try { fn(); } catch (err) { return err.codigo; } return null; };

function ciudadEn(estado, x, y, dueno) {
  const t = tileEn(estado, x, y);
  t.terreno = 'plains';
  t.ciudad = { nombre: `C${x}_${y}`, nivel: 1, poblacion: 500, edificios: [] };
  t.dueno = dueno;
  return { x, y };
}
function problema(tipo, ciudades, extra = {}) {
  p1.problemas = [...(p1.problemas ?? []), { id: `pr${(p1.problemas ?? []).length + 1}`, tipo, ciudades, gravedad: 1, desde: 1, resolutor: null, listoEn: 2, ...extra }];
}

beforeEach(() => {
  e = crearEstado({ nombre: 'T', semilla: 's-rev' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  p1 = jugadorPorId(e, 'p1');
  p1.recursos = { food: 999, gold: 999, wood: 999, stone: 999, science: 999, culture: 999 };
  aplicar(e, cambiarFormaEstado(e, 'p1', { formaEstado: 'federal' }));
  const cap = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
  A = { x: cap.x, y: cap.y };
  const tam = e.config.tamanoMapa;
  B = ciudadEn(e, cap.x + (cap.x + 1 < tam ? 1 : -1), cap.y, 'p1');
  tileEn(e, A.x, A.y).ciudad.edificios = [];
});

describe('el oro nunca queda negativo', () => {
  it('al cerrar la ronda, el gasto de la administración y el de un problema listo se miden en orden', () => {
    // Quien CIERRA la ronda (el ultimo en el orden) es quien lleva la administracion: ahi
    // sus gastos automaticos y el del problema salian del mismo oro de partida.
    const p2 = jugadorPorId(e, 'p2');
    aplicar(e, [{ tipo: 'FormaEstadoCambiada', turno: 1, jugadorId: 'p2', datos: { formaEstado: 'federal' } }]);
    const cap2 = e.mapa.find(t => t.ciudad && t.dueno === 'p2');
    tileEn(e, cap2.x, cap2.y).ciudad.edificios = [];
    p2.recursos = { food: 999, gold: 70, wood: 999, stone: 999, science: 999, culture: 999 };
    // alcanza para un mercado (50) pero no para ese Y los 60 del problema (lo resuelve el Pais)
    p2.problemas = [{ id: 'pr1', tipo: 'desempleo', ciudades: [{ x: cap2.x, y: cap2.y }], gravedad: 1, desde: 1, resolutor: null, listoEn: 2 }];
    e.turno = 2;
    aplicar(e, terminarTurno(e, 'p1'));
    aplicar(e, terminarTurno(e, 'p2'));
    expect(p2.recursos.gold).toBeGreaterThanOrEqual(0);
  });

  it('el botín de un saqueo nunca es negativo', () => {
    expect(botinDe(-37)).toBe(0);
  });
});

describe('la IA y la inflación', () => {
  it('no intenta construir lo que con inflación ya no puede pagar: sigue con otra decisión', () => {
    const e2 = crearEstado({ nombre: 'T', semilla: 'infl' });
    aplicar(e2, unirse(e2, { id: 'bot', nombre: 'M', civilizacion: 'Autómatas', esBot: true, dificultadIA: 'normal' }));
    aplicar(e2, unirse(e2, { id: 'h', nombre: 'H', civilizacion: 'Civ1' }));
    aplicar(e2, iniciar(e2));
    const bot = jugadorPorId(e2, 'bot');
    const cap = e2.mapa.find(t => t.ciudad && t.dueno === 'bot');
    bot.recursos = { food: 500, gold: 40, wood: 24, stone: 5, science: 0, culture: 0 };
    // granero sin inflacion: 30 comida y 20 madera. Con +25%: 38 y 25 madera, que no hay.
    bot.problemas = [{ id: 'pr1', tipo: 'inflacion', ciudades: [{ x: cap.x, y: cap.y }], gravedad: 1, desde: 1, resolutor: null, listoEn: 9 }];
    e2.indiceJugadorActual = e2.jugadores.findIndex(j => j.id === 'bot');
    const evs = jugarTurnoIA(e2, 'bot', crearRng('x'));
    expect(evs.some(x => x.tipo === 'UnidadReclutada')).toBe(true);
  });
});

describe('capacidad de las subdivisiones', () => {
  let ciudades;
  beforeEach(() => {
    const cap = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
    ciudades = [A, B];
    for (const t of e.mapa.filter(t => t.terreno !== 'water' && !t.ciudad && !t.dueno).slice(0, 3)) {
      ciudades.push(ciudadEn(e, t.x, t.y, 'p1'));
    }
    expect(cap).toBeTruthy();
  });

  it('una Freguesia no puede tener más de 3 ciudades, ni al crearla ni al asignar', () => {
    expect(codigo(() => crearSubdivision(e, 'p1', { nombre: 'F', tipoSubdivision: 'freguesia', ciudades: ciudades.slice(0, 4) }))).toBe('CAPACIDAD_EXCEDIDA');
    const evs = crearSubdivision(e, 'p1', { nombre: 'F', tipoSubdivision: 'freguesia', ciudades: ciudades.slice(0, 3) });
    aplicar(e, evs);
    expect(codigo(() => asignarCiudades(e, 'p1', { id: evs[0].datos.id, ciudades: [ciudades[3]] }))).toBe('CAPACIDAD_EXCEDIDA');
  });

  it('el territorio de una Freguesia cuenta para el tope de sus ancestros', () => {
    const mun = crearSubdivision(e, 'p1', { nombre: 'M', tipoSubdivision: 'municipio' });
    aplicar(e, mun);
    // un Municipio admite hasta 9: 5 ciudades en tres Freguesias entran sin problema
    aplicar(e, crearSubdivision(e, 'p1', { nombre: 'F1', tipoSubdivision: 'freguesia', padreId: mun[0].datos.id, ciudades: ciudades.slice(0, 3) }));
    expect(codigo(() => crearSubdivision(e, 'p1', { nombre: 'F2', tipoSubdivision: 'freguesia', padreId: mun[0].datos.id, ciudades: ciudades.slice(3, 5) }))).toBeNull();
  });

  it('un departamento no tiene tope práctico', () => {
    expect(codigo(() => crearSubdivision(e, 'p1', { nombre: 'D', tipoSubdivision: 'departamento', ciudades }))).toBeNull();
  });
});

describe('la vista muestra lo que el backend va a cobrar', () => {
  it('resolutor, nivel y costo se calculan con el árbol de HOY, no con el guardado al surgir', () => {
    problema('clima', [A], { resolutor: 'sub9', desde: 1, listoEn: 3 }); // quedo viejo
    const evs = crearSubdivision(e, 'p1', { nombre: 'F', tipoSubdivision: 'freguesia', ciudades: [A] });
    aplicar(e, evs);
    e.turno = 2;
    const yo = vistaJugador(e, 'p1').jugadores.find(j => j.id === 'p1');
    expect(yo.problemas[0]).toMatchObject({ resolutorActual: evs[0].datos.id, nivelResolutor: 6, costoResolver: 10, rondasRestantes: 1 });
    // sin ninguna subdivision que la cubra: el Pais (nivel 1, 60 de oro)
    p1.subdivisiones = [];
    const yo2 = vistaJugador(e, 'p1').jugadores.find(j => j.id === 'p1');
    expect(yo2.problemas[0]).toMatchObject({ resolutorActual: null, nivelResolutor: 1, costoResolver: 60 });
  });
});

describe('el narrador no recibe eventos privados', () => {
  it('los medidores, problemas y subdivisiones no llegan al texto que ven todos', async () => {
    const db = new Database(':memory:');
    const repo = new MapGameRepo(db, 'sqlite');
    repo.init();
    let recibidos = [];
    const svc = new MapGameService({ repo, narrador: async (eventos) => { recibidos = eventos; return 'narracion'; } });
    const { id } = await svc.crearPartida({ nombre: 'Solo', contraIA: true });
    const { token } = await svc.unirse(id, { id: 'yo', nombre: 'Yo', civilizacion: 'Incas' });
    await svc.iniciar(id);
    await svc.accion(id, 'yo', { tipo: 'cambiarFormaEstado', formaEstado: 'federal' }, token);
    await svc.accion(id, 'yo', { tipo: 'crearSubdivision', nombre: 'N', tipoSubdivision: 'distrito' }, token);
    await svc.accion(id, 'yo', { tipo: 'terminarTurno' }, token);
    await new Promise(r => setTimeout(r, 100));
    expect(recibidos.length).toBeGreaterThan(0);
    const privados = ['MedidoresActualizados', 'ProblemaSurgido', 'ProblemaAgravado', 'ProblemaResuelto',
      'ProblemasDescartados', 'PoblacionAjustada', 'SubdivisionCreada', 'SubdivisionRenombrada',
      'SubdivisionQuitada', 'CiudadesAsignadas', 'CiudadesDesasignadas', 'ApoyoActualizado'];
    expect(recibidos.filter(x => privados.includes(x.tipo))).toEqual([]);
  });
});

describe('sacar ciudades de una subdivisión', () => {
  it('desasignarCiudades las devuelve al padre, o al País si no tiene', () => {
    const dep = crearSubdivision(e, 'p1', { nombre: 'D', tipoSubdivision: 'departamento' });
    aplicar(e, dep);
    const fre = crearSubdivision(e, 'p1', { nombre: 'F', tipoSubdivision: 'freguesia', padreId: dep[0].datos.id, ciudades: [A, B] });
    aplicar(e, fre);
    aplicar(e, desasignarCiudades(e, 'p1', { id: fre[0].datos.id, ciudades: [B] }));
    expect(subdivisionPorId(p1, fre[0].datos.id).ciudades).toEqual([A]);
    expect(subdivisionDeCiudad(p1, B.x, B.y).id).toBe(dep[0].datos.id); // paso al padre
    aplicar(e, desasignarCiudades(e, 'p1', { id: dep[0].datos.id, ciudades: [B] }));
    expect(subdivisionDeCiudad(p1, B.x, B.y)).toBeNull(); // sin padre: bajo el País
    expect(codigo(() => desasignarCiudades(e, 'p1', { id: 'sub99', ciudades: [A] }))).toBe('SUBDIVISION_DESCONOCIDA');
  });
});

describe('limpieza inmediata de problemas', () => {
  it('pasar a unitario cierra los problemas en el acto, no al fin de la ronda', () => {
    problema('inflacion', [A]);
    aplicar(e, cambiarFormaEstado(e, 'p1', { formaEstado: 'unitario' }));
    expect(problemasDe(p1)).toEqual([]);
  });

  it('una ciudad capturada se lleva sus problemas y medidores en el acto', () => {
    problema('desempleo', [B]);
    p1.medidores = { [k(B)]: { desempleo: 90 }, [k(A)]: { desempleo: 40 } };
    aplicar(e, crearSubdivision(e, 'p1', { nombre: 'F', tipoSubdivision: 'freguesia', ciudades: [A, B] }));
    aplicar(e, [{ tipo: 'CiudadCapturada', turno: 1, jugadorId: 'p2', datos: { x: B.x, y: B.y } }]);
    expect(subdivisionesDe(p1)[0].ciudades).toEqual([A]); // tambien sale del arbol
    expect(problemasDe(p1)).toEqual([]);
    expect(medidoresDe(p1)[k(B)]).toBeUndefined();
    expect(medidoresDe(p1)[k(A)]).toBeDefined();
  });
});

describe('la IA no acumula subdivisiones vacías', () => {
  it('las que quedaron sin ciudades ni hijas se quitan al reorganizar', () => {
    const bot = (() => {
      const e2 = crearEstado({ nombre: 'T', semilla: 'vacias' });
      aplicar(e2, unirse(e2, { id: 'bot', nombre: 'M', civilizacion: 'Autómatas', esBot: true, dificultadIA: 'normal' }));
      aplicar(e2, unirse(e2, { id: 'h', nombre: 'H', civilizacion: 'Civ1' }));
      aplicar(e2, iniciar(e2));
      return e2;
    })();
    let puestas = 0;
    for (const t of bot.mapa) {
      if (puestas >= 5) break;
      if (t.terreno === 'water' || t.ciudad || t.dueno) continue;
      ciudadEn(bot, t.x, t.y, 'bot'); puestas++;
    }
    aplicar(bot, organizarSubdivisionesIA(bot, 'bot', { activa: true }));
    const j = jugadorPorId(bot, 'bot');
    for (const c of bot.mapa.filter(t => t.ciudad && t.dueno === 'bot').slice(1)) {
      aplicar(bot, [{ tipo: 'CiudadCapturada', turno: 1, jugadorId: 'h', datos: { x: c.x, y: c.y } }]); // las pierde, como en el juego
    }
    aplicar(bot, organizarSubdivisionesIA(bot, 'bot', { activa: true }));
    const subs = subdivisionesDe(j);
    const propias = new Set(bot.mapa.filter(t => t.ciudad && t.dueno === 'bot').map(t => `${t.x},${t.y}`));
    expect(subs.length).toBeGreaterThan(0);
    for (const s of subs) {
      const tieneHijas = subs.some(h => h.padreId === s.id);
      expect(tieneHijas || s.ciudades.length > 0).toBe(true);
      for (const c of s.ciudades) expect(propias.has(`${c.x},${c.y}`)).toBe(true); // ninguna ciudad perdida
    }
  });
});
