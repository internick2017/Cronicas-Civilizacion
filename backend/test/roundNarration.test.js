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

  // Este test afirmaba lo contrario: que una falla de la IA relanzaba
  // AI_NARRATION_FAILED. Con la cuota del plan gratuito agotada eso dejaba la
  // ronda sin cerrar y la partida trabada para siempre. Decision tomada con el
  // usuario: mejor una narracion mas pobre que una partida detenida.
  it('una falla de la IA no traba la ronda: cierra con el narrador local', async () => {
    svc.aiService.generateStoryNarrative.mockRejectedValueOnce(new Error('boom'));
    await svc.submitAction(session.id, ana.id, 'a1');

    const turnoAntes = session.turnNumber;
    await expect(svc.submitAction(session.id, beto.id, 'a2')).resolves.toBeDefined();

    expect(session.turnNumber).toBeGreaterThan(turnoAntes);
    const ultima = session.storyHistory.filter(e => e.type === 'ai_narrative').at(-1);
    expect(ultima.narrative.length).toBeGreaterThan(0);
  });

  it('el prompt de ronda incluye el inicio de la historia y las narraciones recientes', async () => {
    session.addAINarrative('Apertura: érase una vez en Eldoria');
    session.addAINarrative('Narración intermedia 1');
    await svc.submitAction(session.id, ana.id, 'a1');
    await svc.submitAction(session.id, beto.id, 'a2');
    const prompt = svc.aiService.generateStoryNarrative.mock.calls[0][0];
    expect(prompt).toContain('érase una vez en Eldoria');
    expect(prompt).toContain('Narración intermedia 1');
  });

  it('el prompt de ronda etiqueta el contexto como ya narrado y ordena continuar solo la ronda nueva', async () => {
    session.addAINarrative('Apertura: érase una vez en Eldoria');
    await svc.submitAction(session.id, ana.id, 'a1');
    await svc.submitAction(session.id, beto.id, 'a2');
    const prompt = svc.aiService.generateStoryNarrative.mock.calls[0][0];
    expect(prompt).toContain('NO lo repitas');
  });
});

describe('roundPending — detección de rondas atascadas', () => {
  let svc, session, ana, beto;

  beforeEach(async () => {
    svc = new NarrativeService({ skipDatabase: true });
    svc.aiService = { generateStoryNarrative: vi.fn().mockResolvedValue('La ronda épica...') };
    session = await svc.createSession({ title: 'Test', settings: { language: 'es', genre: 'fantasy' } });
    ({ player: ana } = await svc.joinSession(session.id, { name: 'Ana' }));
    ({ player: beto } = await svc.joinSession(session.id, { name: 'Beto' }));
    session.isActive = true;
  });

  // Antes esta ronda atascada se fabricaba haciendo fallar a la IA. Ya no sirve:
  // una falla de la IA cierra la ronda con el narrador local. roundPending
  // sigue existiendo para cualquier OTRA razon por la que una ronda quede con
  // acciones y sin narrativa (por ejemplo un fallo al guardar en la base), asi
  // que se prueba sobre el estado directamente, que es lo que la funcion mira.
  it('roundPending es true cuando todos actuaron y no hay narrativa de esa ronda', async () => {
    await svc.submitAction(session.id, ana.id, 'a1');
    await svc.submitAction(session.id, beto.id, 'a2');

    // Se quita la narrativa de la ronda, dejando el estado "atascado".
    session.storyHistory = session.storyHistory.filter(e => e.type !== 'ai_narrative');
    session.turnNumber -= 1;
    session.currentPlayerIndex = 0;

    expect(session.toJSON().roundPending).toBe(true);
  });

  it('roundPending es false en una ronda normal a medias y tras narrar', async () => {
    expect(session.toJSON().roundPending).toBe(false);
    await svc.submitAction(session.id, ana.id, 'a1');
    expect(session.toJSON().roundPending).toBe(false); // falta beto
    svc.aiService.generateStoryNarrative.mockResolvedValueOnce('narrado');
    await svc.submitAction(session.id, beto.id, 'a2');
    expect(session.toJSON().roundPending).toBe(false); // ya narrada
  });

  // Lo que este test protege: una narrativa de APERTURA lleva el mismo
  // turnNumber que las acciones de la primera ronda, y no debe confundirse con
  // la narrativa de la ronda. Por eso isRoundPending mira si hay narrativa
  // DESPUES de la ultima accion, no si hay alguna en ese turno.
  it('roundPending es true aun con apertura en el mismo turnNumber', () => {
    session.addAINarrative('apertura');
    session.addPlayerAction(ana.id, 'Ana', 'Alba', 'a1');
    session.addPlayerAction(beto.id, 'Beto', 'Beto', 'a2');
    session.currentPlayerIndex = 0;

    expect(session.toJSON().roundPending).toBe(true);
  });
});
