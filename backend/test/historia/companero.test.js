import { describe, it, expect } from 'vitest';
import { accionDelCompanero, nombreDelCompanero } from '../../src/domain/historia/companero.js';
import { clasificarAccion } from '../../src/domain/historia/clasificarAccion.js';
import { textosDe } from '../../src/domain/historia/textos.js';

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

describe('accionDelCompanero: reacciona a lo narrado', () => {
  const vocab = {
    peligro: 'un rugido sacude las montañas',
    hallazgo: 'una runa antigua que late con luz tenue',
  };
  const narracionCon = (...frases) => `Ana avanza. ${frases.join('. ')}. ¿Qué harán ahora?`;

  it('si la narración trae un peligro, la acción lo nombra', () => {
    const texto = accionDelCompanero({ ...base, narracion: narracionCon(`De pronto, ${vocab.peligro}`) });
    expect(texto.toLowerCase()).toContain(vocab.peligro);
  });

  it('si trae un hallazgo, la acción lo nombra; y gana al peligro cuando están los dos', () => {
    const solo = accionDelCompanero({ ...base, narracion: narracionCon(`ante todos aparece ${vocab.hallazgo}`) });
    expect(solo.toLowerCase()).toContain(vocab.hallazgo);
    const ambos = accionDelCompanero({ ...base, narracion: narracionCon(vocab.hallazgo, `De pronto, ${vocab.peligro}`) });
    expect(ambos.toLowerCase()).toContain(vocab.hallazgo);
    expect(ambos.toLowerCase()).not.toContain(vocab.peligro);
  });

  it('no vuelve sobre lo que ya tocó en su acción anterior: pasa al otro elemento, o a la acción de siempre', () => {
    const narracion = narracionCon(vocab.hallazgo, `De pronto, ${vocab.peligro}`);
    const primera = accionDelCompanero({ ...base, narracion });
    expect(primera.toLowerCase()).toContain(vocab.hallazgo);
    const segunda = accionDelCompanero({ ...base, ronda: 2, narracion, anterior: primera });
    expect(segunda.toLowerCase()).toContain(vocab.peligro);
    const tercera = accionDelCompanero({ ...base, ronda: 3, narracion, anterior: segunda + ' ' + primera });
    expect(tercera.toLowerCase()).not.toContain(vocab.hallazgo);
    expect(tercera.toLowerCase()).not.toContain(vocab.peligro);
  });

  it('sin nada que reconocer en la narración, vuelve a la acción de siempre', () => {
    const sin = accionDelCompanero(base);
    expect(accionDelCompanero({ ...base, narracion: 'Un día tranquilo, sin sobresaltos.' })).toBe(sin);
    expect(accionDelCompanero({ ...base, narracion: '' })).toBe(sin);
  });

  it('también reacciona en portugués, con el vocabulario de cada género', () => {
    const pt = accionDelCompanero({ ...base, idioma: 'pt', narracion: narracionCon('De repente, um rugido sacode as montanhas') });
    expect(pt.toLowerCase()).toContain('um rugido sacode as montanhas');
    const misterio = accionDelCompanero({ ...base, genero: 'mystery', narracion: narracionCon('una luz se apaga y deja la sala a oscuras') });
    expect(misterio.toLowerCase()).toContain('una luz se apaga y deja la sala a oscuras');
  });

  it('la reacción es siempre una acción que el narrador reconoce, sin huecos, y no repite en rondas seguidas', () => {
    for (const idioma of ['es', 'pt']) {
      for (const genero of GENEROS) {
        const vocabulario = textosDe(idioma).generos[genero];
        for (const clave of ['peligro', 'hallazgo']) {
          for (const frase of vocabulario[clave]) {
            let anterior = '';
            for (let ronda = 1; ronda <= 8; ronda++) {
              const texto = accionDelCompanero({ ...base, idioma, genero, ronda, narracion: `Pasa algo: ${frase}.` });
              expect(clasificarAccion(texto), `${idioma} ${genero} ${clave}: ${texto}`).not.toBe('otro');
              expect(texto).not.toMatch(/[{}]|undefined/);
              expect(texto.length).toBeLessThan(280);
              expect(texto).not.toBe(anterior);
              anterior = texto;
            }
          }
        }
      }
    }
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
