import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NarrativeService } from '../src/services/NarrativeService.js';

describe('reintento de narración y reentrada', () => {
  let svc, session, ana, beto;

  beforeEach(async () => {
    svc = new NarrativeService({ skipDatabase: true });
    svc.aiService = { generateStoryNarrative: vi.fn() };
    session = await svc.createSession({ title: 'T', settings: { language: 'es' } });
    ({ player: ana } = await svc.joinSession(session.id, { name: 'Ana' }));
    ({ player: beto } = await svc.joinSession(session.id, { name: 'Beto' }));
    session.isActive = true;
  });

  it('si la IA falla al cerrar ronda, las acciones quedan y retryNarration narra', async () => {
    svc.aiService.generateStoryNarrative.mockRejectedValueOnce(new Error('boom'));
    await svc.submitAction(session.id, ana.id, 'a1');
    await expect(svc.submitAction(session.id, beto.id, 'a2')).rejects.toThrow();
    svc.aiService.generateStoryNarrative.mockResolvedValueOnce('Ahora sí');
    const r = await svc.retryNarration(session.id);
    expect(r.narrative).toBe('Ahora sí');
    expect(session.storyHistory.filter(e => e.type === 'player_action')).toHaveLength(2);
  });

  it('joinSession con nombre existente retorna el mismo jugador (reentrada)', async () => {
    const again = await svc.joinSession(session.id, { name: 'ana' }); // case-insensitive
    expect(again.player.id).toBe(ana.id);
    expect(session.players).toHaveLength(2);
  });

  it('skipTurn avanza el turno y narra si con el salto se cierra la ronda', async () => {
    svc.aiService.generateStoryNarrative.mockResolvedValueOnce('Narración del salto');
    await svc.submitAction(session.id, ana.id, 'a1');
    const r = await svc.skipTurn(session.id); // se salta a beto → cierra ronda
    expect(r.roundComplete).toBe(true);
    expect(r.narrative).toBe('Narración del salto');
    expect(session.turnNumber).toBe(2); // arrancó en 1 (inicial) + 1 por cierre de ronda
  });
});
