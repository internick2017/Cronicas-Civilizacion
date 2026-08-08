import { describe, it, expect } from 'vitest';
import { generarMapa, posicionesIniciales } from '../../src/domain/mapa/generarMapa.js';
import { crearRng } from '../../src/domain/mapa/rng.js';
import { ReglaError } from '../../src/domain/mapa/errores.js';

describe('generarMapa', () => {
  it('misma semilla => mismo mapa', () => {
    expect(generarMapa('s1', 20)).toEqual(generarMapa('s1', 20));
  });
  it('semilla distinta => mapa distinto', () => {
    expect(JSON.stringify(generarMapa('a', 20))).not.toBe(JSON.stringify(generarMapa('b', 20)));
  });
  it('tiene tamano*tamano tiles con indice y*t+x correcto', () => {
    const m = generarMapa('s', 10);
    expect(m).toHaveLength(100);
    expect(m[3 * 10 + 7]).toMatchObject({ x: 7, y: 3 });
  });
  it('mayoria de tierra (menos de 30% agua)', () => {
    const m = generarMapa('s', 20);
    const agua = m.filter(t => t.terreno === 'water').length;
    expect(agua / m.length).toBeLessThan(0.3);
  });
  it('tiles nacen sin dueno, sin ciudad, sin ejercito, sin descubrir', () => {
    for (const t of generarMapa('s', 10)) {
      expect(t.dueno).toBeNull();
      expect(t.ciudad).toBeNull();
      expect(t.ejercito).toBeNull();
      expect(t.descubiertoPor).toEqual([]);
    }
  });
});

describe('posicionesIniciales', () => {
  it('devuelve la cantidad pedida, en tierra, separadas', () => {
    const m = generarMapa('s', 20);
    const pos = posicionesIniciales(m, 20, 4, crearRng('pos'));
    expect(pos).toHaveLength(4);
    for (const p of pos) expect(m[p.y * 20 + p.x].terreno).not.toBe('water');
    for (let i = 0; i < pos.length; i++)
      for (let j = i + 1; j < pos.length; j++)
        expect(Math.abs(pos[i].x - pos[j].x) + Math.abs(pos[i].y - pos[j].y)).toBeGreaterThanOrEqual(5);
  });
  it('lanza MAPA_SIN_POSICIONES si es imposible', () => {
    const todoAgua = generarMapa('s', 8).map(t => ({ ...t, terreno: 'water' }));
    expect(() => posicionesIniciales(todoAgua, 8, 2, crearRng('x')))
      .toThrowError(expect.objectContaining({ codigo: 'MAPA_SIN_POSICIONES' }));
  });
  it('nunca devuelve posiciones duplicadas, ni con mapas chicos (minDist 0)', () => {
    for (const semilla of ['a', 'b', 'c', 'd', 'e']) {
      const m = generarMapa(semilla, 3);
      const conTierra = m.filter(t => t.terreno !== 'water').length;
      if (conTierra < 3) continue; // ese mapa no puede dar 3 posiciones; probamos otro
      const pos = posicionesIniciales(m, 3, 3, crearRng(`pos-${semilla}`));
      const claves = new Set(pos.map(p => `${p.x},${p.y}`));
      expect(claves.size).toBe(pos.length);
    }
  });
});
