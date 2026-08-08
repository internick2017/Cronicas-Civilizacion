import { describe, it, expect } from 'vitest';
import { RECURSOS, RECURSOS_INICIALES, UNIDADES, EDIFICIOS, BONO_TERRENO_PRODUCCION, bonoDefensa, defensaCiudad } from '../../src/domain/mapa/constantes.js';

describe('constantes', () => {
  it('recursos iniciales tienen exactamente las 6 claves', () => {
    expect(Object.keys(RECURSOS_INICIALES).sort()).toEqual([...RECURSOS].sort());
  });
  it('todas las unidades tienen stats completos', () => {
    for (const u of Object.values(UNIDADES)) {
      expect(u.ataque).toBeGreaterThan(0);
      expect(u.defensa).toBeGreaterThan(0);
      expect(u.salud).toBeGreaterThan(0);
      expect(u.movimiento).toBeGreaterThan(0);
      expect(typeof u.requiereBarracks).toBe('boolean');
    }
  });
  it('cavalry y catapult requieren barracks; warrior no', () => {
    expect(UNIDADES.cavalry.requiereBarracks).toBe(true);
    expect(UNIDADES.catapult.requiereBarracks).toBe(true);
    expect(UNIDADES.warrior.requiereBarracks).toBe(false);
  });
  it('costos solo usan claves de recursos validas', () => {
    const todas = [...Object.values(UNIDADES).map(u => u.costo), ...Object.values(EDIFICIOS).map(e => e.costo)];
    for (const costo of todas) {
      for (const k of Object.keys(costo)) expect(RECURSOS).toContain(k);
    }
  });
  it('bonoDefensa devuelve 1.0 para terreno sin bono', () => {
    expect(bonoDefensa('plains')).toBe(1.0);
    expect(bonoDefensa('mountains')).toBe(1.25);
  });
  it('defensaCiudad crece con el nivel', () => {
    expect(defensaCiudad(1)).toBe(10);
    expect(defensaCiudad(3)).toBe(14);
  });
  it('bonos de produccion solo usan recursos validos', () => {
    for (const bonos of Object.values(BONO_TERRENO_PRODUCCION)) {
      for (const k of Object.keys(bonos)) expect(RECURSOS).toContain(k);
    }
  });
});
