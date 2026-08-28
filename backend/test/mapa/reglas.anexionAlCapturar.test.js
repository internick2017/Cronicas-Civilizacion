import { describe, it, expect } from 'vitest';
import { crearEstado, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { atacar } from '../../src/domain/mapa/reglas/combate.js';
import { controlTerritorial } from '../../src/domain/mapa/reglas/dominacion.js';

// Escenario armado a mano: p1 ataca desde (1,1) la ciudad de p2 en (2,1).
// Alrededor de esa ciudad hay de todo (casillas de p2, de p3, libres y una
// ciudad vecina) para poder afirmar QUE se voltea y que NO.
function escenario({ tamano = 6 } = {}) {
  const e = crearEstado({ nombre: 'T', semilla: 'anexion' });
  for (const [id, civ] of [['p1', 'A'], ['p2', 'B'], ['p3', 'C']]) {
    aplicar(e, unirse(e, { id, nombre: id, civilizacion: civ }));
  }
  aplicar(e, iniciar(e));
  e.config.tamanoMapa = tamano;
  const tile = (x, y, extra) => ({ x, y, terreno: 'plains', recurso: null, dueno: null, ciudad: null, ejercito: null, descubiertoPor: ['p1', 'p2', 'p3'], ...extra });
  e.mapa = [];
  for (let y = 0; y < tamano; y++) for (let x = 0; x < tamano; x++) e.mapa.push(tile(x, y));
  const en = (x, y) => tileEn(e, x, y);

  // p1: ciudad propia (para no ser eliminado) y el ejercito atacante.
  en(0, 0).dueno = 'p1';
  en(0, 0).ciudad = { nombre: 'P1', nivel: 1, poblacion: 500, edificios: [] };
  en(1, 1).dueno = 'p1';
  en(1, 1).ejercito = { tipo: 'cavalry', dueno: 'p1', salud: 120, movimientoRestante: 3, bonoMovimiento: 0 };

  // p2: la ciudad objetivo, de nivel 1 y en llanura para que la captura sea posible.
  en(2, 1).dueno = 'p2';
  en(2, 1).ciudad = { nombre: 'Objetivo', nivel: 1, poblacion: 500, edificios: [] };
  // Anillo de la ciudad: casillas de p2 que SI deben voltear.
  for (const [x, y] of [[2, 0], [3, 1], [2, 2]]) en(x, y).dueno = 'p2';
  // Ciudad vecina de p2: NO debe voltear (se toma peleando, no de regalo).
  en(1, 0).dueno = 'p2';
  en(1, 0).ciudad = { nombre: 'Vecina', nivel: 1, poblacion: 500, edificios: [] };
  // De un tercero: no paga por una guerra ajena.
  en(3, 0).dueno = 'p3';
  // (3,2) queda sin dueño: la tierra libre sigue libre.
  return e;
}

// Un rng fijo le da el MISMO multiplicador a los dos lados, asi que quien gana
// queda determinado por los numeros base y no por la suerte: la caballeria (20)
// le gana a una ciudad de nivel 1 en llanura (10 x 1.5 = 15), y un guerrero
// (10) le pierde. Los tests prueban la ANEXION, no la tirada.
const rngFijo = () => 1;

describe('capturar una ciudad voltea el territorio de alrededor', () => {
  it('las casillas del dueño anterior en el anillo pasan al conquistador', () => {
    const e = escenario();
    aplicar(e, atacar(e, 'p1', { desde: { x: 1, y: 1 }, hasta: { x: 2, y: 1 } }, rngFijo));

    expect(tileEn(e, 2, 1).dueno).toBe('p1'); // la ciudad
    for (const [x, y] of [[2, 0], [3, 1], [2, 2]]) {
      expect(tileEn(e, x, y).dueno).toBe('p1');
    }
  });

  it('no toca lo de un tercero, ni la tierra libre, ni una ciudad vecina', () => {
    const e = escenario();
    aplicar(e, atacar(e, 'p1', { desde: { x: 1, y: 1 }, hasta: { x: 2, y: 1 } }, rngFijo));

    expect(tileEn(e, 3, 0).dueno).toBe('p3');   // tercero
    expect(tileEn(e, 3, 2).dueno).toBe(null);   // libre sigue libre
    expect(tileEn(e, 1, 0).dueno).toBe('p2');   // ciudad vecina: se toma peleando
    expect(tileEn(e, 1, 0).ciudad).not.toBe(null);
  });

  it('lo que gana el conquistador es exactamente lo que pierde el conquistado', () => {
    const e = escenario();
    const antesP1 = controlTerritorial(e, 'p1').tiles;
    const antesP2 = controlTerritorial(e, 'p2').tiles;

    aplicar(e, atacar(e, 'p1', { desde: { x: 1, y: 1 }, hasta: { x: 2, y: 1 } }, rngFijo));

    const ganadas = controlTerritorial(e, 'p1').tiles - antesP1;
    const perdidas = antesP2 - controlTerritorial(e, 'p2').tiles;
    expect(ganadas).toBe(perdidas);
    expect(ganadas).toBe(4); // la ciudad + las 3 casillas suyas del anillo
  });

  it('si el ataque no captura, no anexa nada', () => {
    const e = escenario();
    // Guerrero en vez de caballeria: pierde contra la ciudad, asi no hay captura.
    tileEn(e, 1, 1).ejercito = { tipo: 'warrior', dueno: 'p1', salud: 100, movimientoRestante: 2, bonoMovimiento: 0 };
    const antes = e.mapa.filter(t => t.dueno === 'p2').length;

    aplicar(e, atacar(e, 'p1', { desde: { x: 1, y: 1 }, hasta: { x: 2, y: 1 } }, rngFijo));

    expect(e.mapa.filter(t => t.dueno === 'p2').length).toBe(antes);
  });

  it('una ciudad defendida por un ejercito no se captura ni anexa: primero hay que matarlo', () => {
    const e = escenario();
    tileEn(e, 2, 1).ejercito = { tipo: 'warrior', dueno: 'p2', salud: 100, movimientoRestante: 0, bonoMovimiento: 0 };
    const antes = e.mapa.filter(t => t.dueno === 'p2').length;

    aplicar(e, atacar(e, 'p1', { desde: { x: 1, y: 1 }, hasta: { x: 2, y: 1 } }, rngFijo));

    expect(tileEn(e, 2, 1).dueno).toBe('p2');
    // Puede haber muerto el defensor, pero el territorio no se movio.
    expect(e.mapa.filter(t => t.dueno === 'p2').length).toBe(antes);
  });

  it('en el borde del mapa no revienta: solo cuenta las casillas que existen', () => {
    const e = escenario();
    // Se mueve todo el escenario a la esquina: ciudad objetivo en (0,0).
    for (const t of e.mapa) { t.dueno = null; t.ciudad = null; t.ejercito = null; }
    tileEn(e, 5, 5).dueno = 'p1';
    tileEn(e, 5, 5).ciudad = { nombre: 'P1', nivel: 1, poblacion: 500, edificios: [] };
    tileEn(e, 0, 0).dueno = 'p2';
    tileEn(e, 0, 0).ciudad = { nombre: 'Esquina', nivel: 1, poblacion: 500, edificios: [] };
    tileEn(e, 0, 1).dueno = 'p2';
    tileEn(e, 1, 0).dueno = 'p1';
    tileEn(e, 1, 0).ejercito = { tipo: 'cavalry', dueno: 'p1', salud: 120, movimientoRestante: 3, bonoMovimiento: 0 };

    expect(() => aplicar(e, atacar(e, 'p1', { desde: { x: 1, y: 0 }, hasta: { x: 0, y: 0 } }, rngFijo))).not.toThrow();
    expect(tileEn(e, 0, 1).dueno).toBe('p1');
  });
});
