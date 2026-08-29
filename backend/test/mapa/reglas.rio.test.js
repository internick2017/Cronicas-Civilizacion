import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado, tileEn, jugadorPorId } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { reclutar } from '../../src/domain/mapa/reglas/militar.js';
import { moverEjercito } from '../../src/domain/mapa/reglas/movimiento.js';
import { fundarCiudad } from '../../src/domain/mapa/reglas/ciudades.js';
import { tierraAlcanzable } from '../../src/domain/mapa/reglas/dominacion.js';
import { generarMapa } from '../../src/domain/mapa/generarMapa.js';
import {
  bonoDefensa, BONO_TERRENO_DEFENSA, BONO_TERRENO_PRODUCCION, TERRENOS
} from '../../src/domain/mapa/constantes.js';
import { ReglaError } from '../../src/domain/mapa/errores.js';

// El rio dejo de ser agua: es un terreno propio, se camina vadeandolo y no se
// navega. Ver docs/adr/0001-mar-y-rio-son-terrenos-distintos.md. Este archivo
// prueba el rio como CONCEPTO, cruzando las reglas que lo tocan (movimiento,
// fundacion, dominacion, defensa, produccion), en vez de repartir una asercion
// suelta por cada archivo de reglas: lo que hay que poder verificar de un
// vistazo es que el rio cae del lado de la tierra en todos lados menos en uno.

let e, cx, cy, ax, ay;
beforeEach(() => {
  e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  jugadorPorId(e, 'p1').recursos = { food: 999, gold: 999, wood: 999, stone: 999, science: 999, culture: 999 };

  // Misma estrategia que reglas.movimiento.test.js: se lee la capital real en
  // vez de asumir una coordenada, porque posicionesIniciales elige dentro de
  // la masa de tierra mas grande y eso depende del algoritmo, no de la semilla.
  const capital = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
  cx = capital.x;
  cy = capital.y;
  if (cx < 1) throw new Error(`supuesto roto: la capital de p1 quedo en x=${cx}, se necesita x>=1`);
  ax = cx - 1;
  ay = cy;

  tileEn(e, cx, cy).terreno = 'plains';
  aplicar(e, reclutar(e, 'p1', { x: cx, y: cy, unidad: 'warrior' }));
});

describe('el rio es tierra vadeable', () => {
  it('se puede mover un ejercito a un rio; al mar no', () => {
    tileEn(e, ax, ay).terreno = 'river';
    expect(() => moverEjercito(e, 'p1', { desde: { x: cx, y: cy }, hasta: { x: ax, y: ay } })).not.toThrow();

    tileEn(e, ax, ay).terreno = 'water';
    expect(() => moverEjercito(e, 'p1', { desde: { x: cx, y: cy }, hasta: { x: ax, y: ay } }))
      .toThrow(ReglaError);
  });

  it('cruzar un rio lo reclama como territorio, igual que cualquier tierra', () => {
    tileEn(e, ax, ay).terreno = 'river';
    const evs = moverEjercito(e, 'p1', { desde: { x: cx, y: cy }, hasta: { x: ax, y: ay } });
    aplicar(e, evs);

    expect(evs.some(ev => ev.tipo === 'TerritorioReclamado')).toBe(true);
    expect(tileEn(e, ax, ay).dueno).toBe('p1');
  });

  it('se puede fundar una ciudad sobre un rio; sobre el mar no', () => {
    tileEn(e, ax, ay).terreno = 'river';
    // Fundar exige territorio propio: se vadea el rio primero para reclamarlo
    // (igual que cualquier tierra, ver test de arriba) y recien ahi se funda.
    aplicar(e, moverEjercito(e, 'p1', { desde: { x: cx, y: cy }, hasta: { x: ax, y: ay } }));
    expect(() => fundarCiudad(e, 'p1', { x: ax, y: ay, nombre: 'Vado' })).not.toThrow();

    tileEn(e, ax, ay).terreno = 'water';
    expect(() => fundarCiudad(e, 'p1', { x: ax, y: ay, nombre: 'Vado' })).toThrow(ReglaError);
  });

  it('el rio cuenta como tierra para la dominacion; el mar no', () => {
    // Todo el mapa a llanura salvo dos casillas, para que el conteo sea exacto
    // y no dependa de cuanto oceano genero la semilla.
    for (const t of e.mapa) t.terreno = 'plains';
    const soloTierra = tierraAlcanzable(e).length;

    tileEn(e, ax, ay).terreno = 'river';
    expect(tierraAlcanzable(e).length).toBe(soloTierra);

    tileEn(e, ax, ay).terreno = 'water';
    expect(tierraAlcanzable(e).length).toBe(soloTierra - 1);
  });
});

describe('el rio como terreno', () => {
  it('penaliza la defensa: es el unico multiplicador menor a 1', () => {
    expect(bonoDefensa('river')).toBe(0.8);

    const menoresA1 = Object.entries(BONO_TERRENO_DEFENSA).filter(([, m]) => m < 1);
    expect(menoresA1).toEqual([['river', 0.8]]);
  });

  it('produce comida y nada mas', () => {
    expect(BONO_TERRENO_PRODUCCION.river).toEqual({ food: 2 });
  });

  it('el mar no produce nada, y sigue siendo un terreno distinto del rio', () => {
    expect(BONO_TERRENO_PRODUCCION.water).toEqual({});
    expect(TERRENOS).toContain('river');
    expect(TERRENOS).toContain('water');
  });
});

describe('el generador talla rios, no mar tierra adentro', () => {
  // Regresion directa del ADR 0001: antes de separarlos, trazarRios escribia
  // 'water', asi que cada rio era una pared infranqueable de una casilla de
  // ancho en medio del continente.
  // TODAS las semillas, no "la mayoria": el trazado trata su objetivo de rios
  // como un minimo garantizado y reintenta el nacimiento sorteado en vez de
  // perderlo. Antes de ese arreglo esta asercion era imposible de sostener
  // (medido: 20 de 40 semillas sin un solo rio en tamano 30, y 2 casillas de
  // rio de promedio sobre 900). Si esto vuelve a fallar, alguien convirtio el
  // objetivo en un numero de intentos otra vez.
  it('todos los mapas generados tienen casillas de rio', () => {
    const semillas = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8'];
    const conRio = semillas.filter(s => generarMapa(s, 30).some(t => t.terreno === 'river'));
    expect(conRio.length).toBe(semillas.length);
  });

  it('un mapa sin el paso de rios no tiene ninguna casilla de rio', () => {
    expect(generarMapa('r1', 30, { rios: false }).some(t => t.terreno === 'river')).toBe(false);
  });
});
