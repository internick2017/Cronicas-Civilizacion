import { describe, it, expect } from 'vitest';
import { crearRuido } from '../../src/domain/mapa/ruido.js';

describe('crearRuido', () => {
  it('misma semilla => mismos valores', () => {
    const a = crearRuido('s1', 20);
    const b = crearRuido('s1', 20);
    for (let y = 0; y < 20; y++)
      for (let x = 0; x < 20; x++) expect(a(x, y)).toBe(b(x, y));
  });

  it('semilla distinta => campo distinto', () => {
    const a = crearRuido('a', 20);
    const b = crearRuido('b', 20);
    let diferencias = 0;
    for (let y = 0; y < 20; y++)
      for (let x = 0; x < 20; x++) if (a(x, y) !== b(x, y)) diferencias++;
    expect(diferencias).toBeGreaterThan(200);
  });

  it('todos los valores caen en [0, 1]', () => {
    const r = crearRuido('s', 30);
    for (let y = 0; y < 30; y++)
      for (let x = 0; x < 30; x++) {
        expect(r(x, y)).toBeGreaterThanOrEqual(0);
        expect(r(x, y)).toBeLessThanOrEqual(1);
      }
  });

  // Esta es la propiedad que distingue el ruido de un dado por casilla: los
  // vecinos se parecen. Sin esto no hay continentes.
  it('es suave: vecinos difieren poco', () => {
    const r = crearRuido('s', 40, 4);
    let maxSalto = 0;
    for (let y = 0; y < 39; y++)
      for (let x = 0; x < 39; x++) {
        maxSalto = Math.max(maxSalto, Math.abs(r(x, y) - r(x + 1, y)));
        maxSalto = Math.max(maxSalto, Math.abs(r(x, y) - r(x, y + 1)));
      }
    expect(maxSalto).toBeLessThan(0.4);
  });

  it('no es constante: el campo tiene relieve', () => {
    const r = crearRuido('s', 30);
    const valores = [];
    for (let y = 0; y < 30; y++) for (let x = 0; x < 30; x++) valores.push(r(x, y));
    expect(Math.max(...valores) - Math.min(...valores)).toBeGreaterThan(0.4);
  });
});
