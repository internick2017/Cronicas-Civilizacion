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

describe('helpers de envíos del modelo', () => {
  let svc;
  beforeEach(() => { svc = new NarrativeService({ skipDatabase: true }); mockAi(svc); });

  it('actedPlayerIds / hasActed / allActed reflejan los envíos de la ronda', async () => {
    const { session, ana, beto, cris } = await makeSession(svc, { turnMode: 'simultaneous' });
    expect(session.actedPlayerIds()).toEqual([]);
    expect(session.allActed()).toBe(false);
    expect(session.hasActed(ana.id)).toBe(false);

    session.addPlayerAction(ana.id, 'a');
    expect(session.hasActed(ana.id)).toBe(true);
    expect(session.hasActed(beto.id)).toBe(false);
    expect(session.allActed()).toBe(false);

    session.addPlayerAction(beto.id, 'b');
    session.addPlayerAction(cris.id, 'c');
    expect(session.allActed()).toBe(true);
    expect(session.toJSON().actedPlayerIds.sort()).toEqual([ana.id, beto.id, cris.id].sort());
  });

  it('actedPlayerIds solo cuenta la ronda actual', async () => {
    const { session, ana } = await makeSession(svc, { turnMode: 'simultaneous' });
    session.addPlayerAction(ana.id, 'vieja');
    session.turnNumber = 2;
    expect(session.actedPlayerIds()).toEqual([]);
  });
});

describe('submitAction simultáneo', () => {
  let svc;
  beforeEach(() => { svc = new NarrativeService({ skipDatabase: true }); mockAi(svc); });

  it('cualquier jugador puede enviar sin esperar orden', async () => {
    const { session, beto } = await makeSession(svc, { turnMode: 'simultaneous' });
    // beto (índice 1) envía primero sin error
    const r = await svc.submitAction(session.id, beto.id, 'acción de beto');
    expect(r.roundComplete).toBe(false);
  });

  it('bloquea reenvío del mismo jugador en la ronda', async () => {
    const { session, ana } = await makeSession(svc, { turnMode: 'simultaneous' });
    await svc.submitAction(session.id, ana.id, 'una');
    await expect(svc.submitAction(session.id, ana.id, 'otra')).rejects.toThrow(/Ya enviaste/);
  });

  it('NO cierra la ronda hasta que todos enviaron; cierra al último', async () => {
    const { session, ana, beto, cris } = await makeSession(svc, { turnMode: 'simultaneous' });
    expect((await svc.submitAction(session.id, ana.id, 'a')).roundComplete).toBe(false);
    expect((await svc.submitAction(session.id, beto.id, 'b')).roundComplete).toBe(false);
    expect(svc.aiService.generateStoryNarrative).not.toHaveBeenCalled();
    const r = await svc.submitAction(session.id, cris.id, 'c');
    expect(r.roundComplete).toBe(true);
    expect(r.narrative).toBe('narración');
    expect(svc.aiService.generateStoryNarrative).toHaveBeenCalledTimes(1);
    expect(session.turnNumber).toBe(2);
  });

  it('el prompt de cierre incluye las acciones de todos', async () => {
    const { session, ana, beto, cris } = await makeSession(svc, { turnMode: 'simultaneous' });
    await svc.submitAction(session.id, ana.id, 'AAA');
    await svc.submitAction(session.id, beto.id, 'BBB');
    await svc.submitAction(session.id, cris.id, 'CCC');
    const prompt = svc.aiService.generateStoryNarrative.mock.calls[0][0];
    expect(prompt).toContain('AAA');
    expect(prompt).toContain('BBB');
    expect(prompt).toContain('CCC');
  });
});

describe('closeRoundNow (cierre forzado)', () => {
  let svc;
  beforeEach(() => { svc = new NarrativeService({ skipDatabase: true }); mockAi(svc); });

  it('con acciones parciales narra con lo que haya', async () => {
    const { session, ana } = await makeSession(svc, { turnMode: 'simultaneous' });
    await svc.submitAction(session.id, ana.id, 'solo ana'); // beto y cris no enviaron
    const r = await svc.closeRoundNow(session.id);
    expect(r.narrative).toBe('narración');
    expect(svc.aiService.generateStoryNarrative).toHaveBeenCalledTimes(1);
    expect(session.turnNumber).toBe(2);
  });

  it('sin acciones solo avanza el turnNumber sin narrar', async () => {
    const { session } = await makeSession(svc, { turnMode: 'simultaneous' });
    const r = await svc.closeRoundNow(session.id);
    expect(r.narrative).toBeNull();
    expect(svc.aiService.generateStoryNarrative).not.toHaveBeenCalled();
    expect(session.turnNumber).toBe(2);
  });

  it('es idempotente: no narra dos veces el mismo turno', async () => {
    const { session, ana, beto, cris } = await makeSession(svc, { turnMode: 'simultaneous' });
    await svc.submitAction(session.id, ana.id, 'a');
    await svc.submitAction(session.id, beto.id, 'b');
    await svc.submitAction(session.id, cris.id, 'c'); // ya cerró → turnNumber 2
    svc.aiService.generateStoryNarrative.mockClear();
    const r = await svc.closeRoundNow(session.id); // turno 2 sin acciones
    expect(r.narrative).toBeNull();
    expect(svc.aiService.generateStoryNarrative).not.toHaveBeenCalled();
  });
});
