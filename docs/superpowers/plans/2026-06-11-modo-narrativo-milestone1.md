# Modo Narrativo Familiar — Milestone 1 — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Partida narrativa completa jugable en LAN: sesión con código de sala de 5 letras, turnos en orden con narración de IA (Gemini, free tier) al cierre de cada ronda, idioma es/pt por sesión, persistencia SQLite, epílogo al finalizar.

**Architecture:** Se termina el WIP narrativo existente (NarrativeService + narrativeRoutes + StoryLobby/StorySession). El AIService cambia de OpenAI a Gemini (REST, sin SDK). La narración pasa de "por acción" a "por cierre de ronda". El tiempo real se mantiene con el polling existente del frontend (3s) — Socket.io push queda como optimización futura.

**Tech Stack:** Vue 3 + Vite 7 (frontend), Express + better-sqlite3 + vitest (backend), Gemini API `generateContent` vía `fetch` nativo de Node.

**Spec:** `docs/superpowers/specs/2026-06-11-modo-narrativo-milestone1-design.md`

**Convenciones del repo:** ESM (`"type": "module"`), queries SQL raw vía `pool.query()`, español en strings de UI.

**Variables de entorno nuevas (backend/.env):**
```
DATABASE_TYPE=sqlite
GEMINI_API_KEY=<key de https://aistudio.google.com/apikey>
GEMINI_MODEL=gemini-2.5-flash
```

---

### Task 0: Commitear el WIP en rama de trabajo

**Files:** ninguno nuevo (snapshot del estado actual).

- [ ] **Step 1: Crear rama y commitear todo el WIP**

```bash
cd E:\dev\06-games\vue-nodejs--cronicas-civilizacion
git checkout -b modo-narrativo
git add -A
git commit -m "wip: snapshot del pivot a modo narrativo (pre-milestone-1)"
```

- [ ] **Step 2: Verificar working tree limpio**

Run: `git status --short`
Expected: sin salida (todo commiteado).

---

### Task 1: Utilidad de código de sala (5 letras)

**Files:**
- Create: `backend/src/utils/roomCode.js`
- Test: `backend/test/roomCode.test.js`

- [ ] **Step 1: Escribir test que falla**

```javascript
// backend/test/roomCode.test.js
import { describe, it, expect } from 'vitest';
import { generateRoomCode, ROOM_CODE_ALPHABET } from '../src/utils/roomCode.js';

describe('generateRoomCode', () => {
  it('genera códigos de 5 caracteres del alfabeto sin ambiguos', () => {
    for (let i = 0; i < 200; i++) {
      const code = generateRoomCode();
      expect(code).toHaveLength(5);
      for (const ch of code) expect(ROOM_CODE_ALPHABET).toContain(ch);
    }
  });

  it('no contiene caracteres ambiguos I, L, O, 0, 1', () => {
    expect(ROOM_CODE_ALPHABET).not.toMatch(/[ILO01]/);
  });

  it('reintenta hasta dar un código que no exista', () => {
    const existing = new Set();
    const first = generateRoomCode(c => existing.has(c));
    existing.add(first);
    const second = generateRoomCode(c => existing.has(c));
    expect(second).not.toBe(first);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `cd backend; npx vitest run test/roomCode.test.js`
Expected: FAIL — "Cannot find module '../src/utils/roomCode.js'"

- [ ] **Step 3: Implementación mínima**

```javascript
// backend/src/utils/roomCode.js
import crypto from 'crypto';

// Sin I, L, O (confundibles con 1/0) — solo letras para poder dictarlo en voz alta.
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';

/**
 * Genera un código de sala de 5 letras.
 * @param {(code: string) => boolean} [exists] — predicado de colisión; si retorna
 *   true se genera otro código (máx. 50 intentos).
 */
export function generateRoomCode(exists = () => false) {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += ROOM_CODE_ALPHABET[crypto.randomInt(ROOM_CODE_ALPHABET.length)];
    }
    if (!exists(code)) return code;
  }
  throw new Error('No se pudo generar un código de sala único');
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run test/roomCode.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/utils/roomCode.js backend/test/roomCode.test.js
git commit -m "feat(narrativa): utilidad de codigo de sala de 5 letras"
```

---

### Task 2: Código de sala en sesiones (modelo + DB + rutas)

**Files:**
- Modify: `backend/src/services/NarrativeService.js` (clase StorySession, createSession, nuevo getSessionByCode)
- Modify: `backend/src/config/database-sqlite.js` (columna `code` en `story_sessions`)
- Modify: `backend/src/routes/narrativeRoutes.js` (exponer code, endpoint por código)
- Test: `backend/test/narrativeSession.test.js`

- [ ] **Step 1: Escribir test que falla**

```javascript
// backend/test/narrativeSession.test.js
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
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run test/narrativeSession.test.js`
Expected: FAIL — `code` undefined o constructor no acepta opciones. Nota: si
`NarrativeService` se exporta hoy como singleton/default, agregar el export con
nombre de la clase y la opción `{ skipDatabase: true }` que omite llamadas a
`saveSessionToDatabase`/`loadSessionFromDatabase` (guard `if (this.skipDatabase) return;`).

- [ ] **Step 3: Implementar**

En `NarrativeService.js`:

```javascript
import { generateRoomCode } from '../utils/roomCode.js';

