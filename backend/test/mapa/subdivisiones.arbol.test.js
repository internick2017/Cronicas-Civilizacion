import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado, jugadorPorId, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { cambiarFormaEstado } from '../../src/domain/mapa/reglas/gobierno.js';
import { TIPOS_SUBDIVISION } from '../../src/domain/mapa/constantes.js';
import {
  crearSubdivision, renombrarSubdivision, asignarCiudades, quitarSubdivision,
  administrarSubdivisiones, subdivisionesDe, subdivisionPorId, tipoDe, nivelDe, padreIdDe,
  ancestros, territorioDe, subdivisionDeCiudad, prioridadEfectiva, subdivisionResolutora,
} from '../../src/domain/mapa/reglas/subdivisiones.js';

let e, p1, c; // c = ciudades propias [{x,y}] (la capital y tres mas)
const codigo = (fn) => { try { fn(); } catch (err) { return err.codigo; } return null; };
const crear = (datos) => { const evs = crearSubdivision(e, 'p1', datos); aplicar(e, evs); return evs[0].datos.id; };

beforeEach(() => {
  e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  p1 = jugadorPorId(e, 'p1');
  p1.recursos = { food: 999, gold: 999, wood: 999, stone: 999, science: 999, culture: 999 };
  aplicar(e, cambiarFormaEstado(e, 'p1', { formaEstado: 'federal' }));
  const capital = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
  const libres = e.mapa.filter(t => t.terreno !== 'water' && !t.ciudad && !t.dueno).slice(0, 3);
  for (const t of libres) { t.ciudad = { nombre: `C${t.x}`, nivel: 1, poblacion: 500, edificios: [] }; t.dueno = 'p1'; }
  c = [capital, ...libres].map(t => ({ x: t.x, y: t.y }));
});

