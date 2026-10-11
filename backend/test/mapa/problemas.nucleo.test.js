import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado, jugadorPorId, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { cambiarFormaEstado } from '../../src/domain/mapa/reglas/gobierno.js';
import { crearSubdivision } from '../../src/domain/mapa/reglas/subdivisiones.js';
import { vistaJugador } from '../../src/domain/mapa/reglas/visibilidad.js';
import {
  cerrarRondaProblemas, medidoresDe, problemasDe, senalesDe,
} from '../../src/domain/mapa/reglas/problemas.js';
import { PROBLEMAS, MEDIDOR_NEUTRO, LIMITE_PROBLEMA, LIMITE_SENAL, GRAVEDAD_MAXIMA, RESOLUCION_POR_NIVEL, MAX_PROBLEMAS_NUEVOS_POR_RONDA, JITTER_INICIAL } from '../../src/domain/mapa/constantes.js';
import { crearRng } from '../../src/domain/mapa/rng.js';

let e, p1, A, B, C; // A = capital; B = cerca de A (distancia 1); C = lejos (distancia > 3)
const k = (c) => `${c.x},${c.y}`;
const rng = () => crearRng('problemas');

function ciudadEn(x, y) {
  const t = tileEn(e, x, y);
  t.terreno = 'plains';
  t.ciudad = { nombre: `C${x}_${y}`, nivel: 1, poblacion: 500, edificios: ['barracks', 'granary', 'library', 'sawmill', 'market', 'quarry'] };
  t.dueno = 'p1';
  return { x, y };
}
// Un medidor puesto a mano (alto, para que la presion de la ronda no lo baje del limite).
function medir(ciudad, tipo, valor) {
  p1.medidores = p1.medidores ?? {};
  p1.medidores[k(ciudad)] = { ...(p1.medidores[k(ciudad)] ?? Object.fromEntries(Object.keys(PROBLEMAS).map(t => [t, MEDIDOR_NEUTRO]))), [tipo]: valor };
}
// Corre una pasada de la ronda `turno` y aplica los eventos.
function ronda(turno) {
  e.turno = turno;
  const evs = cerrarRondaProblemas(e, rng());
  aplicar(e, evs);
  return evs;
}
const activos = () => problemasDe(p1);
const mun = (nombre, ciudades, extra = {}) => {
  const evs = crearSubdivision(e, 'p1', { nombre, tipoSubdivision: 'municipio', ciudades, ...extra });
  aplicar(e, evs);
  return evs[0].datos.id;
};

beforeEach(() => {
  e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  p1 = jugadorPorId(e, 'p1');
  p1.recursos = { food: 999, gold: 500, wood: 999, stone: 999, science: 999, culture: 999 };
  aplicar(e, cambiarFormaEstado(e, 'p1', { formaEstado: 'federal' }));
  const cap = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
  const tam = e.config.tamanoMapa;
  A = { x: cap.x, y: cap.y };
  B = ciudadEn(cap.x + (cap.x + 1 < tam ? 1 : -1), cap.y);
  C = ciudadEn(cap.x + (cap.x + 7 < tam ? 7 : -7), cap.y);
  tileEn(e, A.x, A.y).ciudad.edificios = ['barracks', 'granary', 'library', 'sawmill', 'market', 'quarry'];
});

describe('constantes de problemas', () => {
  it('hay exactamente los diez problemas dictados', () => {
    expect(Object.keys(PROBLEMAS).sort()).toEqual([
      'clima', 'corrupcion', 'desempleo', 'educacion', 'inflacion', 'infraestructura',
      'inmigracion', 'inseguridad', 'pobreza', 'salud',
    ]);
    expect(RESOLUCION_POR_NIVEL[1].oro).toBeGreaterThan(RESOLUCION_POR_NIVEL[6].oro);
    expect(RESOLUCION_POR_NIVEL[1].rondas).toBeGreaterThan(RESOLUCION_POR_NIVEL[6].rondas);
  });
});

