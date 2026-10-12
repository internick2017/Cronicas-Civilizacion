import { describe, it, expect } from 'vitest';
import { esSalaAbandonada } from '../../src/domain/mapa/salas.js';

const ahora = new Date('2026-10-12T23:00:00Z');

describe('salas de espera abandonadas', () => {
  it('una sala sin tocar hace más de un día está abandonada', () => {
    expect(esSalaAbandonada({ estado: 'esperando', actualizado: '2026-10-11 22:00:00' }, ahora)).toBe(true);
    expect(esSalaAbandonada({ estado: 'esperando', actualizado: new Date('2026-08-16T18:13:42Z') }, ahora)).toBe(true);
  });

  it('una sala de hoy sigue ofreciéndose', () => {
    expect(esSalaAbandonada({ estado: 'esperando', actualizado: '2026-10-12 15:28:57' }, ahora)).toBe(false);
  });

  it('una partida en juego o terminada nunca cuenta como sala abandonada', () => {
    expect(esSalaAbandonada({ estado: 'jugando', actualizado: '2026-08-15 12:27:36' }, ahora)).toBe(false);
    expect(esSalaAbandonada({ estado: 'terminado', actualizado: '2026-08-15 12:27:36' }, ahora)).toBe(false);
  });

  it('sin una fecha legible no se esconde', () => {
    expect(esSalaAbandonada({ estado: 'esperando', actualizado: null }, ahora)).toBe(false);
    expect(esSalaAbandonada({ estado: 'esperando', actualizado: 'ayer' }, ahora)).toBe(false);
  });
});
