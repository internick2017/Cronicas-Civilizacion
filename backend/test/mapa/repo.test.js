import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { MapGameRepo } from '../../src/db/MapGameRepo.js';
import { crearEstado, toJSON, fromJSON, tileEn, jugadorPorId } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { reclutar } from '../../src/domain/mapa/reglas/militar.js';
import { construir } from '../../src/domain/mapa/reglas/ciudades.js';

let repo;
beforeEach(() => { repo = new MapGameRepo(new Database(':memory:'), 'sqlite'); repo.init(); });

it('round-trip completo: partida jugando sobrevive guardar+cargar identica (anti B3/B6)', () => {
  const e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));

  // Dar recursos de sobra para poder construir y reclutar sin chocar con costos.
  jugadorPorId(e, 'p1').recursos = { food: 999, gold: 999, wood: 999, stone: 999, science: 999, culture: 999 };

  const capital = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
  const { x, y } = capital;

  // Edificio construido en una ciudad (cubre `ciudad.edificios`).
  aplicar(e, construir(e, 'p1', { x, y, edificio: 'granary' }));

  // Ejercito reclutado sobre la capital, con salud y movimiento no-default
  // (cubre `tile.ejercito`, exactamente donde reapareceria el bug de `ciudad`).
  aplicar(e, reclutar(e, 'p1', { x, y, unidad: 'warrior' }));
  const tileConEjercito = tileEn(e, x, y);
  tileConEjercito.ejercito.salud = 37;
  tileConEjercito.ejercito.movimientoRestante = 1;

  // Un tile descubierto por DOS jugadores distintos (cubre niebla compartida).
  if (!capital.descubiertoPor.includes('p2')) capital.descubiertoPor.push('p2');

  repo.guardar(e, 'ABC123');
  const cargado = fromJSON(repo.cargar(e.id));
  expect(cargado).toEqual(e);          // ciudades, edificios, ejercitos, recursos, niebla: TODO sobrevive
});

it('round-trip en los tres estados de partida', () => {
  for (const prep of ['esperando', 'jugando', 'terminado']) {
    const e = crearEstado({ nombre: prep, semilla: prep });
    if (prep !== 'esperando') {
      aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'X' }));
      aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Y' }));
      aplicar(e, iniciar(e));
    }
    if (prep === 'terminado') {
      aplicar(e, [{ tipo: 'PartidaTerminada', turno: 1, jugadorId: null,
        datos: { ganador: { jugadorId: 'p1', tipoVictoria: 'dominacion', turno: 1 } } }]);
    }
    repo.guardar(e, `C-${prep}`);
    expect(fromJSON(repo.cargar(e.id))).toEqual(e);
  }
});

it('eventos append-only con narrativa por ronda', () => {
  const e = crearEstado({ nombre: 'T', semilla: 's' });
  repo.guardar(e, 'EVT');
  repo.agregarEventos(e.id, [{ tipo: 'JugadorUnido', turno: 0, jugadorId: null, datos: { id: 'p1', nombre: 'A', civilizacion: 'X' } }]);
  repo.guardarNarrativa(e.id, 0, 'Los incas llegaron al valle.');
  const filas = repo.eventosDe(e.id);
  expect(filas).toHaveLength(1);
  expect(filas[0].tipo).toBe('JugadorUnido');
  expect(JSON.parse(filas[0].datos_json).id).toBe('p1');
});

it('cargarPorCodigo y listarActivas', () => {
  const e = crearEstado({ nombre: 'T', semilla: 's' });
  repo.guardar(e, 'ZZ99');
  expect(fromJSON(repo.cargarPorCodigo('ZZ99')).id).toBe(e.id);
  expect(repo.listarActivas()).toHaveLength(1);
  expect(repo.cargar('inexistente')).toBeNull();
});

describe('narrativasDe', () => {
  it('devuelve solo las rondas con narrativa, de la mas vieja a la mas nueva', async () => {
    repo.guardar(crearEstado({ nombre: 'T', semilla: 's1' }), 'ABC123');
    const id = repo.listarActivas()[0].id;
    repo.agregarEventos(id, [
      { tipo: 'RondaCompletada', turno: 1, jugadorId: null, datos: {} },
      { tipo: 'RondaCompletada', turno: 2, jugadorId: null, datos: {} },
      { tipo: 'RondaCompletada', turno: 3, jugadorId: null, datos: {} }
    ]);
    repo.guardarNarrativa(id, 1, 'Primera ronda.');
    repo.guardarNarrativa(id, 3, 'Tercera ronda.');

    const narrativas = await repo.narrativasDe(id);
    expect(narrativas).toEqual([
      { ronda: 1, texto: 'Primera ronda.' },
      { ronda: 3, texto: 'Tercera ronda.' }
    ]);
  });

  it('respeta el limite quedandose con las mas recientes', async () => {
    repo.guardar(crearEstado({ nombre: 'T', semilla: 's2' }), 'DEF456');
    const id = repo.listarActivas()[0].id;
    repo.agregarEventos(id, [
      { tipo: 'RondaCompletada', turno: 1, jugadorId: null, datos: {} },
      { tipo: 'RondaCompletada', turno: 2, jugadorId: null, datos: {} },
      { tipo: 'RondaCompletada', turno: 3, jugadorId: null, datos: {} }
    ]);
    for (const n of [1, 2, 3]) repo.guardarNarrativa(id, n, `Ronda ${n}.`);

    const narrativas = await repo.narrativasDe(id, 2);
    expect(narrativas.map(x => x.ronda)).toEqual([2, 3]);
  });

  it('una partida sin narrativas devuelve arreglo vacio', async () => {
    expect(await repo.narrativasDe('inexistente')).toEqual([]);
  });
});