describe('medidores', () => {
  it('nacen en el valor neutro para cada ciudad propia y se guardan por ciudad', () => {
    ronda(1);
    for (const c of [A, B, C]) expect(Object.values(medidoresDe(p1)[k(c)]).length).toBe(10);
    expect(Math.min(...Object.values(medidoresDe(p1)[k(A)]))).toBeGreaterThanOrEqual(0);
  });

  it('inseguridad sube sin cuartel ni tropa y baja con cuartel', () => {
    tileEn(e, B.x, B.y).ciudad.edificios = []; // B sin cuartel
    medir(A, 'inseguridad', MEDIDOR_NEUTRO);
    medir(B, 'inseguridad', MEDIDOR_NEUTRO);
    ronda(1);
    expect(medidoresDe(p1)[k(B)].inseguridad).toBeGreaterThan(MEDIDOR_NEUTRO);
    expect(medidoresDe(p1)[k(A)].inseguridad).toBeLessThan(MEDIDOR_NEUTRO);
  });

  it('los medidores iniciales difieren entre ciudades (si no, todas cruzan a la vez) y son deterministas', () => {
    ronda(1);
    const valores = new Set([A, B, C].flatMap(c => Object.values(medidoresDe(p1)[k(c)])));
    expect(valores.size).toBeGreaterThan(3);
    for (const c of [A, B, C]) for (const v of Object.values(medidoresDe(p1)[k(c)])) {
      expect(Math.abs(v - MEDIDOR_NEUTRO)).toBeLessThanOrEqual(JITTER_INICIAL + 3);
    }
    const copia = structuredClone(e);
    p1.medidores = {}; copia.jugadores[0].medidores = {};
    e.turno = 7; copia.turno = 7;
    p1.problemasRonda = 0; copia.jugadores[0].problemasRonda = 0;
    expect(cerrarRondaProblemas(e, rng())).toEqual(cerrarRondaProblemas(copia, rng()));
  });

  it('en unitario no hay medidores ni problemas', () => {
    aplicar(e, cambiarFormaEstado(e, 'p1', { formaEstado: 'unitario' }));
    expect(ronda(1)).toEqual([]);
    expect(medidoresDe(p1)).toEqual({});
  });
});

