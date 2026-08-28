import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { MapGameRepo } from '../../src/db/MapGameRepo.js';
import { crearEstado } from '../../src/domain/mapa/MapGame.js';

let repo;
beforeEach(() => { repo = new MapGameRepo(new Database(':memory:'), 'sqlite'); repo.init(); });

const eventoFalso = (i) => ({ tipo: 'EjercitoMovido', turno: 1 + Math.floor(i / 10), jugadorId: 'p1', datos: { i } });

describe('contarEventos', () => {
  // La semilla del combate se arma con la CANTIDAD de eventos previos, asi que
  // este numero tiene que ser exactamente el mismo que daba leer el log entero:
  // si difiere, los combates de una partida guardada saldrian distintos.
  it('da exactamente lo mismo que eventosDe().length', async () => {
    const e = crearEstado({ nombre: 'T', semilla: 's1' });
    await repo.guardar(e, 'ABC123');
    await repo.agregarEventos(e.id, Array.from({ length: 37 }, (_, i) => eventoFalso(i)));

    expect(await repo.contarEventos(e.id)).toBe(repo.eventosDe(e.id).length);
    expect(await repo.contarEventos(e.id)).toBe(37);
  });

  it('cuenta solo los de esa partida', async () => {
    const a = crearEstado({ nombre: 'A', semilla: 's1' });
    const b = crearEstado({ nombre: 'B', semilla: 's2' });
    await repo.guardar(a, 'AAA111');
    await repo.guardar(b, 'BBB222');
    await repo.agregarEventos(a.id, Array.from({ length: 5 }, (_, i) => eventoFalso(i)));
    await repo.agregarEventos(b.id, Array.from({ length: 2 }, (_, i) => eventoFalso(i)));

    expect(await repo.contarEventos(a.id)).toBe(5);
    expect(await repo.contarEventos(b.id)).toBe(2);
  });

  it('en una partida sin eventos da 0, no null ni undefined', async () => {
    const e = crearEstado({ nombre: 'T', semilla: 's1' });
    await repo.guardar(e, 'CCC333');
    expect(await repo.contarEventos(e.id)).toBe(0);
  });
});
