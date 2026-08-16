import { describe, it, expect } from 'vitest';
import { RECURSOS, RECURSOS_INICIALES, UNIDADES, EDIFICIOS, BONO_TERRENO_PRODUCCION, PRODUCCION_BASE_CIUDAD, bonoDefensa, defensaCiudad } from '../../src/domain/mapa/constantes.js';

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
  // Regresion del bug de la biblioteca: costaba 20 de ciencia y era la UNICA
  // fuente de ciencia del juego, asi que no se podia construir nunca.
  // El problema no es cobrar lo que se produce (el granero cobra comida y la
  // produce, y no traba nada porque toda ciudad ya da comida): el problema es
  // cobrar un recurso que solo ese mismo edificio puede darte.
  it('todo recurso que se cobra tiene alguna fuente que no sea el propio edificio', () => {
    const otrasFuentes = (tipoEdificio) => {
      const fuentes = new Set(Object.keys(PRODUCCION_BASE_CIUDAD));
      for (const bono of Object.values(BONO_TERRENO_PRODUCCION)) {
        for (const recurso of Object.keys(bono)) fuentes.add(recurso);
      }
      for (const [tipo, datos] of Object.entries(EDIFICIOS)) {
        if (tipo === tipoEdificio) continue;
        for (const recurso of Object.keys(datos.produccion ?? {})) fuentes.add(recurso);
      }
      return fuentes;
    };

    for (const [tipo, datos] of Object.entries(EDIFICIOS)) {
      const disponibles = otrasFuentes(tipo);
      for (const recurso of Object.keys(datos.costo)) {
        expect(
          disponibles.has(recurso),
          `${tipo} cobra ${recurso} y no hay ninguna otra fuente de ${recurso}: seria imposible de construir`
        ).toBe(true);
      }
    }
  });

  it('madera y piedra tienen una fuente que no depende del terreno', () => {
    const producen = (recurso) =>
      Object.values(EDIFICIOS).filter(e => (e.produccion ?? {})[recurso] > 0);
    expect(producen('wood').length).toBeGreaterThan(0);
    expect(producen('stone').length).toBeGreaterThan(0);
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
