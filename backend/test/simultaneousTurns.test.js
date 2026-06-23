import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NarrativeService } from '../src/services/NarrativeService.js';

function mockAi(svc) {
  svc.aiService = {
    generateStoryNarrative: vi.fn().mockResolvedValue('narración'),
    generateSummary: vi.fn().mockResolvedValue('sinopsis'),
    generateEpilogue: vi.fn().mockResolvedValue('epílogo'),
    generateOpening: vi.fn().mockResolvedValue('apertura'),
  };
}

async function makeSession(svc, settings = {}) {
  const session = await svc.createSession({ title: 'T', settings: { language: 'es', ...settings } });
  const { player: ana } = await svc.joinSession(session.id, { name: 'Ana' });
  const { player: beto } = await svc.joinSession(session.id, { name: 'Beto' });
  const { player: cris } = await svc.joinSession(session.id, { name: 'Cris' });
  session.isActive = true;
  return { session, ana, beto, cris };
}

describe('turnMode setting', () => {
  let svc;
  beforeEach(() => { svc = new NarrativeService({ skipDatabase: true }); mockAi(svc); });

  it('por defecto es sequential', async () => {
    const s = await svc.createSession({ title: 'T', settings: { language: 'es' } });
    expect(s.settings.turnMode).toBe('sequential');
  });

  it('acepta simultaneous', async () => {
    const s = await svc.createSession({ title: 'T', settings: { turnMode: 'simultaneous' } });
    expect(s.settings.turnMode).toBe('simultaneous');
  });

  it('un turnMode inválido cae a sequential', async () => {
    const s = await svc.createSession({ title: 'T', settings: { turnMode: 'loquesea' } });
    expect(s.settings.turnMode).toBe('sequential');
  });
});
