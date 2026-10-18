import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado, jugadorPorId } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import {
  gobiernoDe, multiplicadorProduccion, apoyoEfectivo, proponerGobierno, poderesDe,
} from '../../src/domain/mapa/reglas/gobierno.js';
import {
  piezasDeClave, perfilDeGobierno, validarClaveDeGobierno, nombreDeGobierno, preferenciaDe,
} from '../../src/domain/mapa/reglas/composicionGobierno.js';
import { GOBIERNOS, EJES_GOBIERNO } from '../../src/domain/mapa/constantes.js';

let e, p1;
beforeEach(() => {
  e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  p1 = jugadorPorId(e, 'p1');
});

describe('gobierno combinable: claves', () => {
  it('los tres ejes reparten exactamente los gobiernos, sin repetir', () => {
    const todas = Object.values(EJES_GOBIERNO).flat();
    expect(new Set(todas).size).toBe(todas.length);
    expect(todas.sort()).toEqual(Object.keys(GOBIERNOS).sort());
  });

  it('una pieza es la clave de siempre; varias se ordenan por eje', () => {
    expect(piezasDeClave('monarquia')).toEqual(['monarquia']);
    expect(piezasDeClave('republica_indirecta+parlamentarismo+monarquia'))
      .toEqual(['monarquia', 'parlamentarismo', 'republica_indirecta']);
  });

  it('rechaza piezas que no existen o dos del mismo eje', () => {
    expect(piezasDeClave('toString')).toBeNull();
    expect(piezasDeClave('monarquia+teocracia')).toBeNull();
    expect(piezasDeClave('')).toBeNull();
    expect(piezasDeClave(undefined)).toBeNull();
  });

  it('una clave guardada que ya no vale se lee como despotismo', () => {
    p1.gobierno = 'inventado';
    expect(gobiernoDe(p1)).toBe('despotismo');
  });

  it('el nombre une las piezas', () => {
    expect(nombreDeGobierno('monarquia+parlamentarismo+republica_indirecta'))
      .toBe('Monarquía + Parlamentarismo + Democracia representativa');
  });
});

describe('gobierno combinable: contradicciones', () => {
  it('monarquia + parlamentarismo + democracia representativa es valido (monarquia constitucional)', () => {
    expect(validarClaveDeGobierno('republica_indirecta+parlamentarismo+monarquia'))
      .toBe('monarquia+parlamentarismo+republica_indirecta');
  });

  it.each([
    ['republica_directa+despotismo', /Democracia directa/],
    ['absolutismo+republica_indirecta', /Absolutismo/],
    ['parlamentarismo+dictadura', /Parlamentarismo/],
    ['presidencialismo+monarquia', /Presidencialismo/],
    ['teocracia+republica_semidirecta', /Teocracia/],
  ])('%s se contradice', (clave, mensaje) => {
    expect(() => validarClaveDeGobierno(clave)).toThrow(mensaje);
  });

  it('proponer una combinacion contradictoria no gasta oro ni cambia nada', () => {
    p1.recursos.gold = 100;
    expect(() => proponerGobierno(e, 'p1', { gobierno: 'absolutismo+republica_directa', oro: 50 }))
      .toThrowError(expect.objectContaining({ codigo: 'COMBINACION_INVALIDA' }));
    expect(p1.recursos.gold).toBe(100);
  });

  it('proponer una combinacion valida desde despotismo la aprueba (decide el jugador)', () => {
    const evs = proponerGobierno(e, 'p1', { gobierno: 'parlamentarismo+monarquia' });
    expect(evs.find(x => x.tipo === 'GobiernoCambiado').datos.gobierno).toBe('monarquia+parlamentarismo');
    aplicar(e, evs);
    expect(p1.gobierno).toBe('monarquia+parlamentarismo');
  });

  it('proponer el mismo gobierno en otro orden es GOBIERNO_IGUAL', () => {
    p1.gobierno = 'monarquia+parlamentarismo';
    expect(() => proponerGobierno(e, 'p1', { gobierno: 'parlamentarismo+monarquia' }))
      .toThrowError(expect.objectContaining({ codigo: 'GOBIERNO_IGUAL' }));
  });
});

describe('gobierno combinable: los efectos se suman', () => {
  it('monarquia (+20% oro) + oligarquia (+15%) suman 1,35; oligarquia + presidencialismo (+10%) suman 1,25', () => {
    expect(multiplicadorProduccion({ gobierno: 'monarquia+oligarquia' }, 'gold')).toBeCloseTo(1.35);
    expect(multiplicadorProduccion({ gobierno: 'oligarquia+presidencialismo' }, 'gold')).toBeCloseTo(1.25);
  });

  it('el respeto y los poderes se suman y unen', () => {
    p1.apoyo = { pueblo: 50, lideres: 50, militares: 50 };
    p1.gobierno = 'monarquia+parlamentarismo'; // lideres +10 y +10
    expect(apoyoEfectivo(p1, 'lideres')).toBe(70);
    expect(poderesDe(p1).sort()).toEqual(['legislativo', 'moderador']);
  });

  it('las democracias suman el bono de las republicas', () => {
    expect(multiplicadorProduccion({ gobierno: 'monarquia+parlamentarismo+republica_indirecta' }, 'science'))
      .toBeCloseTo(1 + 0.1 + 0.1); // republica +10% y parlamentarismo +10% de ciencia
  });

  it('la preferencia de un grupo es el promedio de las piezas', () => {
    expect(preferenciaDe('monarquia+parlamentarismo', 'pueblo')).toBe((30 + 60) / 2);
  });

  it('el electorado sale del regimen, luego el sistema, luego la forma', () => {
    expect(perfilDeGobierno('monarquia').electorado).toBe('jugador');
    expect(perfilDeGobierno('monarquia+parlamentarismo').electorado).toBe('lideres');
    expect(perfilDeGobierno('monarquia+parlamentarismo+republica_directa').electorado).toBe('pueblo');
  });

  it('los militares sostienen si CUALQUIER pieza se apoya en ellos', () => {
    expect(perfilDeGobierno('monarquia+dictadura').sostenidoPor).toBe('militares');
    expect(perfilDeGobierno('monarquia+oligarquia').sostenidoPor).toBe('lideres');
  });

  it('el despotismo solo es inmortal si nadie vota', () => {
    expect(perfilDeGobierno('despotismo').inmortal).toBe(true);
    expect(perfilDeGobierno('despotismo+absolutismo').inmortal).toBe(true);
    expect(perfilDeGobierno('despotismo+oligarquia').inmortal).toBe(false);
  });
});
