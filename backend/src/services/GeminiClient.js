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
   * TRANSITORIO (un 500 de Google, un corte de red).
   *
   * El 429 (limite excedido) NO se reintenta: insistir contra un limite es
   * tirarle nafta al fuego, y antes cada narracion que chocaba contra la cuota
   * gastaba TRES llamadas en vez de una. El error que sale lleva `cuota: true`
   * para que el llamador pueda apagar la IA un rato (ver presupuestoIA.js).
   *
   * @returns {Promise<string>} texto generado
   */
  async generate(prompt, { systemPrompt = '', temperature = 0.8, maxOutputTokens = 500 } = {}) {
    const url = `${BASE_URL}/models/${this.model}:generateContent?key=${this.apiKey}`;
    const body = {
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      // thinkingBudget 0: thinking consume maxOutputTokens en gemini-2.5 → narraciones truncadas sin esto
      generationConfig: { temperature, maxOutputTokens, thinkingConfig: { thinkingBudget: 0 } },
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
        if (!res.ok) {
          lastError = new Error(`Gemini HTTP ${res.status}`);
          // 429 = limite excedido; 403 puede ser cuota o clave sin permiso. Los
          // dos casos se marcan para que el llamador pause la IA.
          if (res.status === 429 || res.status === 403) {
            lastError.cuota = true;
            const esperar = res.headers?.get?.('retry-after');
            if (esperar) lastError.reintentarEnMs = Number(esperar) * 1000;
          }
          if ([400, 401, 403, 404, 429].includes(res.status)) break; // no-retryable
          continue;
        }
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
