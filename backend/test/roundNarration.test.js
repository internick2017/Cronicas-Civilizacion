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

  it('un doble envío del mismo jugador no cierra la ronda (guard re-entrante)', async () => {
    // simular la carrera: dos submits del mismo jugador casi simultáneos
    const p1 = svc.submitAction(session.id, ana.id, 'accion uno');
    const p2 = svc.submitAction(session.id, ana.id, 'accion uno otra vez');
    const results = await Promise.allSettled([p1, p2]);
    const fulfilled = results.filter(r => r.status === 'fulfilled');
    const rejected = results.filter(r => r.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(svc.aiService.generateStoryNarrative).not.toHaveBeenCalled();
    expect(session.players[session.currentPlayerIndex].id).toBe(beto.id);
  });

  it('el prompt usa el nombre guardado aunque el jugador haya salido', async () => {
    await svc.submitAction(session.id, ana.id, 'Exploro');
    session.players = session.players.filter(p => p.id !== ana.id); // ana se va
    // beto era el único restante: su submit cierra la ronda
    session.currentPlayerIndex = 0; // beto pasa a ser el actual tras el filtro
    await svc.submitAction(session.id, beto.id, 'Sigo solo');
    const prompt = svc.aiService.generateStoryNarrative.mock.calls[0][0];
    expect(prompt).toContain('Ana: Exploro');
    expect(prompt).not.toContain('undefined');
  });

  it('una falla de la IA al cerrar ronda lleva el codigo AI_NARRATION_FAILED', async () => {
    svc.aiService.generateStoryNarrative.mockRejectedValueOnce(new Error('boom'));
    await svc.submitAction(session.id, ana.id, 'a1');
    await expect(svc.submitAction(session.id, beto.id, 'a2'))
      .rejects.toMatchObject({ code: 'AI_NARRATION_FAILED' });
  });
});
