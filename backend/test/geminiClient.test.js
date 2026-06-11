import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiClient } from '../src/services/GeminiClient.js';

const okResponse = (text) => ({
  ok: true,
  json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }),
});

describe('GeminiClient', () => {
  beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('llama a generateContent con system prompt y retorna el texto', async () => {
    fetch.mockResolvedValueOnce(okResponse('Érase una vez...'));
    const client = new GeminiClient({ apiKey: 'k', model: 'gemini-2.5-flash' });
    const out = await client.generate('narra esto', { systemPrompt: 'eres narrador' });
    expect(out).toBe('Érase una vez...');
    const [url, opts] = fetch.mock.calls[0];
    expect(url).toContain('models/gemini-2.5-flash:generateContent');
    const body = JSON.parse(opts.body);
    expect(body.systemInstruction.parts[0].text).toBe('eres narrador');
    expect(body.contents[0].parts[0].text).toBe('narra esto');
  });

  it('reintenta 2 veces ante error y luego lanza', async () => {
    fetch.mockResolvedValue({ ok: false, status: 429, json: async () => ({}) });
    const client = new GeminiClient({ apiKey: 'k', retryDelayMs: 1 });
    await expect(client.generate('x')).rejects.toThrow(/Gemini/);
    expect(fetch).toHaveBeenCalledTimes(3); // 1 intento + 2 reintentos
  });

  it('isConfigured refleja la presencia de la API key', () => {
    expect(new GeminiClient({ apiKey: '' }).isConfigured()).toBe(false);
    expect(new GeminiClient({ apiKey: 'k' }).isConfigured()).toBe(true);
  });
});
