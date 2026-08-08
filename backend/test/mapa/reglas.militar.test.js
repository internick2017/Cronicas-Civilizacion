import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado, tileEn, jugadorPorId } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { construir } from '../../src/domain/mapa/reglas/ciudades.js';
import { reclutar } from '../../src/domain/mapa/reglas/militar.js';

let e, capitalP1;
beforeEach(() => {
  e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  jugadorPorId(e, 'p1').recursos = { food: 999, gold: 999, wood: 999, stone: 999, science: 999, culture: 999 };
  capitalP1 = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
});

describe('reclutar', () => {
  it('feliz con warrior emite gasto + unidad reclutada, con el costo correcto', () => {
    const evs = reclutar(e, 'p1', { x: capitalP1.x, y: capitalP1.y, tipo: 'warrior' });
    expect(evs.map(ev => ev.tipo)).toEqual(['RecursosGastados', 'UnidadReclutada']);
    expect(evs[0].datos.costo).toEqual({ food: 20, gold: 30, wood: 10 });
    aplicar(e, evs);
    const t = tileEn(e, capitalP1.x, capitalP1.y);
    expect(t.ejercito).toMatchObject({ tipo: 'warrior', dueno: 'p1', salud: 100, movimientoRestante: 2 });
  });

  it('cavalry sin barracks da REQUIERE_BARRACKS', () => {
    expect(() => reclutar(e, 'p1', { x: capitalP1.x, y: capitalP1.y, tipo: 'cavalry' }))
      .toThrowError(expect.objectContaining({ codigo: 'REQUIERE_BARRACKS' }));
  });

  it('cavalry con barracks construido es feliz', () => {
    aplicar(e, construir(e, 'p1', { x: capitalP1.x, y: capitalP1.y, edificio: 'barracks' }));
    const evs = reclutar(e, 'p1', { x: capitalP1.x, y: capitalP1.y, tipo: 'cavalry' });
    expect(evs.map(ev => ev.tipo)).toEqual(['RecursosGastados', 'UnidadReclutada']);
    aplicar(e, evs);
    expect(tileEn(e, capitalP1.x, capitalP1.y).ejercito.tipo).toBe('cavalry');
  });

  it('reclutar en tile sin ciudad da CIUDAD_AJENA', () => {
    const tierraLibre = e.mapa.find(t => t.terreno !== 'water' && !t.ciudad && !t.dueno);
    expect(() => reclutar(e, 'p1', { x: tierraLibre.x, y: tierraLibre.y, tipo: 'warrior' }))
      .toThrowError(expect.objectContaining({ codigo: 'CIUDAD_AJENA' }));
  });

  it('reclutar en ciudad ajena da CIUDAD_AJENA', () => {
    const capitalP2 = e.mapa.find(t => t.ciudad && t.dueno === 'p2');
    expect(() => reclutar(e, 'p1', { x: capitalP2.x, y: capitalP2.y, tipo: 'warrior' }))
      .toThrowError(expect.objectContaining({ codigo: 'CIUDAD_AJENA' }));
  });

  it('reclutar con ejercito ya presente da CASILLA_OCUPADA', () => {
    aplicar(e, reclutar(e, 'p1', { x: capitalP1.x, y: capitalP1.y, tipo: 'warrior' }));
    expect(() => reclutar(e, 'p1', { x: capitalP1.x, y: capitalP1.y, tipo: 'warrior' }))
      .toThrowError(expect.objectContaining({ codigo: 'CASILLA_OCUPADA' }));
  });

  it('tipo desconocido da UNIDAD_DESCONOCIDA', () => {
    expect(() => reclutar(e, 'p1', { x: capitalP1.x, y: capitalP1.y, tipo: 'dragon' }))
      .toThrowError(expect.objectContaining({ codigo: 'UNIDAD_DESCONOCIDA' }));
  });

  it('reclutar sin recursos suficientes da RECURSOS_INSUFICIENTES', () => {
    jugadorPorId(e, 'p1').recursos = { food: 0, gold: 0, wood: 0, stone: 0, science: 0, culture: 0 };
    expect(() => reclutar(e, 'p1', { x: capitalP1.x, y: capitalP1.y, tipo: 'warrior' }))
      .toThrowError(expect.objectContaining({ codigo: 'RECURSOS_INSUFICIENTES' }));
  });

  it('reclutar fuera de turno da NO_ES_TU_TURNO', () => {
    expect(() => reclutar(e, 'p2', { x: capitalP1.x, y: capitalP1.y, tipo: 'warrior' }))
      .toThrowError(expect.objectContaining({ codigo: 'NO_ES_TU_TURNO' }));
  });

  it('reclutar fuera del mapa da POSICION_INVALIDA', () => {
    expect(() => reclutar(e, 'p1', { x: 999, y: 999, tipo: 'warrior' }))
      .toThrowError(expect.objectContaining({ codigo: 'POSICION_INVALIDA' }));
  });
});
