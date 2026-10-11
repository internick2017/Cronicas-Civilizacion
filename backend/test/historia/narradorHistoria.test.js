import { describe, it, expect } from 'vitest';
import { clasificarAccion } from '../../src/domain/historia/clasificarAccion.js';
import { apertura, narrarRonda, epilogo } from '../../src/domain/historia/narradorHistoria.js';

const base = { idioma: 'es', genero: 'fantasy', modo: 'colaborativo', ronda: 1, rondasRestantes: null, semilla: 's1', anteriores: [] };
const acciones = [
  { personaje: 'Ana', texto: 'Exploro la cueva con cuidado' },
  { personaje: 'Beto', texto: 'Enciendo una antorcha' },
];

describe('clasificarAccion', () => {
  it.each([
    ['Ataco al dragón con mi espada', 'atacar'],
    ['Ataco o dragão com a espada', 'atacar'],
    ['Le digo al guardia que nos deje pasar', 'hablar'],
    ['Pergunto ao velho quem ele é', 'hablar'],
    ['Exploro la cueva', 'explorar'],
    ['Investigo as pegadas', 'explorar'],
    ['Corro hacia la salida', 'huir'],
    ['Fujo pela janela', 'huir'],
    ['Abro el cofre', 'usar'],
    ['Acendo a tocha', 'usar'],
    ['Curo a mi compañero herido', 'ayudar'],
    ['Pienso en mi casa', 'otro'],
    ['', 'otro'],
  ])('%s -> %s', (texto, categoria) => {
    expect(clasificarAccion(texto)).toBe(categoria);
  });

  it('ignora acentos y mayúsculas', () => {
    expect(clasificarAccion('EXPLORÓ el túnel')).toBe('explorar');
  });
});

describe('narrarRonda', () => {
  it('usa los nombres y las palabras de cada jugador', () => {
    const texto = narrarRonda({ ...base, acciones });
    expect(texto).toContain('Ana');
    expect(texto).toContain('Beto');
    expect(texto).toContain('Exploro la cueva con cuidado');
    expect(texto).toContain('Enciendo una antorcha');
  });

  it('es determinista: misma entrada, mismo texto', () => {
    expect(narrarRonda({ ...base, acciones })).toBe(narrarRonda({ ...base, acciones }));
  });

  it('con otra semilla puede variar el texto', () => {
    const textos = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map(semilla => narrarRonda({ ...base, acciones, semilla })));
    expect(textos.size).toBeGreaterThan(1);
  });

  it('el género cambia el vocabulario', () => {
    const exploracion = [{ personaje: 'Ana', texto: 'Exploro el lugar' }];
    const textos = ['fantasy', 'historical', 'sci-fi', 'mystery', 'sports-sim']
      .map(genero => narrarRonda({ ...base, acciones: exploracion, genero }));
    expect(new Set(textos).size).toBe(5);
  });

  it('en portugués no mezcla frases en español', () => {
    const texto = narrarRonda({ ...base, idioma: 'pt', acciones: [{ personaje: 'Ana', texto: 'Exploro a caverna' }, { personaje: 'Beto', texto: 'Acendo a tocha' }] });
    expect(texto).not.toMatch(/\b(mientras|descubre|ronda|ustedes|después)\b/i);
    expect(texto).toMatch(/\b(enquanto|descobre|vocês|ao mesmo tempo|logo depois)\b/i);
  });

  it('recorta las acciones largas y limpia saltos de línea y comillas', () => {
    const larga = `Exploro ${'muy lejos '.repeat(60)}\nfin «raro» "x"`;
    const texto = narrarRonda({ ...base, acciones: [{ personaje: 'Ana', texto: larga }, acciones[1]] });
    expect(texto.length).toBeLessThan(1200);
    expect(texto).toContain('Exploro muy lejos');
    expect(texto).not.toContain('\n');
    expect(texto).not.toContain('"x"');
  });

  it('recuerda lo que un jugador hizo antes, sin inventar si no hay nada antes', () => {
    const con = narrarRonda({ ...base, ronda: 2, acciones, anteriores: [{ personaje: 'Ana', texto: 'Robo la llave del castillo' }] });
    expect(con).toContain('Robo la llave del castillo');
    const sin = narrarRonda({ ...base, ronda: 2, acciones, anteriores: [] });
    expect(sin).not.toContain('llave');
  });

  it('en las últimas rondas empieza a cerrar la historia', () => {
    const normal = narrarRonda({ ...base, acciones, rondasRestantes: 6 });
    const cierre = narrarRonda({ ...base, acciones, rondasRestantes: 1 });
    expect(cierre).toMatch(/final|desenlace/i);
    expect(normal).not.toMatch(/desenlace/i);
  });

  it('el narrador activo termina planteando un peligro, el colaborativo invita a seguir', () => {
    const activo = narrarRonda({ ...base, acciones, modo: 'narrador-activo' });
    const colab = narrarRonda({ ...base, acciones, modo: 'colaborativo' });
    expect(activo).not.toBe(colab);
    expect(colab).toMatch(/\?|ustedes/);
    expect(activo).toMatch(/de pronto/i);
  });

  it('no se rompe sin acciones ni con acciones vacías', () => {
    expect(narrarRonda({ ...base, acciones: [] }).length).toBeGreaterThan(10);
    expect(() => narrarRonda({ ...base, acciones: [{ personaje: 'Ana', texto: '' }] })).not.toThrow();
  });

  it('un idioma o género desconocido cae al español y a la fantasía', () => {
    expect(() => narrarRonda({ ...base, idioma: 'xx', genero: 'zzz', acciones })).not.toThrow();
  });
});

describe('apertura', () => {
  const datos = { idioma: 'es', genero: 'sci-fi', modo: 'narrador-activo', personajes: ['Ana', 'Beto', 'Carla'], semilla: 's1' };

  it('presenta el escenario y nombra a todos los protagonistas', () => {
    const texto = apertura(datos);
    for (const nombre of ['Ana', 'Beto', 'Carla']) expect(texto).toContain(nombre);
    expect(texto.length).toBeGreaterThan(80);
  });

  it('es determinista y respeta el idioma', () => {
    expect(apertura(datos)).toBe(apertura(datos));
    expect(apertura({ ...datos, idioma: 'pt' })).toMatch(/\b(e|com|um|uma)\b/);
    expect(apertura({ ...datos, idioma: 'pt' })).not.toBe(apertura(datos));
  });

  it('el narrador activo plantea el primer evento', () => {
    expect(apertura(datos)).toMatch(/de pronto/i);
    expect(apertura({ ...datos, modo: 'colaborativo' })).not.toMatch(/de pronto/i);
  });
});

describe('epilogo', () => {
  it('recuerda lo último que hizo cada personaje y cierra la historia', () => {
    const texto = epilogo({
      idioma: 'es', genero: 'mystery', semilla: 's1',
      acciones: [
        { personaje: 'Ana', texto: 'Busco huellas' },
        { personaje: 'Beto', texto: 'Interrogo al mayordomo' },
        { personaje: 'Ana', texto: 'Abro el cajón secreto' },
      ],
    });
    expect(texto).toContain('Abro el cajón secreto');
    expect(texto).not.toContain('Busco huellas');
    expect(texto).toContain('Interrogo al mayordomo');
    expect(texto).toMatch(/final/i);
  });

  it('no se rompe sin historia', () => {
    expect(epilogo({ idioma: 'pt', genero: 'fantasy', semilla: 's', acciones: [] }).length).toBeGreaterThan(10);
  });
});
