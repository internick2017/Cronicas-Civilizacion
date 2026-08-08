import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado, tileEn, jugadorPorId } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { reclutar } from '../../src/domain/mapa/reglas/militar.js';
import { moverEjercito } from '../../src/domain/mapa/reglas/movimiento.js';
import { evento } from '../../src/domain/mapa/reglas/comun.js';

// Con semilla 's1' la capital de p1 queda en (19,1), terreno forest.
// Vecinos verificados manualmente: (18,1) forest neutral, (17,1) desert neutral (adyacente a (18,1)),
// (19,0) plains neutral, (19,2) forest neutral. Ninguno es agua.
// Tile de agua conocido para esta semilla: (8,0), con vecino de tierra neutral en (9,0) hills.
let e, capitalP1;
beforeEach(() => {
  e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  jugadorPorId(e, 'p1').recursos = { food: 999, gold: 999, wood: 999, stone: 999, science: 999, culture: 999 };
  capitalP1 = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
  expect(capitalP1.x).toBe(19);
  expect(capitalP1.y).toBe(1);
  aplicar(e, reclutar(e, 'p1', { x: capitalP1.x, y: capitalP1.y, tipo: 'warrior' }));
});

describe('moverEjercito', () => {
  it('feliz a tile neutral adyacente: mueve, descubre y reclama territorio', () => {
    const evs = moverEjercito(e, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } });
    expect(evs.map(ev => ev.tipo)).toEqual(['EjercitoMovido', 'TerritorioDescubierto', 'TerritorioReclamado']);
    expect(evs[0].datos).toEqual({ desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } });
    expect(evs[2].datos).toEqual({ x: 18, y: 1 });

    aplicar(e, evs);

    expect(tileEn(e, 19, 1).ejercito).toBeNull();
    const destino = tileEn(e, 18, 1);
    expect(destino.ejercito).toMatchObject({ tipo: 'warrior', dueno: 'p1', movimientoRestante: 1 });
    expect(destino.dueno).toBe('p1');
    expect(destino.descubiertoPor).toContain('p1');
  });

  it('a un tile ya con dueño propio (la propia capital) no emite TerritorioReclamado', () => {
    aplicar(e, moverEjercito(e, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } }));

    const evs = moverEjercito(e, 'p1', { desde: { x: 18, y: 1 }, hasta: { x: 19, y: 1 } });

    expect(evs.map(ev => ev.tipo)).toEqual(['EjercitoMovido', 'TerritorioDescubierto']);
  });

  it('a 2 de distancia da DESTINO_NO_ADYACENTE', () => {
    expect(() => moverEjercito(e, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 17, y: 1 } }))
      .toThrowError(expect.objectContaining({ codigo: 'DESTINO_NO_ADYACENTE' }));
  });

  it('en diagonal (no ortogonal) da DESTINO_NO_ADYACENTE aunque la distancia parezca corta', () => {
    expect(() => moverEjercito(e, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 0 } }))
      .toThrowError(expect.objectContaining({ codigo: 'DESTINO_NO_ADYACENTE' }));
  });

  it('dos movimientos seguidos con warrior (movimiento 2) son válidos y el tercero da UNIDAD_SIN_MOVIMIENTO', () => {
    aplicar(e, moverEjercito(e, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } }));
    expect(tileEn(e, 18, 1).ejercito.movimientoRestante).toBe(1);

    aplicar(e, moverEjercito(e, 'p1', { desde: { x: 18, y: 1 }, hasta: { x: 17, y: 1 } }));
    expect(tileEn(e, 17, 1).ejercito.movimientoRestante).toBe(0);

    expect(() => moverEjercito(e, 'p1', { desde: { x: 17, y: 1 }, hasta: { x: 18, y: 1 } }))
      .toThrowError(expect.objectContaining({ codigo: 'UNIDAD_SIN_MOVIMIENTO' }));
  });

  it('a un tile de agua da TERRENO_INTRANSITABLE', () => {
    // Reubicamos el ejército a mano en (9,0) hills, vecino de agua en (8,0), para esta semilla.
    tileEn(e, 19, 1).ejercito = null;
    aplicar(e, [evento('UnidadReclutada', e, 'p1', { x: 9, y: 0, tipo: 'warrior' })]);
    expect(tileEn(e, 8, 0).terreno).toBe('water');

    expect(() => moverEjercito(e, 'p1', { desde: { x: 9, y: 0 }, hasta: { x: 8, y: 0 } }))
      .toThrowError(expect.objectContaining({ codigo: 'TERRENO_INTRANSITABLE' }));
  });

  it('a un tile con dueño enemigo da OBJETIVO_INVALIDO', () => {
    aplicar(e, [evento('TerritorioReclamado', e, 'p2', { x: 18, y: 1 })]);

    expect(() => moverEjercito(e, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } }))
      .toThrowError(expect.objectContaining({ codigo: 'OBJETIVO_INVALIDO' }));
  });

  it('a un tile con ejército enemigo da OBJETIVO_INVALIDO', () => {
    aplicar(e, [evento('UnidadReclutada', e, 'p2', { x: 18, y: 1, tipo: 'warrior' })]);

    expect(() => moverEjercito(e, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } }))
      .toThrowError(expect.objectContaining({ codigo: 'OBJETIVO_INVALIDO' }));
  });

  it('a un tile con ejército propio da CASILLA_OCUPADA', () => {
    aplicar(e, [evento('UnidadReclutada', e, 'p1', { x: 18, y: 1, tipo: 'warrior' })]);

    expect(() => moverEjercito(e, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } }))
      .toThrowError(expect.objectContaining({ codigo: 'CASILLA_OCUPADA' }));
  });

  it('desde un tile sin ejército propio da SIN_EJERCITO', () => {
    expect(() => moverEjercito(e, 'p1', { desde: { x: 17, y: 1 }, hasta: { x: 18, y: 1 } }))
      .toThrowError(expect.objectContaining({ codigo: 'SIN_EJERCITO' }));
  });

  it('desde un tile con ejército ajeno da SIN_EJERCITO', () => {
    aplicar(e, [evento('UnidadReclutada', e, 'p2', { x: 18, y: 1, tipo: 'warrior' })]);

    expect(() => moverEjercito(e, 'p1', { desde: { x: 18, y: 1 }, hasta: { x: 17, y: 1 } }))
      .toThrowError(expect.objectContaining({ codigo: 'SIN_EJERCITO' }));
  });

  it('fuera de turno da NO_ES_TU_TURNO', () => {
    expect(() => moverEjercito(e, 'p2', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } }))
      .toThrowError(expect.objectContaining({ codigo: 'NO_ES_TU_TURNO' }));
  });

  it('destino fuera del mapa da POSICION_INVALIDA', () => {
    expect(() => moverEjercito(e, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 999, y: 999 } }))
      .toThrowError(expect.objectContaining({ codigo: 'POSICION_INVALIDA' }));
  });

  it('origen fuera del mapa da POSICION_INVALIDA', () => {
    expect(() => moverEjercito(e, 'p1', { desde: { x: -1, y: -1 }, hasta: { x: 19, y: 1 } }))
      .toThrowError(expect.objectContaining({ codigo: 'POSICION_INVALIDA' }));
  });
});
