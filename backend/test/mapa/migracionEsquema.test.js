import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { MapGameRepo } from '../../src/db/MapGameRepo.js';

// Reproduce la regresion del commit 8421b5c: ese commit agrego la columna
// jugador_id a map_game_eventos en mapSchema.js, pero el DDL usa
// CREATE TABLE IF NOT EXISTS, asi que en una base que YA tenia la tabla
// (esquema viejo, sin la columna) la columna nunca se crea. A partir de ahi
// cualquier intento de guardar eventos (por ejemplo POST /unirse) rompe.
describe('migracion de esquema: columnas nuevas en tablas existentes', () => {
  it('agrega jugador_id a map_game_eventos cuando la tabla ya existia con el esquema viejo', () => {
    const db = new Database(':memory:');

    // Arma a mano el esquema VIEJO (sin jugador_id), como quedaria una base
    // de datos real creada antes del commit 8421b5c.
    db.exec(`
      CREATE TABLE IF NOT EXISTS map_games (
        id TEXT PRIMARY KEY,
        codigo TEXT UNIQUE,
        version_esquema INTEGER NOT NULL,
        estado_json TEXT NOT NULL,
        creado DATETIME DEFAULT CURRENT_TIMESTAMP,
        actualizado DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS map_game_eventos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        game_id TEXT NOT NULL,
        turno INTEGER NOT NULL,
        orden INTEGER NOT NULL,
        tipo TEXT NOT NULL,
        datos_json TEXT NOT NULL,
        narrativa TEXT,
        creado DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS map_game_tokens (
        game_id TEXT NOT NULL,
        jugador_id TEXT NOT NULL,
        token_hash TEXT NOT NULL,
        creado DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const repo = new MapGameRepo(db, 'sqlite');
    // Con la regresion, esto deja la tabla sin jugador_id (CREATE TABLE IF
    // NOT EXISTS no toca una tabla que ya existe).
    repo.init();

    // Guardar un evento (lo que dispara /unirse al registrar quien se unio)
    // debe funcionar sin lanzar "no such column: jugador_id".
    expect(() => repo.agregarEventos('g1', [{ turno: 1, tipo: 'JugadorUnido', jugadorId: 'p1', datos: {} }]))
      .not.toThrow();

    const eventos = repo.eventosDe('g1');
    expect(eventos).toHaveLength(1);
    expect(eventos[0].jugador_id).toBe('p1');
  });
});