// Dentro de createSession(sessionData), tras construir la StorySession:
session.code = generateRoomCode(c =>
  [...this.sessions.values()].some(s => s.code === c)
);

// Nuevo método público:
async getSessionByCode(code) {
  const target = String(code || '').trim().toUpperCase();
  for (const session of this.sessions.values()) {
    if (session.code === target) return session;
  }
  // fallback a DB para sesiones no cacheadas (sobrevive reinicio)
  if (this.skipDatabase) return null;
  return await this.loadSessionByCodeFromDatabase(target);
}
```

En `database-sqlite.js`, en `initializeTables()` agregar la columna a la tabla
`story_sessions` (y migración suave para bases ya creadas):

```javascript
// dentro del CREATE TABLE IF NOT EXISTS story_sessions: agregar
//   code TEXT UNIQUE,
// y después del create, migración idempotente:
try { db.exec(`ALTER TABLE story_sessions ADD COLUMN code TEXT UNIQUE`); } catch (e) { /* ya existe */ }
```

`saveSessionToDatabase`/`loadSessionFromDatabase` deben incluir `code` en el
INSERT/SELECT (mismo patrón que `title`). Implementar
`loadSessionByCodeFromDatabase(code)` igual a `loadSessionFromDatabase` pero con
`WHERE code = ?`. Incluir `code` en `getSummary()` y `toJSON()` de StorySession.

En `narrativeRoutes.js`:

```javascript
// GET /api/narrative/sessions/code/:code  → sesión por código de sala
router.get('/sessions/code/:code', async (req, res) => {
  try {
    const session = await narrativeService.getSessionByCode(req.params.code);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Sala no encontrada' });
    }
    res.json({ success: true, data: session.toJSON(), message: 'OK' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
```

(Colocar ANTES de `GET /sessions/:sessionId` para que `code` no matchee como id.)

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run test/narrativeSession.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/NarrativeService.js backend/src/config/database-sqlite.js backend/src/routes/narrativeRoutes.js backend/test/narrativeSession.test.js
git commit -m "feat(narrativa): codigo de sala de 5 letras en sesiones + lookup por codigo"
```

---

### Task 3: Cliente Gemini (reemplaza OpenAI en AIService)

**Files:**
- Create: `backend/src/services/GeminiClient.js`
- Modify: `backend/src/services/AIService.js`
- Modify: `backend/src/config/index.js` (bloque `gemini`)
- Modify: `backend/env.example`
- Test: `backend/test/geminiClient.test.js`

- [ ] **Step 1: Escribir test que falla (fetch mockeado)**

```javascript
// backend/test/geminiClient.test.js
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
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run test/geminiClient.test.js`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar GeminiClient**

```javascript
// backend/src/services/GeminiClient.js
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
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run test/geminiClient.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Cablear AIService a Gemini**

En `config/index.js` agregar (y quitar el bloque `openai` si nada más lo usa):

```javascript
gemini: {
  apiKey: process.env.GEMINI_API_KEY || '',
  model: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
},
```

En `AIService.js`: eliminar `import OpenAI...` y el cliente OpenAI; instanciar
`this.gemini = new GeminiClient(config.gemini)`. Donde hoy se hace
`openai.chat.completions.create({ messages: [{role:'system',...},{role:'user',...}], ... })`,
reemplazar por:

```javascript
const narrative = await this.gemini.generate(prompt, {
  systemPrompt: this.getSystemPrompt(language),
  temperature: 0.8,
  maxOutputTokens: 400,
});
```

`isConfigured()` y `getStatus()` delegan en `this.gemini.isConfigured()` y
reportan `model: config.gemini.model`. Los fallbacks existentes
(`getFallbackNarrative`) se mantienen tal cual: si `generate()` lanza tras los
reintentos, retornar el fallback como hoy. En `env.example` reemplazar
`OPENAI_API_KEY` por `GEMINI_API_KEY=` y `GEMINI_MODEL=gemini-2.5-flash`.
Quitar `"openai"` de `backend/package.json` dependencies y correr `npm install`.

- [ ] **Step 6: Correr todos los tests del backend**

Run: `npx vitest run`
Expected: PASS — los tests de Tasks 1-2 siguen verdes.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/GeminiClient.js backend/src/services/AIService.js backend/src/config/index.js backend/env.example backend/package.json backend/package-lock.json backend/test/geminiClient.test.js
git commit -m "feat(ia): reemplazar OpenAI por Gemini free tier (REST sin SDK)"
```

---

### Task 4: Prompts por idioma (es/pt) por sesión

**Files:**
- Create: `backend/src/services/narrativePrompts.js`
- Modify: `backend/src/services/AIService.js` y `backend/src/services/NarrativeService.js`
- Test: `backend/test/narrativePrompts.test.js`

- [ ] **Step 1: Escribir test que falla**

```javascript
// backend/test/narrativePrompts.test.js
import { describe, it, expect } from 'vitest';
import { getNarratorSystemPrompt, getEpiloguePrompt } from '../src/services/narrativePrompts.js';

describe('prompts por idioma', () => {
  it('es: narrador en español', () => {
    const p = getNarratorSystemPrompt('es', 'fantasy');
    expect(p).toContain('español');
    expect(p).toContain('fantasía');
  });

  it('pt: narrador en portugués', () => {
    const p = getNarratorSystemPrompt('pt', 'fantasy');
    expect(p).toContain('português');
    expect(p).toContain('fantasia');
  });

  it('idioma desconocido cae a español', () => {
    expect(getNarratorSystemPrompt('fr', 'mystery')).toContain('español');
  });

  it('epílogo respeta idioma', () => {
    expect(getEpiloguePrompt('pt')).toContain('epílogo');
    expect(getEpiloguePrompt('pt')).toContain('português');
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run test/narrativePrompts.test.js`
Expected: FAIL — módulo no existe.

- [ ] **Step 3: Implementar**

```javascript
// backend/src/services/narrativePrompts.js
const GENRES = {
  es: { fantasy: 'fantasía', historical: 'histórico', 'sci-fi': 'ciencia ficción', mystery: 'misterio' },
  pt: { fantasy: 'fantasia', historical: 'histórico', 'sci-fi': 'ficção científica', mystery: 'mistério' },
};

const NARRATOR = {
  es: (genre) => `Eres el narrador maestro de una historia colaborativa de ${genre} \
que una familia escribe por turnos. Narra en español, en segunda persona plural, \
con tono épico pero apto para todas las edades. Integra TODAS las acciones de la \
ronda en una narración continua de 100 a 180 palabras que termine dejando la \
historia abierta para la próxima ronda. No inventes acciones de los jugadores.`,
  pt: (genre) => `Você é o narrador mestre de uma história colaborativa de ${genre} \
que uma família escreve por turnos. Narre em português, na segunda pessoa do plural, \
com tom épico mas adequado para todas as idades. Integre TODAS as ações da rodada em \
uma narração contínua de 100 a 180 palavras que termine deixando a história aberta \
para a próxima rodada. Não invente ações dos jogadores.`,
};

const EPILOGUE = {
  es: `Escribe el epílogo de la historia en español: cierra los arcos de los \
personajes en 120-200 palabras con un final satisfactorio y emotivo.`,
  pt: `Escreva o epílogo da história em português: feche os arcos dos personagens \
em 120-200 palavras com um final satisfatório e emocionante.`,
};

const OPENING = {
  es: (genre) => `Escribe en español la introducción (80-140 palabras) de una nueva \
historia de ${genre}. Presenta el escenario y un gancho inicial. Termina invitando \
a los protagonistas a actuar.`,
  pt: (genre) => `Escreva em português a introdução (80-140 palavras) de uma nova \
história de ${genre}. Apresente o cenário e um gancho inicial. Termine convidando \
os protagonistas a agir.`,
};

function lang(language) { return language === 'pt' ? 'pt' : 'es'; }

export function getNarratorSystemPrompt(language, genre = 'fantasy') {
  const l = lang(language);
  return NARRATOR[l](GENRES[l][genre] || genre);
}
export function getEpiloguePrompt(language) { return EPILOGUE[lang(language)]; }
export function getOpeningPrompt(language, genre = 'fantasy') {
  const l = lang(language);
  return OPENING[l](GENRES[l][genre] || genre);
}
```

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run test/narrativePrompts.test.js`
Expected: PASS (4 tests)

- [ ] **Step 5: Cablear el idioma de la sesión**

`NarrativeService`: `session.settings.language` ya existe — asegurarse de que
`createSession` lo tome del body (`'es'` default, `'pt'` permitido) y que
`buildNarrativePrompt`/`generateNarrativeResponse` pasen
`session.settings.language` y `session.settings.genre` a AIService, que usa
`getNarratorSystemPrompt(language, genre)` como systemPrompt. Validar en la ruta
POST /sessions: `settings.language` ∈ {'es','pt'}.

- [ ] **Step 6: Correr todos los tests y commit**

Run: `npx vitest run` — Expected: PASS

```bash
git add backend/src/services/narrativePrompts.js backend/src/services/AIService.js backend/src/services/NarrativeService.js backend/src/routes/narrativeRoutes.js backend/test/narrativePrompts.test.js
git commit -m "feat(narrativa): prompts del narrador en es/pt segun idioma de la sesion"
```

---

### Task 5: Narración al cierre de ronda (no por acción)

**Files:**
- Modify: `backend/src/services/NarrativeService.js` (submitAction)
- Test: `backend/test/roundNarration.test.js`

Comportamiento objetivo: cada acción se guarda y avanza el turno; SOLO cuando el
último jugador de la ronda envía su acción se llama a la IA con TODAS las
acciones de esa ronda y se agrega una entrada `ai_narrative`; `turnNumber++`.

- [ ] **Step 1: Escribir test que falla**

```javascript
// backend/test/roundNarration.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NarrativeService } from '../src/services/NarrativeService.js';

describe('narración por cierre de ronda', () => {
  let svc, session, ana, beto;

  beforeEach(async () => {
    svc = new NarrativeService({ skipDatabase: true });
    // IA mockeada: registra el prompt recibido
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
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run test/roundNarration.test.js`
Expected: FAIL — hoy narra en cada acción / no valida turno estricto.

- [ ] **Step 3: Reimplementar submitAction**

```javascript
// NarrativeService.submitAction — comportamiento nuevo
async submitAction(sessionId, playerId, actionText) {
  const session = await this.getSession(sessionId);
  if (!session || !session.isActive) throw new Error('Sesión no activa');

  const text = String(actionText || '').trim();
  if (!text) throw new Error('La acción no puede estar vacía');
  if (text.length > 280) throw new Error('La acción supera los 280 caracteres');

  const current = session.players[session.currentPlayerIndex];
  if (!current || current.id !== playerId) {
    throw new Error(`No es tu turno — le toca a ${current?.name ?? 'otro jugador'}`);
  }

  const entry = session.addPlayerAction(playerId, text); // entrada type 'player_action' con turnNumber actual
  if (!this.skipDatabase) await this.saveStoryEntryToDatabase(sessionId, entry);

  // avanzar turno
  session.currentPlayerIndex = (session.currentPlayerIndex + 1) % session.players.length;
  const roundComplete = session.currentPlayerIndex === 0;

  let narrative = null;
  if (roundComplete) {
    const roundActions = session.storyHistory.filter(
      e => e.type === 'player_action' && e.turnNumber === session.turnNumber
    );
    const prompt = this.buildRoundPrompt(session, roundActions);
    narrative = await this.aiService.generateStoryNarrative(prompt, {
      language: session.settings.language,
      genre: session.settings.genre,
    });
    const aiEntry = session.addAINarrative(narrative); // type 'ai_narrative', turnNumber actual
    if (!this.skipDatabase) await this.saveStoryEntryToDatabase(sessionId, aiEntry);
    session.turnNumber += 1;
  }

  if (!this.skipDatabase) await this.saveSessionToDatabase(session);
  return {
    action: entry,
    narrative,
    nextPlayer: session.players[session.currentPlayerIndex],
    turnNumber: session.turnNumber,
    roundComplete,
  };
}
```

Notas de integración:
- `addPlayerAction`/`addAINarrative` son los helpers existentes de StorySession
  que agregan a `storyHistory` (ajustar nombres a los reales si difieren, p. ej.
  `addStoryAction`) — la conducta requerida es la del test.
- `buildRoundPrompt(session, roundActions)` (nuevo método): contexto = últimas 2
  narraciones de la IA + lista "NombreJugador: acción" de la ronda:

```javascript
buildRoundPrompt(session, roundActions) {
  const lastNarratives = session.storyHistory
    .filter(e => e.type === 'ai_narrative').slice(-2)
    .map(e => e.narrative).join('\n');
  const actions = roundActions
    .map(e => `${session.players.find(p => p.id === e.playerId)?.name}: ${e.action}`)
    .join('\n');
  return `HISTORIA RECIENTE:\n${lastNarratives || '(la historia recién comienza)'}\n\nACCIONES DE ESTA RONDA:\n${actions}\n\nNarra el resultado de la ronda.`;
}
```

- `AIService` gana el método de alto nivel usado arriba:

```javascript
async generateStoryNarrative(prompt, { language = 'es', genre = 'fantasy' } = {}) {
  try {
    return await this.gemini.generate(prompt, {
      systemPrompt: getNarratorSystemPrompt(language, genre),
      temperature: 0.8,
      maxOutputTokens: 400,
    });
  } catch (err) {
    logger.error('Narración falló tras reintentos:', err.message);
    throw err; // la ruta lo convierte en error con boton "Reintentar"
  }
}
```

- La ruta POST `/sessions/:sessionId/action` baja el límite de 500 → **280** y
  propaga `roundComplete` en `data`.

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run test/roundNarration.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Correr todos los tests y commit**

Run: `npx vitest run` — Expected: PASS

```bash
git add backend/src/services/NarrativeService.js backend/src/services/AIService.js backend/src/routes/narrativeRoutes.js backend/test/roundNarration.test.js
git commit -m "feat(narrativa): narracion al cierre de ronda + turno estricto + limite 280"
```

---

### Task 6: Reintento de narración y reentrada de jugador

**Files:**
- Modify: `backend/src/services/NarrativeService.js`
- Modify: `backend/src/routes/narrativeRoutes.js`
- Test: `backend/test/retryAndRejoin.test.js`

- [ ] **Step 1: Escribir test que falla**

```javascript
// backend/test/retryAndRejoin.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NarrativeService } from '../src/services/NarrativeService.js';

describe('reintento de narración y reentrada', () => {
  let svc, session, ana, beto;

  beforeEach(async () => {
    svc = new NarrativeService({ skipDatabase: true });
    svc.aiService = { generateStoryNarrative: vi.fn() };
    session = await svc.createSession({ title: 'T', settings: { language: 'es' } });
    ({ player: ana } = await svc.joinSession(session.id, { name: 'Ana' }));
    ({ player: beto } = await svc.joinSession(session.id, { name: 'Beto' }));
    session.isActive = true;
  });

  it('si la IA falla al cerrar ronda, las acciones quedan y retryNarration narra', async () => {
    svc.aiService.generateStoryNarrative.mockRejectedValueOnce(new Error('boom'));
    await svc.submitAction(session.id, ana.id, 'a1');
    await expect(svc.submitAction(session.id, beto.id, 'a2')).rejects.toThrow();
    // acciones persistidas, ronda sin narrar
    svc.aiService.generateStoryNarrative.mockResolvedValueOnce('Ahora sí');
    const r = await svc.retryNarration(session.id);
    expect(r.narrative).toBe('Ahora sí');
    expect(session.storyHistory.filter(e => e.type === 'player_action')).toHaveLength(2);
  });

  it('joinSession con nombre existente retorna el mismo jugador (reentrada)', async () => {
    const again = await svc.joinSession(session.id, { name: 'ana' }); // case-insensitive
    expect(again.player.id).toBe(ana.id);
    expect(session.players).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run test/retryAndRejoin.test.js`
Expected: FAIL — `retryNarration` no existe; join duplica jugador.

- [ ] **Step 3: Implementar**

En `NarrativeService`:

```javascript
// Reentrada: al inicio de joinSession, antes de crear jugador nuevo
const existing = session.players.find(
  p => p.name.trim().toLowerCase() === String(playerData.name || '').trim().toLowerCase()
);
if (existing) {
  existing.isActive = true;
  return { session, player: existing, message: 'Reconectado a la sesión' };
}

// Nuevo método: re-narra la última ronda completa sin narrativa
async retryNarration(sessionId) {
  const session = await this.getSession(sessionId);
  if (!session) throw new Error('Sesión no encontrada');
  const roundActions = session.storyHistory.filter(
    e => e.type === 'player_action' && e.turnNumber === session.turnNumber
  );
  if (roundActions.length === 0) throw new Error('No hay ronda pendiente de narrar');
  const prompt = this.buildRoundPrompt(session, roundActions);
  const narrative = await this.aiService.generateStoryNarrative(prompt, {
    language: session.settings.language, genre: session.settings.genre,
  });
  const aiEntry = session.addAINarrative(narrative);
  if (!this.skipDatabase) await this.saveStoryEntryToDatabase(sessionId, aiEntry);
  session.turnNumber += 1;
  if (!this.skipDatabase) await this.saveSessionToDatabase(session);
  return { narrative, turnNumber: session.turnNumber };
}
```

Ajuste a Task 5: si `generateStoryNarrative` lanza al cerrar ronda, el turno
queda avanzado (currentPlayerIndex en 0) y `turnNumber` SIN incrementar — ese es
exactamente el estado que `retryNarration` resuelve. La ruta:

```javascript
// POST /api/narrative/sessions/:sessionId/retry-narrative
router.post('/sessions/:sessionId/retry-narrative', async (req, res) => {
  try {
    const data = await narrativeService.retryNarration(req.params.sessionId);
    res.json({ success: true, data, message: 'Narración generada' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
```

Skip de turno por el anfitrión (jugador desconectado) — mismo patrón:

```javascript
// NarrativeService.skipTurn(sessionId) — avanza currentPlayerIndex sin acción;
// si con el salto se cierra la ronda, narra igual que submitAction.
// Ruta: POST /sessions/:sessionId/skip-turn
```

(Implementarlo reutilizando el bloque de cierre de ronda extraído a un método
privado `#closeRoundIfComplete(session)` para no duplicar.)

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run test/retryAndRejoin.test.js`
Expected: PASS (2 tests)

- [ ] **Step 5: Correr todo y commit**

Run: `npx vitest run` — Expected: PASS

```bash
git add backend/src/services/NarrativeService.js backend/src/routes/narrativeRoutes.js backend/test/retryAndRejoin.test.js
git commit -m "feat(narrativa): retry de narracion, reentrada por nombre y skip de turno"
```

---

### Task 7: Apertura de historia y epílogo

**Files:**
- Modify: `backend/src/services/NarrativeService.js` (startSession, endSession)
- Modify: `backend/src/routes/narrativeRoutes.js` (POST /sessions/:id/start)
- Test: `backend/test/openingEpilogue.test.js`

- [ ] **Step 1: Escribir test que falla**

```javascript
// backend/test/openingEpilogue.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NarrativeService } from '../src/services/NarrativeService.js';

describe('apertura y epílogo', () => {
  let svc, session;
  beforeEach(async () => {
    svc = new NarrativeService({ skipDatabase: true });
    svc.aiService = {
      generateStoryNarrative: vi.fn().mockResolvedValue('texto'),
      generateOpening: vi.fn().mockResolvedValue('Había una vez...'),
      generateEpilogue: vi.fn().mockResolvedValue('Y colorín colorado...'),
    };
    session = await svc.createSession({ title: 'T', settings: { language: 'es', genre: 'fantasy' } });
    await svc.joinSession(session.id, { name: 'Ana' });
    await svc.joinSession(session.id, { name: 'Beto' });
  });

  it('startSession activa la sesión y agrega la introducción de la IA', async () => {
    const r = await svc.startSession(session.id);
    expect(session.isActive).toBe(true);
    expect(r.opening).toBe('Había una vez...');
    expect(session.storyHistory[0].type).toBe('ai_narrative');
  });

  it('startSession exige mínimo 2 jugadores', async () => {
    const solo = await svc.createSession({ title: 'S' });
    await svc.joinSession(solo.id, { name: 'Ana' });
    await expect(svc.startSession(solo.id)).rejects.toThrow(/2 jugadores/);
  });

  it('endSession genera epílogo y desactiva', async () => {
    await svc.startSession(session.id);
    const r = await svc.endSession(session.id);
    expect(r.epilogue).toBe('Y colorín colorado...');
    expect(session.isActive).toBe(false);
    const last = session.storyHistory.at(-1);
    expect(last.type).toBe('ai_epilogue');
  });
});
```

- [ ] **Step 2: Verificar que falla**

Run: `npx vitest run test/openingEpilogue.test.js`
Expected: FAIL — `startSession` no existe; `endSession` no genera epílogo.

- [ ] **Step 3: Implementar**

`AIService` — dos métodos de alto nivel usando los prompts de Task 4:

```javascript
async generateOpening({ language = 'es', genre = 'fantasy' } = {}) {
  return await this.gemini.generate(getOpeningPrompt(language, genre), {
    systemPrompt: getNarratorSystemPrompt(language, genre),
    temperature: 0.9, maxOutputTokens: 300,
  });
}

async generateEpilogue(storySummary, { language = 'es', genre = 'fantasy' } = {}) {
  return await this.gemini.generate(
    `${getEpiloguePrompt(language)}\n\nHISTORIA:\n${storySummary}`,
    { systemPrompt: getNarratorSystemPrompt(language, genre), temperature: 0.8, maxOutputTokens: 400 }
  );
}
```

`NarrativeService`:

```javascript
async startSession(sessionId) {
  const session = await this.getSession(sessionId);
  if (!session) throw new Error('Sesión no encontrada');
  if (session.isActive) throw new Error('La sesión ya está en curso');
  if (session.players.length < 2) throw new Error('Se necesitan al menos 2 jugadores');
  const opening = await this.aiService.generateOpening({
    language: session.settings.language, genre: session.settings.genre,
  });
  session.isActive = true;
  session.currentPlayerIndex = 0;
  const entry = session.addAINarrative(opening);
  if (!this.skipDatabase) {
    await this.saveStoryEntryToDatabase(sessionId, entry);
    await this.saveSessionToDatabase(session);
  }
  return { session, opening };
}

// endSession (modificar el existente):
async endSession(sessionId) {
  const session = await this.getSession(sessionId);
  if (!session) throw new Error('Sesión no encontrada');
  const summary = session.storyHistory
    .filter(e => e.type === 'ai_narrative').map(e => e.narrative).join('\n');
  const epilogue = await this.aiService.generateEpilogue(summary, {
    language: session.settings.language, genre: session.settings.genre,
  });
  const entry = session.addAINarrative(epilogue);
  entry.type = 'ai_epilogue';
  session.isActive = false;
  if (!this.skipDatabase) {
    await this.saveStoryEntryToDatabase(sessionId, entry);
    await this.saveSessionToDatabase(session);
  }
  return { session, epilogue, message: 'Historia finalizada' };
}
```

Ruta nueva: `POST /sessions/:sessionId/start` → llama `startSession`, responde
`{ success, data: { session, opening } }`. La ruta `/end` existente pasa a
responder `{ session, epilogue }`.

- [ ] **Step 4: Verificar que pasa**

Run: `npx vitest run test/openingEpilogue.test.js`
Expected: PASS (3 tests)

- [ ] **Step 5: Correr todo y commit**

Run: `npx vitest run` — Expected: PASS

```bash
git add backend/src/services/NarrativeService.js backend/src/services/AIService.js backend/src/routes/narrativeRoutes.js backend/test/openingEpilogue.test.js
git commit -m "feat(narrativa): apertura de historia al iniciar y epilogo al finalizar"
```

---

### Task 8: Arranque LAN (0.0.0.0 + IP visible + CORS + proxy)

**Files:**
- Modify: `backend/src/server-dynamic.js`
- Modify: `frontend/vite.config.js`
- Modify: `frontend/src/config/env.js` (base URL del API)
- Create: `package.json` (raíz, orquestador dev)

- [ ] **Step 1: Backend en 0.0.0.0 con IP impresa**

```javascript
// server-dynamic.js — reemplazar el server.listen(PORT, ...) por:
import os from 'os';

function getLanIp() {
  for (const ifaces of Object.values(os.networkInterfaces())) {
    for (const iface of ifaces || []) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return 'localhost';
}

server.listen(PORT, '0.0.0.0', () => {
  const ip = getLanIp();
  logger.info(`📡 Local:   http://localhost:${PORT}`);
  logger.info(`📱 En tu WiFi: http://${ip}:${PORT}  ← para los celulares`);
  logger.info(`🗃️  Database: ${config.database.type.toUpperCase()}`);
});
```

CORS: en el `cors()` de Express y en `new Server(server, { cors: ... })`,
cambiar `origin: config.server.frontendUrl` por `origin: true` (refleja el
origin del request — aceptable en LAN local, fuera de alcance exponerlo a
internet).

- [ ] **Step 2: Frontend accesible desde la red y proxy al backend**

```javascript
// frontend/vite.config.js — dentro de defineConfig:
server: {
  host: true,          // escucha en 0.0.0.0 → accesible desde celulares
  port: 5173,
  proxy: {
    '/api': { target: 'http://localhost:3000', changeOrigin: true },
    '/socket.io': { target: 'http://localhost:3000', ws: true },
  },
},
```

En `frontend/src/config/env.js`: la base URL del API debe ser **relativa**
(`''`) para que el proxy de Vite resuelva — eliminar cualquier
`http://localhost:3000` hardcodeado:

```javascript
export const API_BASE_URL = import.meta.env.VITE_API_URL || '';
// axios.get(`${API_BASE_URL}/api/narrative/sessions`) → mismo origen → proxy
```

(Revisar `useGameApi.js` y los componentes Story* por URLs absolutas a
localhost:3000 y cambiarlas a rutas relativas `/api/...`.)

- [ ] **Step 3: Script raíz único**

```json
// package.json (raíz del repo — crear)
{
  "name": "cronicas-civilizacion",
  "private": true,
  "scripts": {
    "dev": "concurrently -n backend,frontend -c blue,green \"npm run dev-sqlite --prefix backend\" \"npm run dev --prefix frontend\"",
    "test": "npm test --prefix backend -- --run"
  },
  "devDependencies": { "concurrently": "^9.0.0" }
}
```

Run: `npm install` (raíz)

- [ ] **Step 4: Verificación manual LAN**

Run: `npm run dev` (raíz)
Expected: backend imprime `En tu WiFi: http://192.168.x.x:3000`; abrir
`http://192.168.x.x:5173` desde el celular muestra el lobby. `GET /health`
responde desde el celular.

- [ ] **Step 5: Commit**

```bash
git add backend/src/server-dynamic.js frontend/vite.config.js frontend/src/config/env.js frontend/src/composables/useGameApi.js package.json package-lock.json
git commit -m "feat(lan): backend y frontend en 0.0.0.0, IP visible, proxy /api y script raiz"
```

---

### Task 9: Frontend — lobby con código de sala, idioma y flujo de inicio

**Files:**
- Modify: `frontend/src/components/StoryLobby.vue`
- Modify: `frontend/src/App.vue`

- [ ] **Step 1: Form de crear sesión — agregar selector de idioma**

En el form de StoryLobby (junto a género), agregar:

```vue
<div class="form-group">
  <label for="language">Idioma de la narración</label>
  <select id="language" v-model="newSession.settings.language">
    <option value="es">Español</option>
    <option value="pt">Português</option>
  </select>
</div>
```

con `newSession.settings.language: 'es'` en el estado inicial, enviado en el
POST /sessions existente.

- [ ] **Step 2: Mostrar el código de sala grande tras crear**

Tras `session-created`, mostrar pantalla/sección de sala de espera con:

```vue
<div class="room-code">
  <p>Comparte este código:</p>
  <strong class="code">{{ session.code }}</strong>
  <p class="hint">En el celular: http://{{ lanHint }}:5173 → "Unirse" → código</p>
</div>
```

(`lanHint` = `window.location.hostname` — los demás entran a la misma URL que el
anfitrión.) El anfitrión ve la lista de jugadores (polling existente del lobby)
y un botón **Comenzar** que llama `POST /api/narrative/sessions/:id/start` y
emite `session-joined` para navegar a StorySession.

- [ ] **Step 3: Unirse por código (no por lista)**

El modal de "Unirse" pasa a pedir SOLO: código (5 letras, uppercase automático)
y nombre. Flujo: `GET /api/narrative/sessions/code/:code` → si 404 mostrar
"Sala no encontrada" → si OK, `POST /api/narrative/sessions/:id/join` con
`{ name }` → guardar `{ sessionId, playerId }` en localStorage (claves
existentes `cronicas-session`/`cronicas-player`) → emitir `session-joined`.
Eliminar del modal los campos characterClass/country/world (quedan los defaults
del backend) — YAGNI para el milestone.

- [ ] **Step 4: Verificación manual**

Run: `npm run dev` → crear sesión en PC → unirse desde una pestaña incógnito
con el código → ambos ven la sala de espera; "Comenzar" lleva a la sesión con la
introducción de la IA visible.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/StoryLobby.vue frontend/src/App.vue
git commit -m "feat(frontend): lobby con codigo de sala, idioma es/pt y boton comenzar"
```

---

### Task 10: Frontend — sesión de juego (turnos, 280, reintento, epílogo)

**Files:**
- Modify: `frontend/src/components/StorySession.vue`
- Modify: `frontend/src/components/StoryInput.vue`

- [ ] **Step 1: StoryInput a 280 caracteres con contador**

```vue
<!-- maxlength 500 → 280; agregar contador -->
<textarea v-model="actionText" maxlength="280" ... />
<span class="char-count" :class="{ warn: actionText.length > 250 }">
  {{ actionText.length }}/280
</span>
```

- [ ] **Step 2: Indicador de turno y bloqueo fuera de turno**

StorySession ya calcula `isMyTurn` con el polling (3s). Asegurar:
- Banner visible: "✍️ Es tu turno" / "⏳ Le toca a {{ nextPlayerName }}".
- StoryInput deshabilitado si `!isMyTurn` (prop existente).
- Cuando la respuesta de POST /action trae `roundComplete: true`, refrescar
  historial inmediatamente (sin esperar el siguiente poll).

- [ ] **Step 3: Botón "Reintentar narración" (solo anfitrión)**

El anfitrión = `players[0]` (primer turn_order). Si el POST /action devolvió
error 500 al cerrar ronda, mostrar aviso con botón que llama
`POST /api/narrative/sessions/:id/retry-narrative` y refresca historial.
Igual para "Saltar turno" → `POST /sessions/:id/skip-turn`.

- [ ] **Step 4: Finalizar historia con epílogo**

El botón existente `endSession()` pasa a: confirmar → POST /end → mostrar el
`epilogue` retornado destacado al final del historial con estilo propio
(`entry-type: ai_epilogue`) y la sesión queda en modo lectura (inputs ocultos,
historia completa visible).

- [ ] **Step 5: Verificación manual y commit**

Run: partida de 2 jugadores en 2 pestañas; ronda completa → narración aparece;
finalizar → epílogo visible.

```bash
git add frontend/src/components/StorySession.vue frontend/src/components/StoryInput.vue
git commit -m "feat(frontend): turnos visibles, limite 280, retry narracion y epilogo"
```

---

### Task 11: E2E manual en LAN (criterio de éxito del milestone)

**Files:**
- Create: `docs/E2E-MILESTONE-1.md` (checklist + resultados)

- [ ] **Step 1: Preparar entorno**

`backend/.env`: `DATABASE_TYPE=sqlite`, `GEMINI_API_KEY` real (crear gratis en
https://aistudio.google.com/apikey). Run: `npm run dev` (raíz).

- [ ] **Step 2: Ejecutar checklist con 3 dispositivos en la WiFi**

```markdown
# E2E Milestone 1 — resultados (fecha)
- [ ] PC: crear sesión (género fantasía, idioma pt) → código visible
- [ ] Celular 1 y Celular 2: unirse con código + nombre
- [ ] PC: "Comenzar" → introducción de la IA EN PORTUGUÉS visible en los 3
- [ ] Ronda completa en orden → narración integra las 3 acciones
- [ ] Acción fuera de turno → bloqueada en UI y rechazada por API
- [ ] Acción de 281+ chars → imposible en UI; API la rechaza (curl)
- [ ] Celular 1 cierra el navegador → reentra con código + mismo nombre → recupera su lugar
- [ ] Reiniciar el backend a mitad de partida → sesión se retoma con el mismo código
- [ ] "Finalizar historia" → epílogo y modo lectura
- [ ] Segunda sesión en español → narración en español
```

- [ ] **Step 3: Registrar resultados y commit**

Anotar PASS/FAIL por ítem en el doc; los FAIL se arreglan antes de cerrar.

```bash
git add docs/E2E-MILESTONE-1.md
git commit -m "test(e2e): checklist y resultados del E2E LAN del milestone 1"
```

- [ ] **Step 4: Merge a master**

```bash
git checkout master
git merge modo-narrativo
```

---

## Self-review (hecho al escribir el plan)

- **Cobertura del spec:** código de sala (T1-T2, T9), Gemini (T3), idioma es/pt
  (T4, T9), turnos en orden + narración por ronda (T5), 280 chars (T5, T10),
  retry IA (T6, T10), reentrada (T6), skip turno (T6, T10), apertura (T7, T9),
  epílogo (T7, T10), SQLite persistente (T2 + config existente), LAN 0.0.0.0 +
  IP visible (T8), retomar tras reinicio (T2 lookup en DB + E2E), E2E (T11). ✔
- **Sin placeholders:** cada paso tiene código o comando concreto. Donde el
  nombre exacto de un helper existente puede diferir (`addStoryAction` vs
  `addPlayerAction`), el plan lo señala y el test define la conducta. ✔
- **Consistencia de tipos:** `generateStoryNarrative(prompt, {language, genre})`,
  `generateOpening({language, genre})`, `generateEpilogue(summary, {language, genre})`,
  `retryNarration(sessionId)`, `getSessionByCode(code)` usados con la misma firma
  en backend y frontend. ✔
- **Desvío declarado vs spec:** tiempo real por polling existente (3s) en lugar
  de push Socket.io — cumple la UX del milestone con menos superficie de cambio.
