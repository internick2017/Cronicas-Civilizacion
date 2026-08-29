import { describe, it, expect } from 'vitest';
import { crearEstado, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { terminarTurno } from '../../src/domain/mapa/reglas/turnos.js';
import { controlTerritorial } from '../../src/domain/mapa/reglas/dominacion.js';

// Mapa 7x3 partido por una columna de mar: isla izquierda (3x3 = 9 casillas,
// donde estan las ciudades) e isla derecha (3x3 = 9).
//   x: 0 1 2 | 3 (mar) | 4 5 6
//
// Este archivo cambio de sentido con la etapa B. Antes probaba que la isla sin
// ciudades NO contara para la dominacion, y el argumento era "no hay movimiento
// naval, nadie va a pisarla nunca". Con transportes ese argumento se cayo: toda
// isla es alcanzable, asi que excluirla seria regalar territorio conquistable.
// Los tests se reescribieron para afirmar la regla NUEVA (cuenta toda la
// tierra), no se borraron: la regla vieja fue correcta mientras su premisa lo
// fue, y conviene que quede escrito por que dejo de serlo.
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

describe('el objetivo se mide sobre toda la tierra', () => {
  it('la isla sin ciudades TAMBIEN entra en el denominador', () => {
    const e = dosIslas();
    // 18 casillas de tierra en total, y las 18 cuentan: con transportes, la
    // isla de la derecha es territorio conquistable como cualquier otro.
    expect(e.mapa.filter(t => t.terreno !== 'water')).toHaveLength(18);
    expect(controlTerritorial(e, 'p1').totalTierra).toBe(18);
  });

  it('el porcentaje se calcula sobre toda la tierra, no sobre la isla propia', () => {
    const e = dosIslas();
    for (const [x, y] of [[1, 0], [2, 0], [0, 1], [1, 1]]) tileEn(e, x, y).dueno = 'p1';
    const control = controlTerritorial(e, 'p1');
    expect(control.tiles).toBe(5);
    expect(control.porcentaje).toBeCloseTo(5 / 18);
  });

  it('dominar la isla propia ya NO alcanza para ganar: hay que cruzar', () => {
    // Es la consecuencia de balance del cambio, y la mas importante de fijar:
    // antes, quedarse con su isla le daba a p1 el 66% y la partida. Ahora la
    // otra isla cuenta, asi que 9 de 18 es la mitad y hay que invadir.
    const e = dosIslas();
    for (const [x, y] of [[1, 0], [2, 0], [0, 1], [1, 1], [2, 1]]) tileEn(e, x, y).dueno = 'p1';
    tileEn(e, 2, 1).ejercito = { tipo: 'warrior', dueno: 'p1', salud: 100, movimientoRestante: 1, bonoMovimiento: 0 };
    expect(controlTerritorial(e, 'p1').porcentaje).toBeLessThan(0.6);

    const fin = cerrarRonda(e).find(ev => ev.tipo === 'PartidaTerminada');
    expect(fin).toBeUndefined();
  });

  it('el mar nunca entra en el denominador', () => {
    const e = dosIslas();
    // 21 casillas en el mapa, 3 son mar: quedan 18.
    expect(e.mapa).toHaveLength(21);
    expect(controlTerritorial(e, 'p1').totalTierra).toBe(18);
  });

  it('en un mapa de un solo continente no cambia nada (regresion)', () => {
    const e = dosIslas();
    for (const t of e.mapa) t.terreno = 'plains'; // sin agua: todo conectado
    expect(controlTerritorial(e, 'p1').totalTierra).toBe(21);
  });

  it('el denominador NO cambia al eliminar a un jugador', () => {
    const e = dosIslas();
    const antes = controlTerritorial(e, 'p1').totalTierra;
    e.jugadores.find(j => j.id === 'p2').activo = false;
    expect(controlTerritorial(e, 'p1').totalTierra).toBe(antes);
  });
});
