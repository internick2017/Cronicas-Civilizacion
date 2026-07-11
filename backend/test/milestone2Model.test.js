import { describe, it, expect, beforeEach } from 'vitest';
import { NarrativeService } from '../src/services/NarrativeService.js';

describe('M2 — mode, maxRounds y summary en el modelo', () => {
  let svc;
  beforeEach(() => { svc = new NarrativeService({ skipDatabase: true }); });

  it('createSession defaultea mode narrador-activo y maxRounds null (Libre)', async () => {
    const s = await svc.createSession({ title: 'T' });
    expect(s.settings.mode).toBe('narrador-activo');
    expect(s.settings.maxRounds).toBeNull();
  });

  it('createSession normaliza mode y maxRounds inválidos', async () => {
    const s = await svc.createSession({
      title: 'T', settings: { mode: 'cualquiercosa', maxRounds: 9999 },
    });
    expect(s.settings.mode).toBe('narrador-activo');
    expect(s.settings.maxRounds).toBeNull();
    const s2 = await svc.createSession({
      title: 'T2', settings: { mode: 'colaborativo', maxRounds: 8 },
    });
    expect(s2.settings.mode).toBe('colaborativo');
    expect(s2.settings.maxRounds).toBe(8);
  });

  it('summary arranca vacío y toJSON expone summary y roundsRemaining', async () => {
    const s = await svc.createSession({ title: 'T', settings: { maxRounds: 8 } });
    expect(s.summary).toBe('');
    const json = s.toJSON();
    expect(json.summary).toBe('');
    expect(json.roundsRemaining).toBe(8); // turnNumber inicial 1 → 8-1+1
    const libre = await svc.createSession({ title: 'L' });
    expect(libre.toJSON().roundsRemaining).toBeNull();
  });
});
