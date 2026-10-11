import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado, jugadorPorId, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { terminarTurno } from '../../src/domain/mapa/reglas/turnos.js';
import { cambiarFormaEstado } from '../../src/domain/mapa/reglas/gobierno.js';
import {
  crearSubdivision, quitarSubdivision, administrarSubdivisiones, PRIORIDADES,
} from '../../src/domain/mapa/reglas/subdivisiones.js';

let e, p1, capital;
const codigo = (fn) => { try { fn(); } catch (err) { return err.codigo; } return null; };
const rico = () => ({ food: 999, gold: 999, wood: 999, stone: 999, science: 999, culture: 999 });

beforeEach(() => {
  e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  p1 = jugadorPorId(e, 'p1');
  p1.recursos = rico();
  aplicar(e, cambiarFormaEstado(e, 'p1', { formaEstado: 'federal' }));
  capital = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
});

const nueva = (extra = {}) => crearSubdivision(e, 'p1', {
  nombre: 'Norte', prioridad: 'comida', ciudades: [{ x: capital.x, y: capital.y }], ...extra,
});

describe('crearSubdivision / quitarSubdivision', () => {
  it('crea una subdivisión federal con id determinista', () => {
    const evs = nueva();
    expect(evs.map(x => x.tipo)).toEqual(['SubdivisionCreada']);
    aplicar(e, evs);
    expect(p1.subdivisiones).toEqual([
      { id: 'sub1', nombre: 'Norte', prioridad: 'comida', ciudades: [{ x: capital.x, y: capital.y }] },
    ]);
  });

  it('rechaza ciudad ajena, prioridad inválida, ciudad ya asignada, nombre vacío y estado unitario', () => {
    const ajena = e.mapa.find(t => t.ciudad && t.dueno === 'p2');
    expect(codigo(() => nueva({ ciudades: [{ x: ajena.x, y: ajena.y }] }))).toBe('CIUDAD_AJENA');
    expect(codigo(() => nueva({ prioridad: 'magia' }))).toBe('PRIORIDAD_INVALIDA');
    expect(codigo(() => nueva({ nombre: '  ' }))).toBe('NOMBRE_INVALIDO');
    for (const prioridad of ['constructor', 'toString', '__proto__']) {
      expect(codigo(() => nueva({ prioridad }))).toBe('PRIORIDAD_INVALIDA');
    }
    expect(codigo(() => nueva({ ciudades: [null] }))).toBe('CIUDAD_INVALIDA');
    expect(codigo(() => nueva({ ciudades: [{ x: 'a', y: 1 }] }))).toBe('CIUDAD_INVALIDA');
    expect(codigo(() => nueva({ ciudades: [] }))).toBe('SIN_CIUDADES');
    aplicar(e, nueva());
    expect(codigo(() => nueva({ nombre: 'Otra' }))).toBe('CIUDAD_YA_ASIGNADA');
    aplicar(e, cambiarFormaEstado(e, 'p1', { formaEstado: 'unitario' }));
    expect(codigo(() => nueva({ nombre: 'Otra', ciudades: [{ x: ajena.x, y: ajena.y }] }))).toBe('NO_ES_FEDERAL');
  });

  it('quitar libera las ciudades', () => {
    aplicar(e, nueva());
    aplicar(e, quitarSubdivision(e, 'p1', { id: 'sub1' }));
    expect(p1.subdivisiones).toEqual([]);
    expect(codigo(() => quitarSubdivision(e, 'p1', { id: 'sub1' }))).toBe('SUBDIVISION_DESCONOCIDA');
  });
});

describe('administrarSubdivisiones', () => {
  it('federal: la subdivisión construye el edificio de su prioridad sola al terminar el turno', () => {
    aplicar(e, nueva({ prioridad: 'comida' }));
    const evs = terminarTurno(e, 'p1');
    expect(evs.some(x => x.tipo === 'EdificioConstruido' && x.datos.edificio === 'granary')).toBe(true);
    aplicar(e, evs);
    expect(tileEn(e, capital.x, capital.y).ciudad.edificios).toContain('granary');
  });

  it('una acción por ciudad por turno: sin edificios pendientes, mejora la ciudad', () => {
    aplicar(e, nueva({ prioridad: 'comida' }));
    tileEn(e, capital.x, capital.y).ciudad.edificios.push(...PRIORIDADES.comida);
    const evs = administrarSubdivisiones(e, 'p1');
    expect(evs.map(x => x.tipo)).toEqual(['RecursosGastados', 'CiudadMejorada']);
  });

  it('federal SIN subdivisiones: las ciudades se administran solas con prioridad economía', () => {
    expect(p1.subdivisiones ?? []).toEqual([]);
    const evs = terminarTurno(e, 'p1');
    expect(evs.some(x => x.tipo === 'EdificioConstruido' && x.datos.edificio === 'market')).toBe(true);
    aplicar(e, evs);
    expect(tileEn(e, capital.x, capital.y).ciudad.edificios).toContain('market');
  });

  it('las ciudades fuera de toda subdivisión se administran como las demás, sin duplicar la acción', () => {
    aplicar(e, nueva({ prioridad: 'comida' })); // la capital va con "comida"
    const segunda = e.mapa.find(t => t.terreno !== 'water' && !t.ciudad && !t.dueno);
    segunda.ciudad = { nombre: 'Otra', nivel: 1, poblacion: 500, edificios: [] };
    segunda.dueno = 'p1';
    const evs = administrarSubdivisiones(e, 'p1').filter(x => x.tipo === 'EdificioConstruido');
    expect(evs.filter(x => x.datos.x === capital.x && x.datos.y === capital.y).map(x => x.datos.edificio)).toEqual(['granary']);
    expect(evs.filter(x => x.datos.x === segunda.x).map(x => x.datos.edificio)).toEqual(['market']);
  });

  it('la administración automática no mejora ciudades por encima del nivel 3', () => {
    aplicar(e, nueva({ prioridad: 'comida' }));
    const ciudad = tileEn(e, capital.x, capital.y).ciudad;
    ciudad.edificios.push(...PRIORIDADES.comida);
    ciudad.nivel = 3;
    expect(administrarSubdivisiones(e, 'p1')).toEqual([]);
    ciudad.nivel = 2;
    expect(administrarSubdivisiones(e, 'p1').map(x => x.tipo)).toEqual(['RecursosGastados', 'CiudadMejorada']);
  });

  it('sin recursos no hace nada y no lanza', () => {
    aplicar(e, nueva());
    p1.recursos = { food: 0, gold: 0, wood: 0, stone: 0, science: 0, culture: 0 };
    expect(administrarSubdivisiones(e, 'p1')).toEqual([]);
  });

  it('unitario ignora las subdivisiones guardadas', () => {
    aplicar(e, nueva());
    aplicar(e, cambiarFormaEstado(e, 'p1', { formaEstado: 'unitario' }));
    expect(administrarSubdivisiones(e, 'p1')).toEqual([]);
    expect(p1.subdivisiones).toHaveLength(1);
  });

  it('sobrevive a perder el poder y a cambiar de gobierno', () => {
    aplicar(e, nueva({ prioridad: 'ciencia' }));
    p1.enPoder = false;
    p1.gobierno = 'monarquia';
    expect(administrarSubdivisiones(e, 'p1').some(x => x.tipo === 'EdificioConstruido')).toBe(true);
  });

  it('no toca el estado real: devuelve eventos sin aplicarlos', () => {
    aplicar(e, nueva());
    const antes = structuredClone(e);
    administrarSubdivisiones(e, 'p1');
    expect(e).toEqual(antes);
  });
});
