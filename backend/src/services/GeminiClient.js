const BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

export class GeminiClient {
  constructor({ apiKey, model = 'gemini-2.5-flash', retryDelayMs = 1000 } = {}) {
    this.apiKey = apiKey || '';
    this.model = model;
    this.retryDelayMs = retryDelayMs;
  }

  isConfigured() {
    return this.apiKey.length > 0;
  }

  /**
   * Genera texto. Reintenta 2 veces con espera exponencial ante fallo
   * (rate limit del free tier incluido).
   * @returns {Promise<string>} texto generado
   */
  async generate(prompt, { systemPrompt = '', temperature = 0.8, maxOutputTokens = 500 } = {}) {
    const url = `${BASE_URL}/models/${this.model}:generateContent?key=${this.apiKey}`;
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens },
    };
    if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };

    let lastError;
    for (let attempt = 0; attempt <= 2; attempt++) {
      if (attempt > 0) {
        await new Promise(r => setTimeout(r, this.retryDelayMs * 2 ** (attempt - 1)));
      }
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) { lastError = new Error(`Gemini HTTP ${res.status}`); continue; }
        const data = await res.json();
        const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) { lastError = new Error('Gemini: respuesta vacía'); continue; }
        return text.trim();
      } catch (err) {
        lastError = new Error(`Gemini: ${err.message}`);
      }
    }
    throw lastError;
  }
}
