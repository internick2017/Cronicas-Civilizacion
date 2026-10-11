import { describe, it, expect } from 'vitest';
import { accionDelCompanero, nombreDelCompanero } from '../../src/domain/historia/companero.js';
import { clasificarAccion } from '../../src/domain/historia/clasificarAccion.js';

const GENEROS = ['fantasy', 'historical', 'sci-fi', 'mystery', 'sports-sim'];
const base = { idioma: 'es', genero: 'fantasy', ronda: 1, otros: ['Ana', 'Beto'], semilla: 's1' };

describe('accionDelCompanero', () => {
  it('es determinista', () => {
    expect(accionDelCompanero(base)).toBe(accionDelCompanero(base));
  });

  it('siempre es una acción que el narrador reconoce (nunca cae en "otro"), en todo género, idioma y ronda', () => {
    for (const idioma of ['es', 'pt']) {
      for (const genero of GENEROS) {
        for (let ronda = 1; ronda <= 40; ronda++) {
          const texto = accionDelCompanero({ ...base, idioma, genero, ronda });
          expect(clasificarAccion(texto), `${idioma} ${genero} r${ronda}: ${texto}`).not.toBe('otro');
        }
      }
    }
  });

  it('cabe en una acción (menos de 280 caracteres) y no deja huecos sin rellenar', () => {
    for (const idioma of ['es', 'pt']) {
      for (const genero of GENEROS) {
        for (let ronda = 1; ronda <= 40; ronda++) {
          const texto = accionDelCompanero({ ...base, idioma, genero, ronda });
          expect(texto.length).toBeGreaterThan(5);
          expect(texto.length).toBeLessThan(280);
          expect(texto).not.toMatch(/[{}]|undefined/);
        }
      }
    }
  });

  it('dos rondas seguidas no repiten la acción', () => {
    for (let ronda = 1; ronda < 40; ronda++) {
      expect(accionDelCompanero({ ...base, ronda })).not.toBe(accionDelCompanero({ ...base, ronda: ronda + 1 }));
    }
  });

  it('a veces se mete con un compañero por su nombre, y sin compañeros igual funciona', () => {
    const textos = Array.from({ length: 30 }, (_, i) => accionDelCompanero({ ...base, ronda: i + 1 }));
    expect(textos.some(t => /Ana|Beto/.test(t))).toBe(true);
    for (let ronda = 1; ronda <= 30; ronda++) {
      expect(accionDelCompanero({ ...base, ronda, otros: [] })).not.toMatch(/[{}]|undefined/);
    }
  });

  it('usa el vocabulario del género y habla en el idioma de la historia', () => {
    const porGenero = new Set(GENEROS.map(genero =>
      Array.from({ length: 12 }, (_, i) => accionDelCompanero({ ...base, genero, ronda: i + 1 })).join('|')));
    expect(porGenero.size).toBe(5);
    const es = accionDelCompanero({ ...base, ronda: 3 });
    const pt = accionDelCompanero({ ...base, idioma: 'pt', ronda: 3 });
    expect(pt).not.toBe(es);
  });
});

describe('nombreDelCompanero', () => {
  it('da un nombre de jugador y un personaje atrevido, según el idioma, y es estable', () => {
    const es = nombreDelCompanero({ idioma: 'es', semilla: 'x' });
    expect(es.nombre).toBe('La Máquina');
    expect(es.personaje.length).toBeGreaterThan(2);
    expect(nombreDelCompanero({ idioma: 'es', semilla: 'x' })).toEqual(es);
    expect(nombreDelCompanero({ idioma: 'pt', semilla: 'x' }).nombre).toBe('A Máquina');
  });
});
