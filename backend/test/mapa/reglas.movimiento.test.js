import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado, tileEn, jugadorPorId } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { reclutar } from '../../src/domain/mapa/reglas/militar.js';
import { moverEjercito } from '../../src/domain/mapa/reglas/movimiento.js';
import { evento } from '../../src/domain/mapa/reglas/comun.js';

// La capital de p1 con semilla 's1' ya no cae en una coordenada fija: desde
// la task de masa de tierra principal, posicionesIniciales elige dentro de
// la masa mas grande, y esa eleccion depende del propio algoritmo. En vez de
// depender de una coordenada fija, se lee la capital real y se fuerza el
// terreno de sus vecinos ortogonales a 'plains' (transitable, sin dueño):
// asi los tests siguen probando las mismas reglas de movimiento sin asumir
// la distribucion vieja de terreno.
let e, cx, cy, ax, ay, bx, by;
beforeEach(() => {
  e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  jugadorPorId(e, 'p1').recursos = { food: 999, gold: 999, wood: 999, stone: 999, science: 999, culture: 999 };

  const capitalP1 = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
  cx = capitalP1.x;
  cy = capitalP1.y;
  // Vecino adyacente hacia donde se mueve en los tests ("hasta").
  ax = cx - 1;
  ay = cy;
  // Vecino a 2 de distancia en linea recta desde la capital, usado para el
  // segundo paso de movimiento y para el caso "no adyacente". Se asume que
  // la capital de p1 con semilla 's1' no cae a menos de 2 casillas del
  // borde izquierdo del mapa: si esa semilla o el generador cambian y el
  // supuesto deja de cumplirse, esta asercion falla con un mensaje claro en
  // vez de con "expected -1 to be 0" o un TypeError raro mas abajo.
  if (cx < 2) throw new Error(`supuesto roto: la capital de p1 quedo en x=${cx}, se necesita x>=2 para el vecino a distancia 2`);
  bx = cx - 2;
  by = cy;

  // El test de "diagonal" usa (ax, ay-1) como destino invalido: mismo
  // supuesto de margen respecto del borde superior.
  if (cy < 1) throw new Error(`supuesto roto: la capital de p1 quedo en y=${cy}, se necesita y>=1 para el destino diagonal del test`);

  tileEn(e, cx, cy).terreno = 'plains';
  tileEn(e, ax, ay).terreno = 'plains';
  tileEn(e, bx, by).terreno = 'plains';

  aplicar(e, reclutar(e, 'p1', { x: cx, y: cy, tipo: 'warrior' }));
});