describe('jerarquía de subdivisiones', () => {
  it('hay exactamente los tipos y niveles dictados', () => {
    const niveles = Object.fromEntries(Object.entries(TIPOS_SUBDIVISION).map(([k, v]) => [k, v.nivel]));
    expect(niveles).toEqual({ departamento: 2, provincia: 2, distrito: 3, condado: 4, municipio: 5, concejo: 5, freguesia: 6 });
  });

  it('crea un Departamento y una Freguesia dentro', () => {
    const dep = crear({ nombre: 'Norte', tipoSubdivision: 'departamento' });
    const fre = crear({ nombre: 'San Pedro', tipoSubdivision: 'freguesia', padreId: dep, ciudades: [c[0]] });
    expect(padreIdDe(subdivisionPorId(p1, fre))).toBe(dep);
    expect(padreIdDe(subdivisionPorId(p1, dep))).toBeNull();
    expect(nivelDe(subdivisionPorId(p1, fre))).toBe(6);
    expect(ancestros(p1, subdivisionPorId(p1, fre)).map(s => s.id)).toEqual([dep]);
  });

  it('rechaza padre de nivel igual o menor, padre inexistente, tipo inválido y claves del prototipo', () => {
    const mun = crear({ nombre: 'M', tipoSubdivision: 'municipio' });
    expect(codigo(() => crearSubdivision(e, 'p1', { nombre: 'X', tipoSubdivision: 'concejo', padreId: mun }))).toBe('JERARQUIA_INVALIDA');
    expect(codigo(() => crearSubdivision(e, 'p1', { nombre: 'X', tipoSubdivision: 'departamento', padreId: mun }))).toBe('JERARQUIA_INVALIDA');
    expect(codigo(() => crearSubdivision(e, 'p1', { nombre: 'X', tipoSubdivision: 'freguesia', padreId: 'sub99' }))).toBe('SUBDIVISION_DESCONOCIDA');
    for (const tipo of ['pais', 'constructor', 'toString', '__proto__']) {
      expect(codigo(() => crearSubdivision(e, 'p1', { nombre: 'X', tipoSubdivision: tipo }))).toBe('TIPO_INVALIDO');
    }
    expect(codigo(() => crearSubdivision(e, 'p1', { nombre: 'X', tipoSubdivision: 'freguesia', prioridad: 'magia' }))).toBe('PRIORIDAD_INVALIDA');
  });

  it('una ciudad asignada a la hija sale de la madre y el territorio de la madre incluye la de la hija', () => {
    const mun = crear({ nombre: 'M', tipoSubdivision: 'municipio', ciudades: [c[0], c[1]] });
    const fre = crear({ nombre: 'F', tipoSubdivision: 'freguesia', padreId: mun, ciudades: [c[0]] });
    expect(subdivisionPorId(p1, mun).ciudades).toEqual([c[1]]);
    expect(subdivisionDeCiudad(p1, c[0].x, c[0].y).id).toBe(fre);
    expect(territorioDe(p1, subdivisionPorId(p1, mun))).toEqual(expect.arrayContaining([c[0], c[1]]));
    expect(territorioDe(p1, subdivisionPorId(p1, mun))).toHaveLength(2);
  });

  it('asignarCiudades mueve ciudades de otra subdivisión', () => {
    const a = crear({ nombre: 'A', tipoSubdivision: 'distrito', ciudades: [c[0]] });
    const b = crear({ nombre: 'B', tipoSubdivision: 'distrito', ciudades: [c[1]] });
    aplicar(e, asignarCiudades(e, 'p1', { id: b, ciudades: [c[0]] }));
    expect(subdivisionPorId(p1, a).ciudades).toEqual([]);
    expect(subdivisionPorId(p1, b).ciudades).toEqual(expect.arrayContaining([c[0], c[1]]));
    expect(codigo(() => asignarCiudades(e, 'p1', { id: 'sub99', ciudades: [c[0]] }))).toBe('SUBDIVISION_DESCONOCIDA');
  });

  it('subdivisionResolutora devuelve la más chica que cubre todas las ciudades, o null', () => {
    const dep = crear({ nombre: 'D', tipoSubdivision: 'departamento' });
    const mun = crear({ nombre: 'M', tipoSubdivision: 'municipio', padreId: dep, ciudades: [c[2]] });
    const f1 = crear({ nombre: 'F1', tipoSubdivision: 'freguesia', padreId: mun, ciudades: [c[0]] });
    crear({ nombre: 'F2', tipoSubdivision: 'freguesia', padreId: dep, ciudades: [c[1]] });
    const sub = (ciudades) => subdivisionResolutora(p1, ciudades)?.id ?? null;
    expect(sub([c[0]])).toBe(f1);                // una sola ciudad: su Freguesia
    expect(sub([c[0], c[2]])).toBe(mun);         // dos ramas dentro del Municipio
    expect(sub([c[0], c[1]])).toBe(dep);         // ramas distintas: el ancestro común
    expect(sub([c[0], c[3]])).toBeNull();        // c[3] no esta en ninguna: el País
    expect(sub([])).toBeNull();
  });

  it('renombrar cambia el nombre, no pide recursos y valida el largo y el dueño', () => {
    const id = crear({ nombre: 'Vieja', tipoSubdivision: 'distrito' });
    const oro = p1.recursos.gold;
    const evs = renombrarSubdivision(e, 'p1', { id, nombre: '  Nueva  ' });
    expect(evs.map(x => x.tipo)).toEqual(['SubdivisionRenombrada']);
    aplicar(e, evs);
    expect(subdivisionPorId(p1, id).nombre).toBe('Nueva');
    expect(p1.recursos.gold).toBe(oro);
    expect(codigo(() => renombrarSubdivision(e, 'p1', { id, nombre: 'a'.repeat(31) }))).toBe('NOMBRE_INVALIDO');
    expect(codigo(() => renombrarSubdivision(e, 'p1', { id, nombre: '   ' }))).toBe('NOMBRE_INVALIDO');
    expect(codigo(() => renombrarSubdivision(e, 'p1', { id: 'sub99', nombre: 'X' }))).toBe('SUBDIVISION_DESCONOCIDA');
    expect(codigo(() => renombrarSubdivision(e, 'p2', { id, nombre: 'X' }))).toBe('NO_ES_FEDERAL');
  });

  it('quitar un Municipio con una Freguesia y una ciudad: todo pasa al padre, nada queda huérfano', () => {
    const dep = crear({ nombre: 'D', tipoSubdivision: 'departamento' });
    const mun = crear({ nombre: 'M', tipoSubdivision: 'municipio', padreId: dep, ciudades: [c[0]] });
    const fre = crear({ nombre: 'F', tipoSubdivision: 'freguesia', padreId: mun, ciudades: [c[1]] });
    aplicar(e, quitarSubdivision(e, 'p1', { id: mun }));
    expect(subdivisionPorId(p1, mun)).toBeNull();
    expect(padreIdDe(subdivisionPorId(p1, fre))).toBe(dep);
    expect(subdivisionPorId(p1, dep).ciudades).toEqual([c[0]]);
    expect(territorioDe(p1, subdivisionPorId(p1, dep))).toHaveLength(2);
    for (const s of subdivisionesDe(p1)) {
      expect(s.padreId === null || subdivisionPorId(p1, s.padreId) !== null).toBe(true);
    }
  });

  it('quitar una subdivisión sin padre deja sus hijas sin padre y sus ciudades bajo el País', () => {
    const mun = crear({ nombre: 'M', tipoSubdivision: 'municipio', ciudades: [c[0]] });
    const fre = crear({ nombre: 'F', tipoSubdivision: 'freguesia', padreId: mun, ciudades: [c[1]] });
    aplicar(e, quitarSubdivision(e, 'p1', { id: mun }));
    expect(padreIdDe(subdivisionPorId(p1, fre))).toBeNull();
    expect(subdivisionDeCiudad(p1, c[0].x, c[0].y)).toBeNull();
    // y la ciudad suelta sigue administrandose sola
    const evs = administrarSubdivisiones(e, 'p1');
    expect(evs.some(x => x.datos?.x === c[0].x && x.tipo === 'EdificioConstruido')).toBe(true);
  });

  it('una subdivisión vieja sin tipo se lee como Municipio sin padre y se sigue administrando', () => {
    p1.subdivisiones = [{ id: 'sub1', nombre: 'Vieja', prioridad: 'comida', ciudades: [c[0]] }];
    const sub = subdivisionPorId(p1, 'sub1');
    expect(tipoDe(sub)).toBe('municipio');
    expect(nivelDe(sub)).toBe(5);
    expect(padreIdDe(sub)).toBeNull();
    const evs = administrarSubdivisiones(e, 'p1');
    expect(evs.some(x => x.tipo === 'EdificioConstruido' && x.datos.x === c[0].x && x.datos.edificio === 'granary')).toBe(true);
  });

  it('la prioridad se hereda del padre y por defecto es economía', () => {
    const dep = crear({ nombre: 'D', tipoSubdivision: 'departamento', prioridad: 'defensa' });
    const mun = crear({ nombre: 'M', tipoSubdivision: 'municipio', padreId: dep });
    const otra = crear({ nombre: 'O', tipoSubdivision: 'municipio', prioridad: 'ciencia' });
    const solo = crear({ nombre: 'S', tipoSubdivision: 'distrito' });
    expect(prioridadEfectiva(p1, subdivisionPorId(p1, mun))).toBe('defensa');
    expect(prioridadEfectiva(p1, subdivisionPorId(p1, otra))).toBe('ciencia');
    expect(prioridadEfectiva(p1, subdivisionPorId(p1, solo))).toBe('economia');
    expect(prioridadEfectiva(p1, null)).toBe('economia');
  });

  it('administrar usa la prioridad efectiva de la subdivisión más chica de cada ciudad', () => {
    const dep = crear({ nombre: 'D', tipoSubdivision: 'departamento', prioridad: 'ciencia' });
    crear({ nombre: 'F', tipoSubdivision: 'freguesia', padreId: dep, ciudades: [c[0]] });
    const evs = administrarSubdivisiones(e, 'p1');
    expect(evs.some(x => x.tipo === 'EdificioConstruido' && x.datos.x === c[0].x && x.datos.edificio === 'library')).toBe(true);
  });

  it('los accesores devuelven copias: mutar el resultado no toca el estado', () => {
    const id = crear({ nombre: 'A', tipoSubdivision: 'distrito', ciudades: [c[0]] });
    subdivisionesDe(p1)[0].ciudades.push({ x: 99, y: 99 });
    subdivisionPorId(p1, id).nombre = 'roto';
    expect(subdivisionPorId(p1, id).ciudades).toEqual([c[0]]);
    expect(subdivisionPorId(p1, id).nombre).toBe('A');
  });

  it('crear sin tipo cae en Municipio (compatibilidad con el panel viejo)', () => {
    const id = crear({ nombre: 'Vieja', prioridad: 'comida', ciudades: [c[0]] });
    expect(tipoDe(subdivisionPorId(p1, id))).toBe('municipio');
  });

  it('en unitario no se puede crear ni renombrar', () => {
    const id = crear({ nombre: 'A', tipoSubdivision: 'distrito' });
    aplicar(e, cambiarFormaEstado(e, 'p1', { formaEstado: 'unitario' }));
    expect(codigo(() => crearSubdivision(e, 'p1', { nombre: 'B', tipoSubdivision: 'distrito' }))).toBe('NO_ES_FEDERAL');
    expect(codigo(() => renombrarSubdivision(e, 'p1', { id, nombre: 'X' }))).toBe('NO_ES_FEDERAL');
  });
});