describe('aparición y resolución', () => {
  it('un medidor que cruza el límite crea un problema con su resolutor', () => {
    const id = mun('M', [A]);
    medir(A, 'desempleo', 90);
    const evs = ronda(1);
    expect(evs.filter(x => x.tipo === 'ProblemaSurgido')).toHaveLength(1);
    expect(activos()).toMatchObject([{ tipo: 'desempleo', ciudades: [A], gravedad: 1, desde: 1, resolutor: id }]);
  });

  it('afecta una sola ciudad: lo resuelve la subdivisión que la contiene (la más chica)', () => {
    const dep = crearSubdivision(e, 'p1', { nombre: 'D', tipoSubdivision: 'departamento', ciudades: [] });
    aplicar(e, dep);
    const fre = crearSubdivision(e, 'p1', { nombre: 'F', tipoSubdivision: 'freguesia', padreId: dep[0].datos.id, ciudades: [A] });
    aplicar(e, fre);
    medir(A, 'clima', 90);
    ronda(1);
    expect(activos()[0].resolutor).toBe(fre[0].datos.id);
  });

  it('afecta ciudades de dos ramas: lo resuelve el ancestro común, o el País si no hay', () => {
    // A y B cerca: el problema las abarca a las dos (propagacion por cercania).
    const d1 = crearSubdivision(e, 'p1', { nombre: 'D1', tipoSubdivision: 'departamento' }); aplicar(e, d1);
    const f1 = crearSubdivision(e, 'p1', { nombre: 'F1', tipoSubdivision: 'freguesia', padreId: d1[0].datos.id, ciudades: [A] }); aplicar(e, f1);
    const f2 = crearSubdivision(e, 'p1', { nombre: 'F2', tipoSubdivision: 'freguesia', padreId: d1[0].datos.id, ciudades: [B] }); aplicar(e, f2);
    medir(A, 'pobreza', 90);
    medir(B, 'pobreza', LIMITE_SENAL + 5);
    ronda(1);
    expect(activos()[0].ciudades).toEqual(expect.arrayContaining([A, B]));
    expect(activos()[0].ciudades).toHaveLength(2);
    expect(activos()[0].resolutor).toBe(d1[0].datos.id); // ancestro común

    // Ramas sin ningun ancestro común: lo resuelve el País (resolutor null).
    e.turno = 1;
    p1.problemas = []; p1.subdivisiones = [];
    const d2 = crearSubdivision(e, 'p1', { nombre: 'X', tipoSubdivision: 'departamento', ciudades: [A] }); aplicar(e, d2);
    const d3 = crearSubdivision(e, 'p1', { nombre: 'Y', tipoSubdivision: 'departamento', ciudades: [B] }); aplicar(e, d3);
    medir(A, 'pobreza', 90); medir(B, 'pobreza', LIMITE_SENAL + 5);
    p1.problemasRonda = 0;
    ronda(2);
    expect(activos()[0].resolutor).toBeNull();
  });

  it('la propagación no alcanza a una ciudad lejana', () => {
    medir(A, 'salud', 90);
    medir(C, 'salud', LIMITE_SENAL + 5);
    ronda(1);
    expect(activos()[0].ciudades).toEqual([A]);
  });

  it('se resuelve a las N rondas del nivel y cuesta el oro del nivel', () => {
    mun('M', [A]); // Municipio: nivel 5
    medir(A, 'educacion', 90);
    const { rondas, oro } = RESOLUCION_POR_NIVEL[5];
    ronda(1);
    const antes = p1.recursos.gold;
    for (let t = 2; t < 1 + rondas; t++) { ronda(t); expect(activos()).toHaveLength(1); }
    const evs = ronda(1 + rondas);
    expect(evs.map(x => x.tipo)).toEqual(expect.arrayContaining(['RecursosGastados', 'ProblemaResuelto']));
    expect(activos()).toHaveLength(0);
    expect(p1.recursos.gold).toBe(antes - oro);
    // el medidor baja a la mitad del limite
    expect(medidoresDe(p1)[k(A)].educacion).toBeLessThanOrEqual(LIMITE_PROBLEMA / 2 + 3);
  });

  it('sin oro suficiente empeora hasta el máximo y no duplica el problema', () => {
    mun('M', [A]);
    p1.recursos.gold = 0;
    medir(A, 'inflacion', 90);
    ronda(1);
    const hasta = 1 + RESOLUCION_POR_NIVEL[5].rondas;
    const gravedades = [];
    for (let t = 2; t <= hasta + GRAVEDAD_MAXIMA + 2; t++) {
      ronda(t);
      medir(A, 'inflacion', 90); // sigue alto: no puede aparecer un segundo problema igual
      gravedades.push(activos().map(p => p.gravedad));
    }
    const ultimos = gravedades.at(-1);
    expect(ultimos).toEqual([GRAVEDAD_MAXIMA]);
    expect(Math.max(...gravedades.flat())).toBe(GRAVEDAD_MAXIMA);
    expect(activos().filter(p => p.tipo === 'inflacion')).toHaveLength(1);
    expect(p1.recursos.gold).toBe(0);
  });

  it('dos problemas listos a la vez no gastan más oro del que hay', () => {
    mun('M', [A, B]);
    p1.recursos.gold = RESOLUCION_POR_NIVEL[5].oro; // alcanza para uno solo
    medir(A, 'clima', 90); medir(C, 'salud', 90);
    ronda(1);
    for (let t = 2; t <= 6; t++) ronda(t);
    expect(p1.recursos.gold).toBeGreaterThanOrEqual(0);
  });
});

describe('ritmo de los problemas', () => {
  it('no surgen más de MAX_PROBLEMAS_NUEVOS_POR_RONDA a la vez; el resto espera la ronda siguiente', () => {
    for (const tipo of Object.keys(PROBLEMAS)) medir(A, tipo, 90);
    ronda(1);
    expect(activos()).toHaveLength(MAX_PROBLEMAS_NUEVOS_POR_RONDA);
    ronda(2);
    expect(activos().length).toBeGreaterThan(MAX_PROBLEMAS_NUEVOS_POR_RONDA);
    expect(activos().length).toBeLessThanOrEqual(2 * MAX_PROBLEMAS_NUEVOS_POR_RONDA);
  });

  it('la inflación es nacional: abarca a todas las ciudades en aviso, sin importar la distancia', () => {
    medir(A, 'inflacion', 90);
    medir(C, 'inflacion', LIMITE_SENAL + 8); // lejos de A
    ronda(1);
    const infl = activos().find(p => p.tipo === 'inflacion');
    expect(infl.ciudades).toEqual(expect.arrayContaining([A, C]));
  });
});

