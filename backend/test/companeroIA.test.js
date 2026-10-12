import { describe, it, expect, vi } from 'vitest';
import { NarrativeService } from '../src/services/NarrativeService.js';

const ia = () => ({
  generateStoryNarrative: vi.fn().mockResolvedValue(null),
  generateOpening: vi.fn().mockResolvedValue(null),
  generateEpilogue: vi.fn().mockResolvedValue(null),
  generateSummary: vi.fn().mockResolvedValue(null),
});

// Crea la historia con el compañero y mete a los humanos; devuelve todo lo necesario.
async function partida({ settings = {}, humanos = ['Ana'] } = {}) {
  const svc = new NarrativeService({ skipDatabase: true });
  svc.aiService = ia();
  const session = await svc.createSession({ title: 'T', settings: { language: 'es', genre: 'fantasy', companeroIA: true, ...settings } });
  const jugadores = [];
  for (const nombre of humanos) jugadores.push((await svc.joinSession(session.id, { name: nombre })).player);
  const botDe = () => session.players.find(p => p.id === session.settings.companeroId);
  return { svc, session, jugadores, botDe };
}

const accionesDe = (session, jugadorId, ronda) =>
  session.storyHistory.filter(e => e.type === 'player_action' && e.playerId === jugadorId && e.turnNumber === ronda);

describe('el compañero automático: alta', () => {
  it('con la opción prendida entra como un jugador más, marcado en los ajustes', async () => {
    const { session, botDe } = await partida({ humanos: [] });
    expect(session.players).toHaveLength(1);
    expect(botDe().name).toBe('La Máquina');
    expect(session.settings.companeroIA).toBe(true);
  });

  it('sin la opción no hay compañero (y una sesión vieja tampoco lo trae)', async () => {
    const { session } = await partida({ settings: { companeroIA: false }, humanos: ['Ana'] });
    expect(session.players).toHaveLength(1);
    expect(session.settings.companeroId).toBeUndefined();
  });

  it('un humano solo alcanza para empezar, y el compañero juega siempre al final', async () => {
    const { svc, session, botDe } = await partida({ humanos: ['Ana'] });
    expect(session.players[0].id).toBe(botDe().id); // entró primero
    await svc.startSession(session.id);
    expect(session.players.map(p => p.name)).toEqual(['Ana', 'La Máquina']);
    expect(session.players.map(p => p.turnOrder)).toEqual([0, 1]);
  });
});

describe('el compañero automático: reacciona a lo narrado', () => {
  it('su acción se mete con el hallazgo o el peligro que dijo el narrador en la ronda anterior', async () => {
    const { svc, session, jugadores, botDe } = await partida({ humanos: ['Ana'] });
    await svc.startSession(session.id);
    const r1 = await svc.submitAction(session.id, jugadores[0].id, 'Exploro la cueva');
    await svc.submitAction(session.id, jugadores[0].id, 'Sigo explorando');
    // El hallazgo va primero: si la narración trae los dos, el compañero se queda con el hallazgo.
    const vocabulario = ['runa antigua que late', 'cofre de piedra grabado', 'sendero oculto que brilla',
      'rugido sacude las montañas', 'sombra con alas cubre el cielo', 'encapuchados bloquea el camino'];
    const narracionRonda1 = r1.narrative.toLowerCase();
    const mencionado = vocabulario.find(f => narracionRonda1.includes(f));
    expect(mencionado, 'la narración de la ronda 1 debería traer un peligro o hallazgo').toBeTruthy();
    const accionRonda2 = accionesDe(session, botDe().id, 2)[0].action.toLowerCase();
    expect(accionRonda2).toContain(mencionado);
  });
});

