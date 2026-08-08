import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { MapGameRepo } from '../../src/db/MapGameRepo.js';
import { crearEstado, toJSON, fromJSON } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';

let repo;
beforeEach(() => { repo = new MapGameRepo(new Database(':memory:'), 'sqlite'); repo.init(); });

it('round-trip completo: partida jugando sobrevive guardar+cargar identica (anti B3/B6)', () => {
  const e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  repo.guardar(e, 'ABC123');
  const cargado = fromJSON(repo.cargar(e.id));
  expect(cargado).toEqual(e);          // ciudades, recursos, niebla: TODO sobrevive
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