describe('ciudades y forma de Estado', () => {
  it('una ciudad perdida o capturada pierde sus medidores y problemas', () => {
    medir(B, 'desempleo', 90);
    ronda(1);
    expect(activos()).toHaveLength(1);
    tileEn(e, B.x, B.y).dueno = 'p2'; // capturada
    const evs = ronda(2);
    expect(evs.some(x => x.tipo === 'ProblemasDescartados')).toBe(true);
    expect(activos()).toEqual([]);
    expect(medidoresDe(p1)[k(B)]).toBeUndefined();
    for (const p of activos()) for (const c of p.ciudades) expect(medidoresDe(p1)[k(c)]).toBeDefined();
  });

  it('pasar a unitario cierra los problemas en el acto y sin costo, y volver a federal sigue sin errores', () => {
    medir(A, 'corrupcion', 90);
    ronda(1);
    expect(activos()).toHaveLength(1);
    const oro = p1.recursos.gold;
    aplicar(e, cambiarFormaEstado(e, 'p1', { formaEstado: 'unitario' }));
    expect(activos()).toEqual([]); // en el acto, sin esperar al cierre de ronda
    expect(ronda(2)).toEqual([]);
    expect(p1.recursos.gold).toBe(oro);
    expect(Object.keys(medidoresDe(p1)).length).toBeGreaterThan(0); // congelados, no borrados
    aplicar(e, cambiarFormaEstado(e, 'p1', { formaEstado: 'federal' }));
    expect(() => ronda(3)).not.toThrow();
  });

  it('un bot federal también tiene medidores y problemas', () => {
    const bot = jugadorPorId(e, 'p2');
    bot.esBot = true;
    bot.formaEstado = 'federal';
    const cap = e.mapa.find(t => t.ciudad && t.dueno === 'p2');
    bot.medidores = { [`${cap.x},${cap.y}`]: Object.fromEntries(Object.keys(PROBLEMAS).map(t => [t, 90])) };
    e.turno = 1;
    const evs = cerrarRondaProblemas(e, rng());
    expect(evs.some(x => x.tipo === 'ProblemaSurgido' && x.jugadorId === 'p2')).toBe(true);
  });
});

describe('idempotencia y determinismo', () => {
  it('procesar la misma ronda dos veces no duplica nada', () => {
    medir(A, 'desempleo', 90);
    ronda(1);
    const antes = JSON.stringify(p1);
    expect(ronda(1)).toEqual([]);
    expect(JSON.stringify(p1)).toBe(antes);
  });

  it('misma semilla y ronda dan los mismos eventos', () => {
    medir(A, 'desempleo', 90);
    const copia = structuredClone(e);
    e.turno = 4; copia.turno = 4;
    expect(cerrarRondaProblemas(e, rng())).toEqual(cerrarRondaProblemas(copia, rng()));
  });

  it('varias rondas seguidas dan lo mismo estén en una petición o en varias', () => {
    const a = structuredClone(e), b = structuredClone(e);
    const correr = (est) => {
      for (let t = 1; t <= 6; t++) { est.turno = t; aplicar(est, cerrarRondaProblemas(est, rng())); }
      return jugadorPorId(est, 'p1');
    };
    expect(correr(a)).toEqual(correr(b));
  });
});

describe('señales', () => {
  it('aviso antes del límite y recuperación después de resolver', () => {
    mun('M', [A]);
    medir(A, 'desempleo', LIMITE_SENAL + 2);
    ronda(1);
    expect(senalesDe(e, p1).some(s => s.tipo === 'desempleo' && s.estado === 'aviso')).toBe(true);
    medir(A, 'desempleo', 90);
    ronda(2);
    for (let t = 3; t < 3 + RESOLUCION_POR_NIVEL[5].rondas + 1; t++) ronda(t);
    expect(activos()).toEqual([]);
    expect(senalesDe(e, p1).some(s => s.tipo === 'desempleo' && s.estado === 'recuperacion')).toBe(true);
  });

  it('la vista de otro jugador no trae medidores ni problemas', () => {
    medir(A, 'desempleo', 90);
    ronda(1);
    const yo = vistaJugador(e, 'p1').jugadores.find(j => j.id === 'p1');
    const rival = vistaJugador(e, 'p2').jugadores.find(j => j.id === 'p1');
    expect(yo.problemas).toHaveLength(1);
    expect(Array.isArray(yo.senales)).toBe(true);
    expect(rival.problemas).toBeUndefined();
    expect(rival.senales).toBeUndefined();
    expect(rival.medidores).toBeUndefined();
  });

  it('una partida vieja sin campos de problemas se lee con defaults', () => {
    const viejo = { id: 'x' };
    expect(medidoresDe(viejo)).toEqual({});
    expect(problemasDe(viejo)).toEqual([]);
  });
});
