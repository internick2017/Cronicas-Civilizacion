import { describe, it, expect } from 'vitest';
import { ddl } from '../../src/db/mapSchema.js';

describe('mapSchema.ddl', () => {
  it('genera DDL sqlite bien formado para las tres tablas', () => {
    const statements = ddl('sqlite');
    expect(statements).toHaveLength(3);
    expect(statements[0]).toContain('CREATE TABLE IF NOT EXISTS map_games');
    expect(statements[0]).toContain('id TEXT PRIMARY KEY');
    expect(statements[0]).toContain('estado_json TEXT NOT NULL');
    expect(statements[1]).toContain('CREATE TABLE IF NOT EXISTS map_game_eventos');
    expect(statements[1]).toContain('id INTEGER PRIMARY KEY AUTOINCREMENT');
    expect(statements[2]).toContain('CREATE TABLE IF NOT EXISTS map_game_tokens');
    expect(statements[2]).toContain('token_hash TEXT NOT NULL');
  });

  it('genera DDL postgres bien formado con tipos propios del dialecto (UUID, BIGSERIAL)', () => {
    const statements = ddl('postgres');
    expect(statements).toHaveLength(3);
    expect(statements[0]).toContain('CREATE TABLE IF NOT EXISTS map_games');
    expect(statements[0]).toContain('id UUID PRIMARY KEY');
    expect(statements[0]).toContain('actualizado TIMESTAMP DEFAULT CURRENT_TIMESTAMP');
    expect(statements[1]).toContain('CREATE TABLE IF NOT EXISTS map_game_eventos');
    expect(statements[1]).toContain('id BIGSERIAL PRIMARY KEY');
    expect(statements[1]).toContain('game_id UUID NOT NULL');
    expect(statements[2]).toContain('CREATE TABLE IF NOT EXISTS map_game_tokens');
    expect(statements[2]).toContain('game_id UUID NOT NULL');
    // no debe contener sintaxis sqlite (AUTOINCREMENT no es valido en postgres)
    expect(statements.join('\n')).not.toContain('AUTOINCREMENT');
  });

  it('rechaza un dialecto desconocido', () => {
    expect(() => ddl('mysql')).toThrow();
  });
});
