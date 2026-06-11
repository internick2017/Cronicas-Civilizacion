import { describe, it, expect, beforeEach } from 'vitest';
import { NarrativeService } from '../src/services/NarrativeService.js';

// El servicio funciona en memoria y persiste async a DB; para unit tests
// instanciamos sin DB (persistencia se prueba a mano en el E2E).
describe('códigos de sala en sesiones', () => {
  let svc;
  beforeEach(() => { svc = new NarrativeService({ skipDatabase: true }); });

  it('createSession asigna un código de 5 letras', async () => {
    const s = await svc.createSession({ title: 'La aventura' });
    expect(s.code).toMatch(/^[A-Z]{5}$/);
  });

  it('getSessionByCode encuentra la sesión (case-insensitive)', async () => {
    const s = await svc.createSession({ title: 'La aventura' });
    const found = await svc.getSessionByCode(s.code.toLowerCase());
    expect(found.id).toBe(s.id);
  });

  it('dos sesiones no comparten código', async () => {
    const a = await svc.createSession({ title: 'A' });
    const b = await svc.createSession({ title: 'B' });
    expect(a.code).not.toBe(b.code);
  });
});
