import { describe, it, expect } from 'vitest';
import { crearRng, tirada, entero } from '../../src/domain/mapa/rng.js';
import { ReglaError } from '../../src/domain/mapa/errores.js';

describe('rng sembrado', () => {
  it('misma semilla produce la misma secuencia', () => {
    const a = crearRng('semilla-1');
    const b = crearRng('semilla-1');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it('semillas distintas producen secuencias distintas', () => {
    expect(crearRng('x')()).not.toBe(crearRng('y')());
  });
  it('tirada queda en [0.8, 1.2] y entero en [0, max)', () => {
    const r = crearRng('s');
    for (let i = 0; i < 200; i++) {
      const t = tirada(r);
      expect(t).toBeGreaterThanOrEqual(0.8);
      expect(t).toBeLessThanOrEqual(1.2);
      const e = entero(r, 20);
      expect(e).toBeGreaterThanOrEqual(0);
      expect(e).toBeLessThan(20);
      expect(Number.isInteger(e)).toBe(true);
    }
  });
});

describe('ReglaError', () => {
  it('expone codigo y mensaje', () => {
    const e = new ReglaError('NO_ES_TU_TURNO', 'No es tu turno');
    expect(e.codigo).toBe('NO_ES_TU_TURNO');
    expect(e.message).toBe('No es tu turno');
    expect(e).toBeInstanceOf(Error);
  });
});
