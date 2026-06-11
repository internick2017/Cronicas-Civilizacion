import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NarrativeService } from '../src/services/NarrativeService.js';

describe('apertura y epílogo', () => {
  let svc, session;
  beforeEach(async () => {
    svc = new NarrativeService({ skipDatabase: true });
    svc.aiService = {
      generateStoryNarrative: vi.fn().mockResolvedValue('texto'),
      generateOpening: vi.fn().mockResolvedValue('Había una vez...'),
      generateEpilogue: vi.fn().mockResolvedValue('Y colorín colorado...'),
    };
    session = await svc.createSession({ title: 'T', settings: { language: 'es', genre: 'fantasy' } });
    await svc.joinSession(session.id, { name: 'Ana' });
    await svc.joinSession(session.id, { name: 'Beto' });
  });

  it('startSession activa la sesión y agrega la introducción de la IA', async () => {
    const r = await svc.startSession(session.id);
    expect(session.isActive).toBe(true);
    expect(r.opening).toBe('Había una vez...');
    expect(session.storyHistory[0].type).toBe('ai_narrative');
  });

  it('startSession exige mínimo 2 jugadores', async () => {
    const solo = await svc.createSession({ title: 'S' });
    await svc.joinSession(solo.id, { name: 'Ana' });
    await expect(svc.startSession(solo.id)).rejects.toThrow(/2 jugadores/);
  });

  it('endSession genera epílogo y desactiva', async () => {
    await svc.startSession(session.id);
    const r = await svc.endSession(session.id);
    expect(r.epilogue).toBe('Y colorín colorado...');
    expect(session.isActive).toBe(false);
    const last = session.storyHistory.at(-1);
    expect(last.type).toBe('ai_epilogue');
  });
});
