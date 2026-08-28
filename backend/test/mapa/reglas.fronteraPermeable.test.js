import { describe, it, expect } from 'vitest';
import { crearEstado, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { moverEjercito } from '../../src/domain/mapa/reglas/movimiento.js';
import { controlTerritorial } from '../../src/domain/mapa/reglas/dominacion.js';

// Fila de casillas contiguas, todas de p2 salvo la primera, donde esta el
// ejercito de p1. Es la frontera sellada que hacia imposible la guerra: antes
// de este cambio p1 no podia entrar en NINGUNA de ellas.
function frontera() {
  const e = crearEstado({ nombre: 'T', semilla: 'frontera' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'X' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Y' }));
  aplicar(e, iniciar(e));
  e.config.tamanoMapa = 6;
  const tile = (x, y, extra) => ({ x, y, terreno: 'plains', recurso: null, dueno: null, ciudad: null, ejercito: null, descubiertoPor: ['p1', 'p2'], ...extra });
  const ciudad = (n) => ({ nombre: n, nivel: 1, poblacion: 500, edificios: [] });
  e.mapa = [];
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) e.mapa.push(tile(x, y));
  tileEn(e, 0, 0).dueno = 'p1';
  tileEn(e, 0, 0).ciudad = ciudad('P1');
  tileEn(e, 0, 1).dueno = 'p1';
  tileEn(e, 0, 1).ejercito = { tipo: 'warrior', dueno: 'p1', salud: 100, movimientoRestante: 2, bonoMovimiento: 0 };
  // Los tres vecinos del ejercito de p1, uno de cada clase, para poder afirmar
  // que la regla distingue: (1,1) ajena suelta, (0,2) ciudad ajena, (0,0) propia.
  tileEn(e, 1, 1).dueno = 'p2';                       // suelta y sin defensor
  tileEn(e, 0, 2).dueno = 'p2';
  tileEn(e, 0, 2).ciudad = ciudad('P2');              // ciudad ajena, pegada
  tileEn(e, 1, 0).dueno = 'p2';
  tileEn(e, 1, 0).ejercito = { tipo: 'warrior', dueno: 'p2', salud: 100, movimientoRestante: 0, bonoMovimiento: 0 };
  return e;
}

const mover = (e, desde, hasta) => moverEjercito(e, 'p1', { desde, hasta });

describe('la frontera deja de ser un muro', () => {
  it('entrar en una casilla ajena suelta y sin defensor: se puede, y cambia de dueño', () => {
    const e = frontera();
    aplicar(e, mover(e, { x: 0, y: 1 }, { x: 1, y: 1 }));
    expect(tileEn(e, 1, 1).dueno).toBe('p1');
    expect(tileEn(e, 1, 1).ejercito).not.toBe(null);
  });

  it('una ciudad ajena sigue exigiendo atacar', () => {
    const e = frontera();
    expect(() => mover(e, { x: 0, y: 1 }, { x: 0, y: 2 })).toThrow(/enemiga|atacar/i);
    expect(tileEn(e, 0, 2).dueno).toBe('p2');
  });

  it('una casilla defendida por un ejercito ajeno sigue exigiendo atacar', () => {
    const e = frontera();
    // (1,0) es de p2 y tiene ejercito; el atacante esta en (0,0)... movemos el
    // de (0,1) a (0,0) no: probamos directo desde (0,1) hacia (1,1) no aplica.
    // Usamos un ejercito propio pegado a (1,0): lo ponemos en (0,0) es ciudad.
    tileEn(e, 2, 0).dueno = 'p1';
    tileEn(e, 2, 0).ejercito = { tipo: 'warrior', dueno: 'p1', salud: 100, movimientoRestante: 2, bonoMovimiento: 0 };
    expect(() => mover(e, { x: 2, y: 0 }, { x: 1, y: 0 })).toThrow(/enemiga|atacar/i);
    expect(tileEn(e, 1, 0).dueno).toBe('p2');
  });

  it('moverse dentro de lo propio no genera reclamo de territorio', () => {
    const e = frontera();
    tileEn(e, 1, 1).dueno = 'p1'; // ya era mia
    const eventos = mover(e, { x: 0, y: 1 }, { x: 1, y: 1 });
    expect(eventos.some(ev => ev.tipo === 'TerritorioReclamado')).toBe(false);
  });

  it('lo que gana uno lo pierde el otro, casilla por casilla', () => {
    const e = frontera();
    const antesP1 = controlTerritorial(e, 'p1').tiles;
    const antesP2 = controlTerritorial(e, 'p2').tiles;

    aplicar(e, mover(e, { x: 0, y: 1 }, { x: 1, y: 1 }));

    expect(controlTerritorial(e, 'p1').tiles).toBe(antesP1 + 1);
    expect(controlTerritorial(e, 'p2').tiles).toBe(antesP2 - 1);
  });
});
