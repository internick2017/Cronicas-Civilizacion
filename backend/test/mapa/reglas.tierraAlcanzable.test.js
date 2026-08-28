import { describe, it, expect } from 'vitest';
import { crearEstado, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { terminarTurno } from '../../src/domain/mapa/reglas/turnos.js';
import { controlTerritorial } from '../../src/domain/mapa/reglas/dominacion.js';

// Mapa 7x3 partido por una columna de agua: isla izquierda (3x3 = 9 casillas,
// donde estan las ciudades) e isla derecha (3x3 = 9), a la que NADIE puede
// llegar porque no hay movimiento naval.
//   x: 0 1 2 | 3 (agua) | 4 5 6
function dosIslas() {
  const e = crearEstado({ nombre: 'T', semilla: 'islas' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'X' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Y' }));
  aplicar(e, iniciar(e));
  e.config.tamanoMapa = 7;
  const tile = (x, y) => ({ x, y, terreno: x === 3 ? 'water' : 'plains', recurso: null, dueno: null, ciudad: null, ejercito: null, descubiertoPor: ['p1', 'p2'] });
  e.mapa = [];
  for (let y = 0; y < 3; y++) for (let x = 0; x < 7; x++) e.mapa.push(tile(x, y));
  // Una ciudad de cada jugador en la isla IZQUIERDA.
  tileEn(e, 0, 0).dueno = 'p1';
  tileEn(e, 0, 0).ciudad = { nombre: 'C1', nivel: 1, poblacion: 500, edificios: [] };
  tileEn(e, 2, 2).dueno = 'p2';
  tileEn(e, 2, 2).ciudad = { nombre: 'C2', nivel: 1, poblacion: 500, edificios: [] };
  return e;
}

const cerrarRonda = (e) => {
  const eventos = [];
  for (const j of [...e.jugadores]) {
    if (e.estado === 'jugando' && e.jugadores[e.indiceJugadorActual].id === j.id) {
      const evs = terminarTurno(e, j.id);
      eventos.push(...evs);
      aplicar(e, evs);
    }
  }
  return eventos;
};

describe('el objetivo se mide sobre la tierra alcanzable', () => {
  it('la isla sin ciudades no entra en el denominador', () => {
    const e = dosIslas();
    // 18 casillas de tierra en total, 9 en la isla jugable.
    expect(e.mapa.filter(t => t.terreno !== 'water')).toHaveLength(18);
    expect(controlTerritorial(e, 'p1').totalTierra).toBe(9);
  });

  it('el porcentaje se calcula sobre la isla jugable, no sobre todo el mapa', () => {
    const e = dosIslas();
    for (const [x, y] of [[1, 0], [2, 0], [0, 1], [1, 1]]) tileEn(e, x, y).dueno = 'p1';
    // 5 de 9 en la isla (55.6%), que sobre las 18 del mapa serian 27.8%.
    const control = controlTerritorial(e, 'p1');
    expect(control.tiles).toBe(5);
    expect(control.porcentaje).toBeCloseTo(5 / 9);
    expect(control.porcentaje).not.toBeCloseTo(5 / 18);
  });

  it('se puede ganar aunque la isla jugable sea menos del 60% del mapa', () => {
    const e = dosIslas();
    // p1 toma 6 de las 9 casillas de la isla (66%), dejando la ciudad de p2.
    for (const [x, y] of [[1, 0], [2, 0], [0, 1], [1, 1], [2, 1]]) tileEn(e, x, y).dueno = 'p1';
    expect(controlTerritorial(e, 'p1').porcentaje).toBeGreaterThanOrEqual(0.6);

    const fin = cerrarRonda(e).find(ev => ev.tipo === 'PartidaTerminada');
    expect(fin).toBeDefined();
    expect(fin.datos.ganador).toMatchObject({ jugadorId: 'p1', tipoVictoria: 'dominacion' });
  });

  it('una isla con una ciudad SI cuenta, aunque sea chica', () => {
    const e = dosIslas();
    // Una ciudad en la isla derecha: pasa a ser parte del mundo jugable.
    tileEn(e, 5, 1).ciudad = { nombre: 'C3', nivel: 1, poblacion: 500, edificios: [] };
    tileEn(e, 5, 1).dueno = 'p2';
    expect(controlTerritorial(e, 'p1').totalTierra).toBe(18);
  });

  it('en un mapa de un solo continente no cambia nada (regresion)', () => {
    const e = dosIslas();
    for (const t of e.mapa) t.terreno = 'plains'; // sin agua: todo conectado
    expect(controlTerritorial(e, 'p1').totalTierra).toBe(21);
  });

  it('el denominador NO cambia al eliminar a un jugador: su ciudad sostiene la isla', () => {
    const e = dosIslas();
    const antes = controlTerritorial(e, 'p1').totalTierra;
    e.jugadores.find(j => j.id === 'p2').activo = false;
    expect(controlTerritorial(e, 'p1').totalTierra).toBe(antes);
  });
});