describe('el compañero automático: por turnos', () => {
  it('juega justo después del humano y cierra la ronda: la respuesta ya trae la narración', async () => {
    const { svc, session, jugadores, botDe } = await partida({ humanos: ['Ana'] });
    await svc.startSession(session.id);
    const r = await svc.submitAction(session.id, jugadores[0].id, 'Exploro la cueva');
    expect(r.narrative).toContain('Exploro la cueva');
    expect(r.roundComplete).toBe(true);
    expect(r.turnNumber).toBe(2);
    expect(r.nextPlayer.name).toBe('Ana');
    const lioDelBot = accionesDe(session, botDe().id, 1);
    expect(lioDelBot).toHaveLength(1);
    expect(r.narrative).toContain(lioDelBot[0].action);
  });

  it('con dos humanos, el compañero espera a que ambos jueguen', async () => {
    const { svc, session, jugadores, botDe } = await partida({ humanos: ['Ana', 'Beto'] });
    await svc.startSession(session.id);
    const primera = await svc.submitAction(session.id, jugadores[0].id, 'Exploro la cueva');
    expect(primera.narrative).toBeNull();
    expect(primera.nextPlayer.name).toBe('Beto');
    expect(accionesDe(session, botDe().id, 1)).toHaveLength(0);
    const segunda = await svc.submitAction(session.id, jugadores[1].id, 'Enciendo una antorcha');
    expect(segunda.narrative).toBeTruthy();
    expect(accionesDe(session, botDe().id, 1)).toHaveLength(1);
  });

  it('nunca juega dos veces en la misma ronda y sigue ronda tras ronda', async () => {
    const { svc, session, jugadores, botDe } = await partida({ humanos: ['Ana'] });
    await svc.startSession(session.id);
    for (let ronda = 1; ronda <= 4; ronda++) {
      await svc.submitAction(session.id, jugadores[0].id, `Avanzo en la ronda ${ronda}`);
      expect(accionesDe(session, botDe().id, ronda)).toHaveLength(1);
    }
    expect(session.turnNumber).toBe(5);
  });

  it('al saltar el turno de un humano, le toca al compañero y la ronda se cierra', async () => {
    const { svc, session, jugadores, botDe } = await partida({ humanos: ['Ana', 'Beto'] });
    await svc.startSession(session.id);
    await svc.submitAction(session.id, jugadores[0].id, 'Exploro la cueva');
    const r = await svc.skipTurn(session.id); // se salta a Beto
    expect(r.roundComplete).toBe(true);
    expect(r.narrative).toBeTruthy();
    expect(accionesDe(session, botDe().id, 1)).toHaveLength(1);
  });

  it('en la última ronda la historia termina con epílogo aunque cierre el compañero', async () => {
    const { svc, session, jugadores } = await partida({ settings: { maxRounds: 3 }, humanos: ['Ana'] });
    await svc.startSession(session.id);
    let ultimo;
    for (let i = 0; i < 3; i++) ultimo = await svc.submitAction(session.id, jugadores[0].id, `Acción ${i}`);
    expect(ultimo.sessionEnded).toBe(true);
    expect(session.isActive).toBe(false);
  });
});

describe('el compañero automático: simultáneo', () => {
  it('ya jugó cuando se abre la ronda; el humano la cierra y el compañero se adelanta en la siguiente', async () => {
    const { svc, session, jugadores, botDe } = await partida({ settings: { turnMode: 'simultaneous' }, humanos: ['Ana'] });
    await svc.startSession(session.id);
    expect(accionesDe(session, botDe().id, 1)).toHaveLength(1);
    const r = await svc.submitAction(session.id, jugadores[0].id, 'Exploro la cueva');
    expect(r.narrative).toContain('Exploro la cueva');
    expect(session.turnNumber).toBe(2);
    expect(accionesDe(session, botDe().id, 2)).toHaveLength(1);
  });
});

describe('el compañero automático: salidas', () => {
  it('si se van todos los humanos, la historia se cierra (la máquina no juega sola)', async () => {
    const { svc, session, jugadores } = await partida({ humanos: ['Ana'] });
    await svc.startSession(session.id);
    await svc.leaveSession(session.id, jugadores[0].id);
    expect(session.isActive).toBe(false);
  });
});
