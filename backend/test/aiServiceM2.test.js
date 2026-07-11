// backend/test/aiServiceM2.test.js
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIService } from '../src/services/AIService.js';

describe('M2 — AIService modo y resumen', () => {
  let ai;
  beforeEach(() => {
    ai = new AIService();
    ai.gemini = { isConfigured: () => true, generate: vi.fn().mockResolvedValue('texto') };
  });

  it('generateStoryNarrative pasa el modo al system prompt', async () => {
    await ai.generateStoryNarrative('p', { language: 'es', genre: 'fantasy', mode: 'narrador-activo' });
    const opts = ai.gemini.generate.mock.calls[0][1];
    expect(opts.systemPrompt).toContain('protagonismo'); // marca del modo activo
  });

  it('generateOpening pasa el modo', async () => {
    await ai.generateOpening({ language: 'es', genre: 'fantasy', mode: 'narrador-activo' });
    const prompt = ai.gemini.generate.mock.calls[0][0];
    expect(prompt).toContain('primer evento');
  });

  it('generateSummary combina resumen anterior y narración nueva', async () => {
    ai.gemini.generate.mockResolvedValueOnce('sinopsis nueva');
    const out = await ai.generateSummary('resumen viejo', 'narración nueva', { language: 'es' });
    expect(out).toBe('sinopsis nueva');
    const prompt = ai.gemini.generate.mock.calls[0][0];
    expect(prompt).toContain('resumen viejo');
    expect(prompt).toContain('narración nueva');
  });

  it('generateSummary retorna null si no está configurada', async () => {
    ai.gemini = { isConfigured: () => false, generate: vi.fn() };
    expect(await ai.generateSummary('a', 'b', { language: 'es' })).toBeNull();
    expect(ai.gemini.generate).not.toHaveBeenCalled();
  });
});
