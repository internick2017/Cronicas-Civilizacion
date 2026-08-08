import { describe, it, expect, beforeEach } from 'vitest';
import crypto from 'crypto';
import Database from 'better-sqlite3';
import { MapGameRepo } from '../../src/db/MapGameRepo.js';

const hashDe = (tokenPlano) => crypto.createHash('sha256').update(tokenPlano).digest('hex');

let repo;
beforeEach(() => { repo = new MapGameRepo(new Database(':memory:'), 'sqlite'); repo.init(); });

describe('MapGameRepo: tokens', () => {
  it('round-trip: guarda el hash del token plano y lo reconoce', () => {
    // guardarToken recibe el HASH ya calculado (lo calcula el servicio, no el
    // repo, ver Task 2) — este test simula ese flujo hasheando el token plano
    // con el mismo algoritmo antes de guardarlo.
    const tokenPlano = 'token-secreto-de-prueba';
    repo.guardarToken('g1', 'p1', hashDe(tokenPlano));
    expect(repo.verificarToken('g1', 'p1', tokenPlano)).toBe(true);
    expect(repo.verificarToken('g1', 'p1', 'token-incorrecto')).toBe(false);
  });

  it('sin registro previo, verificarToken da false', () => {
    expect(repo.verificarToken('g-inexistente', 'p1', 'cualquiera')).toBe(false);
  });

  it('guardarToken es upsert: un segundo guardado para el mismo (game,jugador) reemplaza el hash', () => {
    repo.guardarToken('g1', 'p1', hashDe('viejo'));
    repo.guardarToken('g1', 'p1', hashDe('nuevo'));
    expect(repo.verificarToken('g1', 'p1', 'viejo')).toBe(false);
    expect(repo.verificarToken('g1', 'p1', 'nuevo')).toBe(true);
  });

  it('el token de un jugador no sirve para otro jugador de la misma partida', () => {
    repo.guardarToken('g1', 'p1', hashDe('token-de-p1'));
    expect(repo.verificarToken('g1', 'p2', 'token-de-p1')).toBe(false);
  });

  it('sobrevive a un segundo repo sobre la misma DB (mismo patron que el reinicio de Task 14)', () => {
    const db = new Database(':memory:');
    const repoA = new MapGameRepo(db, 'sqlite');
    repoA.init();
    repoA.guardarToken('g1', 'p1', hashDe('token-persistente'));

    const repoB = new MapGameRepo(db, 'sqlite');
    expect(repoB.verificarToken('g1', 'p1', 'token-persistente')).toBe(true);
  });
});