describe('moverEjercito', () => {
  it('feliz a tile neutral adyacente: mueve, descubre y reclama territorio', () => {
    const evs = moverEjercito(e, 'p1', { desde: { x: cx, y: cy }, hasta: { x: ax, y: ay } });
    expect(evs.map(ev => ev.tipo)).toEqual(['EjercitoMovido', 'TerritorioDescubierto', 'TerritorioReclamado']);
    expect(evs[0].datos).toEqual({ desde: { x: cx, y: cy }, hasta: { x: ax, y: ay } });
    expect(evs[2].datos).toEqual({ x: ax, y: ay });

    aplicar(e, evs);

    expect(tileEn(e, cx, cy).ejercito).toBeNull();
    const destino = tileEn(e, ax, ay);
    expect(destino.ejercito).toMatchObject({ tipo: 'warrior', dueno: 'p1', movimientoRestante: 1 });
    expect(destino.dueno).toBe('p1');
    expect(destino.descubiertoPor).toContain('p1');
  });

  it('a un tile ya con dueño propio (la propia capital) no emite TerritorioReclamado', () => {
    aplicar(e, moverEjercito(e, 'p1', { desde: { x: cx, y: cy }, hasta: { x: ax, y: ay } }));

    const evs = moverEjercito(e, 'p1', { desde: { x: ax, y: ay }, hasta: { x: cx, y: cy } });

    expect(evs.map(ev => ev.tipo)).toEqual(['EjercitoMovido', 'TerritorioDescubierto']);
  });

  it('a 2 de distancia da DESTINO_NO_ADYACENTE', () => {
    expect(() => moverEjercito(e, 'p1', { desde: { x: cx, y: cy }, hasta: { x: bx, y: by } }))
      .toThrowError(expect.objectContaining({ codigo: 'DESTINO_NO_ADYACENTE' }));
  });

  it('en diagonal (no ortogonal) da DESTINO_NO_ADYACENTE aunque la distancia parezca corta', () => {
    expect(() => moverEjercito(e, 'p1', { desde: { x: cx, y: cy }, hasta: { x: ax, y: ay - 1 } }))
      .toThrowError(expect.objectContaining({ codigo: 'DESTINO_NO_ADYACENTE' }));
  });

  it('dos movimientos seguidos con warrior (movimiento 2) son válidos y el tercero da UNIDAD_SIN_MOVIMIENTO', () => {
    aplicar(e, moverEjercito(e, 'p1', { desde: { x: cx, y: cy }, hasta: { x: ax, y: ay } }));
    expect(tileEn(e, ax, ay).ejercito.movimientoRestante).toBe(1);

    aplicar(e, moverEjercito(e, 'p1', { desde: { x: ax, y: ay }, hasta: { x: bx, y: by } }));
    expect(tileEn(e, bx, by).ejercito.movimientoRestante).toBe(0);

    expect(() => moverEjercito(e, 'p1', { desde: { x: bx, y: by }, hasta: { x: ax, y: ay } }))
      .toThrowError(expect.objectContaining({ codigo: 'UNIDAD_SIN_MOVIMIENTO' }));
  });

  it('a un tile de agua da TERRENO_INTRANSITABLE', () => {
    // Forzamos el terreno del destino a agua en vez de depender de que el
    // generador de mapas produzca agua en una coordenada fija con esta semilla.
    tileEn(e, ax, ay).terreno = 'water';

    expect(() => moverEjercito(e, 'p1', { desde: { x: cx, y: cy }, hasta: { x: ax, y: ay } }))
      .toThrowError(expect.objectContaining({ codigo: 'TERRENO_INTRANSITABLE' }));
  });

  it('a un tile con dueño enemigo da OBJETIVO_INVALIDO', () => {
    aplicar(e, [evento('TerritorioReclamado', e, 'p2', { x: ax, y: ay })]);

    expect(() => moverEjercito(e, 'p1', { desde: { x: cx, y: cy }, hasta: { x: ax, y: ay } }))
      .toThrowError(expect.objectContaining({ codigo: 'OBJETIVO_INVALIDO' }));
  });

  it('a un tile con ejército enemigo da OBJETIVO_INVALIDO', () => {
    aplicar(e, [evento('UnidadReclutada', e, 'p2', { x: ax, y: ay, tipo: 'warrior' })]);

    expect(() => moverEjercito(e, 'p1', { desde: { x: cx, y: cy }, hasta: { x: ax, y: ay } }))
      .toThrowError(expect.objectContaining({ codigo: 'OBJETIVO_INVALIDO' }));
  });

  it('a un tile con ejército propio da CASILLA_OCUPADA', () => {
    aplicar(e, [evento('UnidadReclutada', e, 'p1', { x: ax, y: ay, tipo: 'warrior' })]);

    expect(() => moverEjercito(e, 'p1', { desde: { x: cx, y: cy }, hasta: { x: ax, y: ay } }))
      .toThrowError(expect.objectContaining({ codigo: 'CASILLA_OCUPADA' }));
  });

  it('desde un tile sin ejército propio da SIN_EJERCITO', () => {
    expect(() => moverEjercito(e, 'p1', { desde: { x: bx, y: by }, hasta: { x: ax, y: ay } }))
      .toThrowError(expect.objectContaining({ codigo: 'SIN_EJERCITO' }));
  });

  it('desde un tile con ejército ajeno da SIN_EJERCITO', () => {
    aplicar(e, [evento('UnidadReclutada', e, 'p2', { x: ax, y: ay, tipo: 'warrior' })]);

    expect(() => moverEjercito(e, 'p1', { desde: { x: ax, y: ay }, hasta: { x: bx, y: by } }))
      .toThrowError(expect.objectContaining({ codigo: 'SIN_EJERCITO' }));
  });

  it('fuera de turno da NO_ES_TU_TURNO', () => {
    expect(() => moverEjercito(e, 'p2', { desde: { x: cx, y: cy }, hasta: { x: ax, y: ay } }))
      .toThrowError(expect.objectContaining({ codigo: 'NO_ES_TU_TURNO' }));
  });

  it('destino fuera del mapa da POSICION_INVALIDA', () => {
    expect(() => moverEjercito(e, 'p1', { desde: { x: cx, y: cy }, hasta: { x: 999, y: 999 } }))
      .toThrowError(expect.objectContaining({ codigo: 'POSICION_INVALIDA' }));
  });

  it('origen fuera del mapa da POSICION_INVALIDA', () => {
    expect(() => moverEjercito(e, 'p1', { desde: { x: -1, y: -1 }, hasta: { x: cx, y: cy } }))
      .toThrowError(expect.objectContaining({ codigo: 'POSICION_INVALIDA' }));
  });
});
