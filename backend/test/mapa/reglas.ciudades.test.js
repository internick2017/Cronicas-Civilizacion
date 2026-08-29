import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado, tileEn, jugadorPorId } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { fundarCiudad, construir } from '../../src/domain/mapa/reglas/ciudades.js';
import { reclutar } from '../../src/domain/mapa/reglas/militar.js';
import { moverEjercito } from '../../src/domain/mapa/reglas/movimiento.js';

let e, tierraLibre, tierraPropia;
beforeEach(() => {
  e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  jugadorPorId(e, 'p1').recursos = { food: 999, gold: 999, wood: 999, stone: 999, science: 999, culture: 999 };
  tierraLibre = e.mapa.find(t => t.terreno !== 'water' && !t.ciudad && !t.dueno);

  // El territorio se reclama pisandolo con un ejercito (ver
  // reglas/movimiento.js), no por estar cerca de una ciudad: fundar ahora
  // exige territorio propio, asi que hay que reclamar una casilla vecina a
  // la capital moviendo un ejercito antes de poder probar "fundar feliz".
  const capitalP1 = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
  const vecino = { x: capitalP1.x - 1, y: capitalP1.y };
  tileEn(e, capitalP1.x, capitalP1.y).terreno = 'plains';
  tileEn(e, vecino.x, vecino.y).terreno = 'plains';
  aplicar(e, reclutar(e, 'p1', { x: capitalP1.x, y: capitalP1.y, unidad: 'warrior' }));
  aplicar(e, moverEjercito(e, 'p1', { desde: { x: capitalP1.x, y: capitalP1.y }, hasta: vecino }));

  tierraPropia = tileEn(e, vecino.x, vecino.y);
});

describe('fundarCiudad', () => {
  it('fundar feliz emite gasto + ciudad + descubrimiento, en orden, con el costo correcto', () => {
    const evs = fundarCiudad(e, 'p1', { x: tierraPropia.x, y: tierraPropia.y, nombre: 'Cusco' });
    expect(evs.map(ev => ev.tipo)).toEqual(['RecursosGastados', 'CiudadFundada', 'TerritorioDescubierto']);
    expect(evs[0].datos.costo).toEqual({ food: 50, wood: 30, stone: 20 });
    aplicar(e, evs);
    expect(tileEn(e, tierraPropia.x, tierraPropia.y).ciudad.nombre).toBe('Cusco');
  });

  it('fundar fuera de tu territorio da TERRITORIO_AJENO', () => {
    expect(() => fundarCiudad(e, 'p1', { x: tierraLibre.x, y: tierraLibre.y, nombre: 'X' }))
      .toThrowError(expect.objectContaining({ codigo: 'TERRITORIO_AJENO' }));
  });

  it('fundar en agua da POSICION_INVALIDA', () => {
    const agua = e.mapa.find(t => t.terreno === 'water');
    expect(() => fundarCiudad(e, 'p1', { x: agua.x, y: agua.y, nombre: 'X' }))
      .toThrowError(expect.objectContaining({ codigo: 'POSICION_INVALIDA' }));
  });

  it('fundar fuera del mapa da POSICION_INVALIDA, no TypeError (regresion A5)', () => {
    expect(() => fundarCiudad(e, 'p1', { x: 999, y: 999, nombre: 'X' }))
      .toThrowError(expect.objectContaining({ codigo: 'POSICION_INVALIDA' }));
  });

  it('fundar sobre ciudad existente da CASILLA_OCUPADA', () => {
    const propia = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
    expect(() => fundarCiudad(e, 'p1', { x: propia.x, y: propia.y, nombre: 'X' }))
      .toThrowError(expect.objectContaining({ codigo: 'CASILLA_OCUPADA' }));
  });

  it('fundar sin recursos suficientes da RECURSOS_INSUFICIENTES', () => {
    jugadorPorId(e, 'p1').recursos = { food: 0, gold: 0, wood: 0, stone: 0, science: 0, culture: 0 };
    expect(() => fundarCiudad(e, 'p1', { x: tierraPropia.x, y: tierraPropia.y, nombre: 'X' }))
      .toThrowError(expect.objectContaining({ codigo: 'RECURSOS_INSUFICIENTES' }));
  });

  it('fundar fuera de turno da NO_ES_TU_TURNO', () => {
    expect(() => fundarCiudad(e, 'p2', { x: tierraLibre.x, y: tierraLibre.y, nombre: 'X' }))
      .toThrowError(expect.objectContaining({ codigo: 'NO_ES_TU_TURNO' }));
  });
});

describe('construir', () => {
  it('construir feliz (granary) emite gasto + edificio construido', () => {
    const propia = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
    const evs = construir(e, 'p1', { x: propia.x, y: propia.y, edificio: 'granary' });
    expect(evs.map(ev => ev.tipo)).toEqual(['RecursosGastados', 'EdificioConstruido']);
    expect(evs[0].datos.costo).toEqual({ food: 30, wood: 20 });
    aplicar(e, evs);
    expect(tileEn(e, propia.x, propia.y).ciudad.edificios).toContain('granary');
  });

  it('construir edificio repetido da EDIFICIO_DUPLICADO', () => {
    const propia = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
    aplicar(e, construir(e, 'p1', { x: propia.x, y: propia.y, edificio: 'granary' }));
    expect(() => construir(e, 'p1', { x: propia.x, y: propia.y, edificio: 'granary' }))
      .toThrowError(expect.objectContaining({ codigo: 'EDIFICIO_DUPLICADO' }));
  });

  it('construir edificio inventado da EDIFICIO_DESCONOCIDO', () => {
    const propia = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
    expect(() => construir(e, 'p1', { x: propia.x, y: propia.y, edificio: 'castillo' }))
      .toThrowError(expect.objectContaining({ codigo: 'EDIFICIO_DESCONOCIDO' }));
  });

  it('construir en ciudad ajena da CIUDAD_AJENA', () => {
    const ajena = e.mapa.find(t => t.ciudad && t.dueno === 'p2');
    expect(() => construir(e, 'p1', { x: ajena.x, y: ajena.y, edificio: 'granary' }))
      .toThrowError(expect.objectContaining({ codigo: 'CIUDAD_AJENA' }));
  });

  it('construir en tile sin ciudad da CIUDAD_AJENA', () => {
    expect(() => construir(e, 'p1', { x: tierraLibre.x, y: tierraLibre.y, edificio: 'granary' }))
      .toThrowError(expect.objectContaining({ codigo: 'CIUDAD_AJENA' }));
  });

  it('construir fuera del mapa da POSICION_INVALIDA', () => {
    expect(() => construir(e, 'p1', { x: 999, y: 999, edificio: 'granary' }))
      .toThrowError(expect.objectContaining({ codigo: 'POSICION_INVALIDA' }));
  });

  it('construir sin recursos suficientes da RECURSOS_INSUFICIENTES', () => {
    const propia = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
    jugadorPorId(e, 'p1').recursos = { food: 0, gold: 0, wood: 0, stone: 0, science: 0, culture: 0 };
    expect(() => construir(e, 'p1', { x: propia.x, y: propia.y, edificio: 'granary' }))
      .toThrowError(expect.objectContaining({ codigo: 'RECURSOS_INSUFICIENTES' }));
  });
});
