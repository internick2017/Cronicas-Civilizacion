import { describe, it, expect } from 'vitest';
import { generarMapa, posicionesIniciales } from '../../src/domain/mapa/generarMapa.js';
import { crearRng } from '../../src/domain/mapa/rng.js';
import { ReglaError } from '../../src/domain/mapa/errores.js';

const contarTerreno = (mapa, terreno) => mapa.filter(t => t.terreno === terreno).length;

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

  it('tiles nacen sin dueno, sin ciudad, sin ejercito, sin descubrir', () => {
    for (const t of generarMapa('s', 10)) {
      expect(t.dueno).toBeNull();
      expect(t.ciudad).toBeNull();
      expect(t.ejercito).toBeNull();
      expect(t.descubiertoPor).toEqual([]);
    }
  });

  it('solo usa terrenos conocidos', () => {
    const validos = new Set(['plains', 'forest', 'mountains', 'desert', 'water', 'hills']);
    for (const t of generarMapa('s', 20)) expect(validos.has(t.terreno)).toBe(true);
  });

  // El agua tiene que ser suficiente para que se lean costas, pero no tanta
  // como para ahogar el mapa jugable.
  it('la proporcion de agua queda entre 15% y 45% en varias semillas', () => {
    for (const semilla of ['a', 'b', 'c', 'd', 'e']) {
      const m = generarMapa(semilla, 30);
      const proporcion = contarTerreno(m, 'water') / m.length;
      expect(proporcion).toBeGreaterThan(0.15);
      expect(proporcion).toBeLessThan(0.45);
    }
  });

  it('todos los tipos de tierra aparecen en un mapa grande', () => {
    const m = generarMapa('variado', 40);
    for (const terreno of ['plains', 'forest', 'mountains', 'desert', 'hills']) {
      expect(contarTerreno(m, terreno)).toBeGreaterThan(0);
    }
  });

  // Esta es LA propiedad que separa el mundo nuevo del viejo: las casillas de
  // un mismo terreno se agrupan en manchones en vez de estar salpicadas.
  it('el terreno se agrupa: la mayoria de las casillas comparte terreno con un vecino', () => {
    const t = 30;
    const m = generarMapa('agrupado', t);
    let conVecinoIgual = 0;
    for (const tile of m) {
      const vecinos = [[1, 0], [-1, 0], [0, 1], [0, -1]]
        .map(([dx, dy]) => m[(tile.y + dy) * t + (tile.x + dx)])
        .filter((v, i) => {
          const nx = tile.x + [[1, 0], [-1, 0], [0, 1], [0, -1]][i][0];
          const ny = tile.y + [[1, 0], [-1, 0], [0, 1], [0, -1]][i][1];
          return nx >= 0 && nx < t && ny >= 0 && ny < t && v;
        });
      if (vecinos.some(v => v.terreno === tile.terreno)) conVecinoIgual++;
    }
    expect(conVecinoIgual / m.length).toBeGreaterThan(0.85);
  });

  it('funciona en los tamanos limite permitidos por la config (10 y 60)', () => {
    expect(generarMapa('chico', 10)).toHaveLength(100);
    expect(generarMapa('grande', 60)).toHaveLength(3600);
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
