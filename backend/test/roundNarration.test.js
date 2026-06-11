import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NarrativeService } from '../src/services/NarrativeService.js';

describe('narración por cierre de ronda', () => {
  let svc, session, ana, beto;

  beforeEach(async () => {
    svc = new NarrativeService({ skipDatabase: true });
    svc.aiService = { generateStoryNarrative: vi.fn().mockResolvedValue('La ronda épica...') };
    session = await svc.createSession({ title: 'Test', settings: { language: 'es', genre: 'fantasy' } });
    ({ player: ana } = await svc.joinSession(session.id, { name: 'Ana' }));
    ({ player: beto } = await svc.joinSession(session.id, { name: 'Beto' }));
    session.isActive = true; // partida iniciada
  });

  it('la primera acción de la ronda NO dispara narración', async () => {
    const r = await svc.submitAction(session.id, ana.id, 'Exploro la cueva');
    expect(r.narrative).toBeNull();
    expect(svc.aiService.generateStoryNarrative).not.toHaveBeenCalled();
    expect(r.nextPlayer.id).toBe(beto.id);
  });

  it('la última acción cierra la ronda: narra con TODAS las acciones y avanza turnNumber', async () => {
    await svc.submitAction(session.id, ana.id, 'Exploro la cueva');
    const before = session.turnNumber;
    const r = await svc.submitAction(session.id, beto.id, 'Enciendo una antorcha');
    expect(r.narrative).toBe('La ronda épica...');
    const prompt = svc.aiService.generateStoryNarrative.mock.calls[0][0];
    expect(prompt).toContain('Exploro la cueva');
    expect(prompt).toContain('Enciendo una antorcha');
    expect(session.turnNumber).toBe(before + 1);
  });

  it('rechaza acciones fuera de turno', async () => {
    await expect(svc.submitAction(session.id, beto.id, 'me cuelo'))
      .rejects.toThrow(/turno/i);
  });
});
