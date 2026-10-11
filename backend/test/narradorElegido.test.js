import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NarrativeService } from '../src/services/NarrativeService.js';
import { StorySession } from '../src/models/StorySession.js';

function crearIA(sobrescribe = {}) {
  return {
    generateStoryNarrative: vi.fn().mockResolvedValue('Texto de Gemini'),
    generateOpening: vi.fn().mockResolvedValue('Apertura de Gemini'),
    generateEpilogue: vi.fn().mockResolvedValue('Epílogo de Gemini'),
    generateSummary: vi.fn().mockResolvedValue('Resumen de Gemini'),
    ...sobrescribe,
  };
}

async function partida(settings = {}, ia = crearIA()) {
  const svc = new NarrativeService({ skipDatabase: true });
  svc.aiService = ia;
  const session = await svc.createSession({ title: 'T', settings: { language: 'es', genre: 'fantasy', ...settings } });
  const { player: ana } = await svc.joinSession(session.id, { name: 'Ana' });
  const { player: beto } = await svc.joinSession(session.id, { name: 'Beto' });
  return { svc, session, ana, beto, ia };
}

describe('el ajuste "narrador" de la sesión', () => {
  it('por defecto es local, y una partida guardada sin el ajuste se lee como local', () => {
    expect(new StorySession().settings.narrador).toBe('local');
    expect(new StorySession({ settings: { genre: 'mystery' } }).settings.narrador).toBe('local');
  });

  it('solo "gemini" activa Gemini; cualquier otro valor es local', () => {
    expect(new StorySession({ settings: { narrador: 'gemini' } }).settings.narrador).toBe('gemini');
    expect(new StorySession({ settings: { narrador: 'otra-cosa' } }).settings.narrador).toBe('local');
  });

  it('cambiar los ajustes después tampoco deja pasar un valor inválido', async () => {
    const { svc, session } = await partida();
    await svc.updateSessionSettings(session.id, { narrador: 'basura' });
    expect(session.settings.narrador).toBe('local');
    await svc.updateSessionSettings(session.id, { narrador: 'gemini' });
    expect(session.settings.narrador).toBe('gemini');
  });
});

describe('narrador local (el principal)', () => {
  let svc, session, ana, beto, ia;
  beforeEach(async () => { ({ svc, session, ana, beto, ia } = await partida()); });

  it('la apertura nombra a los protagonistas y no llama a Gemini', async () => {
    const r = await svc.startSession(session.id);
    expect(ia.generateOpening).not.toHaveBeenCalled();
    expect(r.opening).toContain('Ana');
    expect(r.opening).toContain('Beto');
  });

  it('la ronda se narra con lo que escribieron los jugadores y sin Gemini', async () => {
    await svc.startSession(session.id);
    await svc.submitAction(session.id, ana.id, 'Exploro la cueva');
    const r = await svc.submitAction(session.id, beto.id, 'Enciendo una antorcha');
    expect(r.narrative).toContain('Exploro la cueva');
    expect(r.narrative).toContain('Enciendo una antorcha');
    expect(ia.generateStoryNarrative).not.toHaveBeenCalled();
    expect(ia.generateSummary).not.toHaveBeenCalled();
    expect(session.turnNumber).toBe(2);
  });

  it('la ronda siguiente recuerda lo que alguien hizo en la anterior', async () => {
    await svc.startSession(session.id);
    await svc.submitAction(session.id, ana.id, 'Robo la llave del castillo');
    await svc.submitAction(session.id, beto.id, 'Vigilo la puerta');
    await svc.submitAction(session.id, ana.id, 'Abro el portón');
    const r = await svc.submitAction(session.id, beto.id, 'Corro hacia el bosque');
    expect(r.narrative).toMatch(/Robo la llave del castillo|Vigilo la puerta/);
  });

  it('el epílogo recuerda lo último que hizo cada personaje y no llama a Gemini', async () => {
    await svc.startSession(session.id);
    await svc.submitAction(session.id, ana.id, 'Exploro la cueva');
    await svc.submitAction(session.id, beto.id, 'Enciendo una antorcha');
    const r = await svc.endSession(session.id);
    expect(ia.generateEpilogue).not.toHaveBeenCalled();
    expect(r.epilogue).toContain('Exploro la cueva');
    expect(r.epilogue).toContain('Enciendo una antorcha');
    expect(session.isActive).toBe(false);
  });
});

describe('narrador Gemini (opcional)', () => {
  it('usa a Gemini para la apertura, la ronda, el resumen y el epílogo', async () => {
    const { svc, session, ana, beto, ia } = await partida({ narrador: 'gemini' });
    const apertura = await svc.startSession(session.id);
    expect(apertura.opening).toBe('Apertura de Gemini');
    await svc.submitAction(session.id, ana.id, 'Exploro la cueva');
    const r = await svc.submitAction(session.id, beto.id, 'Enciendo una antorcha');
    expect(r.narrative).toBe('Texto de Gemini');
    expect(ia.generateSummary).toHaveBeenCalled();
    expect((await svc.endSession(session.id)).epilogue).toBe('Epílogo de Gemini');
  });

  it('si Gemini no responde (null), narra el local con lo que escribieron', async () => {
    const ia = crearIA({
      generateStoryNarrative: vi.fn().mockResolvedValue(null),
      generateOpening: vi.fn().mockResolvedValue(null),
      generateEpilogue: vi.fn().mockResolvedValue(null),
    });
    const { svc, session, ana, beto } = await partida({ narrador: 'gemini' }, ia);
    expect((await svc.startSession(session.id)).opening).toContain('Ana');
    await svc.submitAction(session.id, ana.id, 'Exploro la cueva');
    const r = await svc.submitAction(session.id, beto.id, 'Enciendo una antorcha');
    expect(r.narrative).toContain('Exploro la cueva');
    expect((await svc.endSession(session.id)).epilogue).toContain('Enciendo una antorcha');
  });

  it('si Gemini falla con error, la ronda igual se cierra con el narrador local', async () => {
    const ia = crearIA({ generateStoryNarrative: vi.fn().mockRejectedValue(new Error('cuota agotada')) });
    const { svc, session, ana, beto } = await partida({ narrador: 'gemini' }, ia);
    await svc.startSession(session.id);
    await svc.submitAction(session.id, ana.id, 'Exploro la cueva');
    const r = await svc.submitAction(session.id, beto.id, 'Enciendo una antorcha');
    expect(r.narrative).toContain('Exploro la cueva');
    expect(session.turnNumber).toBe(2);
  });
});
