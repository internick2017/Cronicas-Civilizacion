import { describe, it, expect } from 'vitest';
import { crearEstado, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { terminarTurno } from '../../src/domain/mapa/reglas/turnos.js';
import { recuperarFronteras } from '../../src/domain/mapa/reglas/fronteras.js';

// Mapa 5x5 armado a mano. p1 tiene una ciudad en el centro (2,2); todo lo demas
// se configura por test para aislar cada regla.
function tablero() {
  const e = crearEstado({ nombre: 'T', semilla: 'fronteras' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'X' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Y' }));
  aplicar(e, iniciar(e));
  e.config.tamanoMapa = 5;
  e.mapa = [];
  for (let y = 0; y < 5; y++) for (let x = 0; x < 5; x++) {
    e.mapa.push({ x, y, terreno: 'plains', recurso: null, dueno: null, ciudad: null, ejercito: null, descubiertoPor: ['p1', 'p2'] });
  }
  const capital = tileEn(e, 2, 2);
  capital.dueno = 'p1';
  capital.ciudad = { nombre: 'Centro', nivel: 1, poblacion: 500, edificios: [] };
  return e;
}

const ejercito = (dueno) => ({ tipo: 'warrior', dueno, salud: 100, movimientoRestante: 0, bonoMovimiento: 0 });

describe('las ciudades recuperan su frontera', () => {
  // Lo que motiva la regla: jugando una partida real, el territorio propio bajo
  // del 30% al 18% en cinco turnos sin perder una sola ciudad. Con 3 ejercitos
  // no se pueden custodiar 22 casillas, asi que perder terreno no dependia de
  // jugar mal sino de no poder estar en todos lados.
  it('una casilla del rival pegada a mi ciudad, sin nadie encima, vuelve a mi', () => {
    const e = tablero();
    tileEn(e, 2, 1).dueno = 'p2';

    aplicar(e, recuperarFronteras(e));

    expect(tileEn(e, 2, 1).dueno).toBe('p1');
  });

  it('si el rival la esta ocupando con un ejercito, se la queda', () => {
    const e = tablero();
    const tomada = tileEn(e, 2, 1);
    tomada.dueno = 'p2';
    tomada.ejercito = ejercito('p2');

    aplicar(e, recuperarFronteras(e));

    expect(tomada.dueno).toBe('p2');
  });

  it('no absorbe tierra de nadie: eso seria expansion gratis, no defensa', () => {
    const e = tablero();
    expect(tileEn(e, 2, 1).dueno).toBe(null);

    aplicar(e, recuperarFronteras(e));

    expect(tileEn(e, 2, 1).dueno).toBe(null);
  });

  it('solo alcanza a la vuelta de la ciudad, no a todo el mapa', () => {
    const e = tablero();
    tileEn(e, 2, 0).dueno = 'p2'; // a dos pasos de la ciudad

    aplicar(e, recuperarFronteras(e));

    expect(tileEn(e, 2, 0).dueno).toBe('p2');
  });

  it('una casilla pegada a ciudades de los DOS no cambia de manos', () => {
    const e = tablero();
    const rival = tileEn(e, 2, 0);
    rival.dueno = 'p2';
    rival.ciudad = { nombre: 'Rival', nivel: 1, poblacion: 500, edificios: [] };
    const disputada = tileEn(e, 2, 1); // toca la ciudad de p1 y la de p2
    disputada.dueno = 'p2';

    aplicar(e, recuperarFronteras(e));

    expect(disputada.dueno).toBe('p2');
  });

  it('nunca le saca una CIUDAD al rival: eso se toma peleando', () => {
    const e = tablero();
    const ciudadRival = tileEn(e, 2, 1);
    ciudadRival.dueno = 'p2';
    ciudadRival.ciudad = { nombre: 'Vecina', nivel: 1, poblacion: 500, edificios: [] };

    aplicar(e, recuperarFronteras(e));

    expect(ciudadRival.dueno).toBe('p2');
  });

  it('sin nada que recuperar no emite eventos', () => {
    expect(recuperarFronteras(tablero())).toEqual([]);
  });

  it('pasa de verdad al cerrar la ronda, no solo si se la llama a mano', () => {
    const e = tablero();
    tileEn(e, 1, 2).dueno = 'p2';
    // p2 necesita una ciudad propia para no quedar eliminado al cerrar.
    const suya = tileEn(e, 4, 4);
    suya.dueno = 'p2';
    suya.ciudad = { nombre: 'Lejana', nivel: 1, poblacion: 500, edificios: [] };

    for (const j of [...e.jugadores]) {
      if (e.estado === 'jugando' && e.jugadores[e.indiceJugadorActual].id === j.id) {
        aplicar(e, terminarTurno(e, j.id));
      }
    }

    expect(tileEn(e, 1, 2).dueno).toBe('p1');
  });
});
