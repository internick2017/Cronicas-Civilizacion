// backend/test/milestone2Round.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NarrativeService } from '../src/services/NarrativeService.js';

async function makeSession(svc, settings = {}) {
  const session = await svc.createSession({ title: 'T', settings: { language: 'es', ...settings } });
  const { player: ana } = await svc.joinSession(session.id, { name: 'Ana' });
  const { player: beto } = await svc.joinSession(session.id, { name: 'Beto' });
  session.isActive = true;
  return { session, ana, beto };
}

async function playRound(svc, session, ana, beto) {
  await svc.submitAction(session.id, ana.id, 'a');
  return await svc.submitAction(session.id, beto.id, 'b');
}

describe('M2 — closeRound con resumen, arcos y epílogo automático', () => {
  let svc;
  beforeEach(() => {
    svc = new NarrativeService({ skipDatabase: true });
    svc.aiService = {
      generateStoryNarrative: vi.fn().mockResolvedValue('narración'),
      generateSummary: vi.fn().mockResolvedValue('sinopsis actualizada'),
      generateEpilogue: vi.fn().mockResolvedValue('epílogo'),
      generateOpening: vi.fn().mockResolvedValue('apertura'),
    };
  });

  it('actualiza el summary tras cerrar la ronda', async () => {
    const { session, ana, beto } = await makeSession(svc);
    await playRound(svc, session, ana, beto);
    expect(svc.aiService.generateSummary).toHaveBeenCalledWith('', 'narración',
      expect.objectContaining({ language: 'es' }));
    expect(session.summary).toBe('sinopsis actualizada');
  });

  it('si el resumen falla, se conserva el anterior y la ronda NO falla', async () => {
    const { session, ana, beto } = await makeSession(svc);
    session.summary = 'resumen previo';
    svc.aiService.generateSummary.mockRejectedValueOnce(new Error('boom'));
    const r = await playRound(svc, session, ana, beto);
    expect(r.narrative).toBe('narración');
    expect(session.summary).toBe('resumen previo');
  });

  it('con summary presente, el prompt de ronda usa el resumen (no el inicio completo)', async () => {
    const { session, ana, beto } = await makeSession(svc);
    session.summary = 'LA SINOPSIS';
    session.addAINarrative('apertura vieja');
    await playRound(svc, session, ana, beto);
    const prompt = svc.aiService.generateStoryNarrative.mock.calls[0][0];
    expect(prompt).toContain('LA SINOPSIS');
    expect(prompt).not.toContain('apertura vieja');
  });

  it('agrega la instrucción de cierre de arcos cuando quedan <= 2 rondas', async () => {
    const { session, ana, beto } = await makeSession(svc, { maxRounds: 8 });
    session.turnNumber = 7; // roundsRemaining = 2
    await playRound(svc, session, ana, beto);
    const prompt = svc.aiService.generateStoryNarrative.mock.calls[0][0];
    expect(prompt).toContain('arcos');
  });

  it('NO agrega cierre de arcos lejos del final', async () => {
    const { session, ana, beto } = await makeSession(svc, { maxRounds: 8 });
    await playRound(svc, session, ana, beto); // turnNumber 1 → remaining 8
    const prompt = svc.aiService.generateStoryNarrative.mock.calls[0][0];
    expect(prompt).not.toContain('ATENCIÓN');
  });

  it('al completarse la última ronda genera el epílogo automáticamente y desactiva', async () => {
    const { session, ana, beto } = await makeSession(svc, { maxRounds: 3 });
    session.turnNumber = 3; // jugando la última ronda
    const r = await playRound(svc, session, ana, beto);
    expect(svc.aiService.generateEpilogue).toHaveBeenCalled();
    expect(session.isActive).toBe(false);
    expect(session.storyHistory.at(-1).type).toBe('ai_epilogue');
    expect(r.sessionEnded).toBe(true);
  });

  it('NO genera epílogo antes de la última ronda', async () => {
    const { session, ana, beto } = await makeSession(svc, { maxRounds: 3 });
    session.turnNumber = 2;
    const r = await playRound(svc, session, ana, beto);
    expect(svc.aiService.generateEpilogue).not.toHaveBeenCalled();
    expect(session.isActive).toBe(true);
    expect(r.sessionEnded).toBeUndefined();
  });

  it('pasa el modo de la sesión a la IA', async () => {
    const { session, ana, beto } = await makeSession(svc, { mode: 'narrador-activo' });
    await playRound(svc, session, ana, beto);
    const opts = svc.aiService.generateStoryNarrative.mock.calls[0][1];
    expect(opts.mode).toBe('narrador-activo');
  });

  it('una ronda completa de skips en la última ronda también dispara el epílogo', async () => {
    const { session } = await makeSession(svc, { maxRounds: 3 });
    session.turnNumber = 3;
    await svc.skipTurn(session.id); // salta a beto
    const r = await svc.skipTurn(session.id); // cierra ronda sin acciones
    expect(r.sessionEnded).toBe(true);
    expect(session.isActive).toBe(false);
  });

  it('retryNarration en la última ronda dispara el epílogo automático', async () => {
    const { session, ana, beto } = await makeSession(svc, { maxRounds: 3 });
    session.turnNumber = 3;
    svc.aiService.generateStoryNarrative.mockRejectedValueOnce(new Error('boom'));
    await svc.submitAction(session.id, ana.id, 'a');
    await expect(svc.submitAction(session.id, beto.id, 'b')).rejects.toThrow();
    svc.aiService.generateStoryNarrative.mockResolvedValueOnce('final');
    const r = await svc.retryNarration(session.id);
    expect(r.sessionEnded).toBe(true);
    expect(session.isActive).toBe(false);
    expect(svc.aiService.generateEpilogue).toHaveBeenCalled();
  });
});
