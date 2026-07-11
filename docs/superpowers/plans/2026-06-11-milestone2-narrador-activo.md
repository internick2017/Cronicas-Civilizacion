# Milestone 2 — Narrador Activo, Resumen y Duración — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Modo Narrador Activo (la IA propone eventos y los jugadores reaccionan), resumen acumulativo persistido con botón 📖, y duración configurable (Corta 8 / Media 15 / Libre) con cierre de arcos y epílogo automático.

**Architecture:** UN solo flujo (el closeRound existente) con prompts por modo — sin motores separados. El resumen reemplaza el contexto "inicio + últimas 4" por "resumen + últimas 3" y se actualiza con una llamada corta extra tras cada ronda (tolerante a fallos). El epílogo automático reutiliza `endSession`.

**Tech Stack:** igual al M1 — Express + better-sqlite3 + vitest (backend), Vue 3 + Vite (frontend), Gemini REST (GeminiClient con thinkingBudget 0).

**Spec:** `docs/superpowers/specs/2026-06-11-milestone2-narrador-activo-design.md`
**Rama:** `milestone-2` (ya creada desde master). Working tree limpio al iniciar.

**Estado actual relevante (anclas — verificado hoy):**
- `NarrativeService.closeRound(session)` (~L438): filtra acciones del turno, `buildRoundPrompt`, `generateStoryNarrative(prompt, {language, genre})` (throw → `err.code='AI_NARRATION_FAILED'`), `aiText ?? getFallbackNarrative(...)`, `addAINarrative`, `turnNumber += 1`, persiste.
- `buildRoundPrompt(session, roundActions)` (~L577): contexto = opening + últimas 4 con etiquetas "CONTEXTO — YA NARRADO ANTES (solo para tu memoria, NO lo repitas)".
- `createSession` (~L178) normaliza `settings.language` con `normalizeLanguage`.
- `narrativePrompts.js`: `getNarratorSystemPrompt(language, genre)`, `getOpeningPrompt(language, genre)`, `getEpiloguePrompt(language)`, `normalizeLanguage` exportado.
- `StorySession` ya tiene `isRoundPending()` y `toJSON()` expone `roundPending`. OJO: existe un método `getSummary()` (payload del lobby) — el campo nuevo se llama `summary` (sinopsis); NO confundirlos ni renombrar el método.
- Tests actuales: 52 verdes + 6 pre-existentes de auth que FALLAN (ignorarlos siempre; no agregar nuevos fallos).

---

### Task 1: Modelo + persistencia — mode, maxRounds y summary

**Files:**
- Modify: `backend/src/models/StorySession.js`
- Modify: `backend/src/services/NarrativeService.js` (createSession, hydrateSessionFromRows, saveSessionToDatabase)
- Modify: `backend/src/config/database-sqlite.js`
- Test: `backend/test/milestone2Model.test.js` (nuevo)

- [ ] **Step 1: Test que falla**

```javascript
// backend/test/milestone2Model.test.js
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
```

- [ ] **Step 2: Verificar FAIL** — `cd backend; npx vitest run test/milestone2Model.test.js`

- [ ] **Step 3: Implementar**

`StorySession.js` (constructor): agregar a los defaults de settings y el campo nuevo:
```javascript
// dentro del merge de settings (donde ya están genre, language, etc.):
mode: data.settings?.mode ?? 'narrador-activo',
maxRounds: data.settings?.maxRounds ?? null,
// campo de instancia (junto a this.code):
this.summary = data.summary ?? '';
```
Y en `toJSON()`:
```javascript
summary: this.summary,
roundsRemaining: this.settings.maxRounds
  ? Math.max(0, this.settings.maxRounds - this.turnNumber + 1)
  : null,
```

`NarrativeService.createSession`: junto a la normalización de language:
```javascript
const VALID_MODES = ['narrador-activo', 'colaborativo'];
sessionData.settings = sessionData.settings || {};
sessionData.settings.mode = VALID_MODES.includes(sessionData.settings.mode)
  ? sessionData.settings.mode : 'narrador-activo';
const mr = Number(sessionData.settings.maxRounds);
sessionData.settings.maxRounds = Number.isInteger(mr) && mr >= 3 && mr <= 50 ? mr : null;
```

`database-sqlite.js` (junto a la migración de `code`):
```javascript
try {
  db.exec(`ALTER TABLE story_sessions ADD COLUMN summary TEXT`);
} catch (e) {
  if (!/duplicate column name/i.test(e.message)) throw e;
}
```
(y `summary TEXT` en el CREATE TABLE). `saveSessionToDatabase`: incluir `summary` en INSERT y en el ON CONFLICT UPDATE (mismo patrón que `code`/`settings`). `hydrateSessionFromRows`: pasar `summary: sessionData.summary ?? ''` al constructor. Los settings (mode/maxRounds) ya viajan dentro del JSON de `settings` — verificar que el stringify/parse existente los preserva (no hay columna nueva para ellos).

- [ ] **Step 4: Verificar PASS** (3 tests) y suite completa: `npx vitest run` → 55 verdes esperados (52+3).

- [ ] **Step 5: Commit**
```bash
git add -A
git commit -m "feat(m2): mode, maxRounds y summary en el modelo de sesion con persistencia"
```

---

### Task 2: Prompts por modo + cierre de arcos + resumen

**Files:**
- Modify: `backend/src/services/narrativePrompts.js`
- Test: `backend/test/narrativePrompts.test.js` (ampliar)

- [ ] **Step 1: Tests que fallan** (agregar al describe existente)

```javascript
import { getNarratorSystemPrompt, getEpiloguePrompt, getOpeningPrompt,
  getClosingArcsInstruction, getSummaryPrompt } from '../src/services/narrativePrompts.js';

it('narrador-activo agrega la instrucción de evento (es y pt); colaborativo no', () => {
  const esActivo = getNarratorSystemPrompt('es', 'fantasy', 'narrador-activo');
  expect(esActivo).toContain('evento');
  expect(esActivo).toContain('protagonismo');
  const ptActivo = getNarratorSystemPrompt('pt', 'fantasy', 'narrador-activo');
  expect(ptActivo).toContain('evento');
  const colaborativo = getNarratorSystemPrompt('es', 'fantasy', 'colaborativo');
  expect(colaborativo).not.toContain('protagonismo');
});

it('la apertura en narrador-activo termina con el primer evento', () => {
  expect(getOpeningPrompt('es', 'fantasy', 'narrador-activo')).toContain('primer evento');
  expect(getOpeningPrompt('pt', 'fantasy', 'narrador-activo')).toContain('primeiro evento');
  expect(getOpeningPrompt('es', 'fantasy', 'colaborativo')).not.toContain('primer evento');
});

it('instrucción de cierre de arcos según rondas restantes (es y pt)', () => {
  expect(getClosingArcsInstruction('es', 2)).toContain('2');
  expect(getClosingArcsInstruction('es', 2)).toContain('arcos');
  expect(getClosingArcsInstruction('pt', 1)).toContain('arcos');
});

it('prompt de resumen pide máximo 150 palabras (es y pt)', () => {
  expect(getSummaryPrompt('es')).toContain('150');
  expect(getSummaryPrompt('pt')).toContain('150');
});
```

- [ ] **Step 2: Verificar FAIL.**

- [ ] **Step 3: Implementar** (en narrativePrompts.js)

```javascript
const ACTIVE_NARRATOR_EXTRA = {
  es: ` Además, en este modo TÚ llevas la iniciativa de la historia: termina SIEMPRE tu ` +
    `narración planteando el siguiente evento, peligro o situación que exija una reacción ` +
    `(una pregunta abierta, una amenaza inminente, un descubrimiento). Varía entre eventos ` +
    `globales que afectan a todos y eventos dirigidos a un personaje específico por su nombre, ` +
    `rotando el protagonismo entre los jugadores a lo largo de las rondas para que cada uno ` +
    `tenga su momento.`,
  pt: ` Além disso, neste modo VOCÊ conduz a iniciativa da história: termine SEMPRE a sua ` +
    `narração propondo o próximo evento, perigo ou situação que exija uma reação ` +
    `(uma pergunta aberta, uma ameaça iminente, uma descoberta). Varie entre eventos globais ` +
    `que afetam a todos e eventos dirigidos a um personagem específico pelo nome, ` +
    `alternando o protagonismo entre os jogadores ao longo das rodadas.`,
};

const ACTIVE_OPENING_EXTRA = {
  es: ` Termina la introducción planteando el primer evento de la historia: una situación ` +
    `concreta que exija la reacción inmediata de los protagonistas.`,
  pt: ` Termine a introdução propondo o primeiro evento da história: uma situação concreta ` +
    `que exija a reação imediata dos protagonistas.`,
};

const CLOSING_ARCS = {
  es: (n) => `ATENCIÓN: quedan solo ${n} ronda(s) para el final de la historia. Empieza a ` +
    `cerrar los arcos de los personajes y encamina los hechos hacia un desenlace.`,
  pt: (n) => `ATENÇÃO: faltam apenas ${n} rodada(s) para o final da história. Comece a ` +
    `fechar os arcos dos personagens e encaminhe os fatos para um desfecho.`,
};

const SUMMARY_PROMPT = {
  es: `Actualiza la sinopsis de la historia incorporando los hechos nuevos. Conserva nombres, ` +
    `lugares y hechos clave ya establecidos. Máximo 150 palabras, en español, en tercera persona.`,
  pt: `Atualize a sinopse da história incorporando os fatos novos. Conserve nomes, lugares e ` +
    `fatos-chave já estabelecidos. Máximo de 150 palavras, em português, na terceira pessoa.`,
};
```

Firmas modificadas/nuevas (mantener compatibilidad: `mode` con default):
```javascript
export function getNarratorSystemPrompt(language, genre = 'fantasy', mode = 'colaborativo') {
  const l = normalizeLanguage(language);
  const base = NARRATOR[l](GENRES[l][genre] || genre);
  return mode === 'narrador-activo' ? base + ACTIVE_NARRATOR_EXTRA[l] : base;
}
export function getOpeningPrompt(language, genre = 'fantasy', mode = 'colaborativo') {
  const l = normalizeLanguage(language);
  const base = OPENING[l](GENRES[l][genre] || genre);
  return mode === 'narrador-activo' ? base + ACTIVE_OPENING_EXTRA[l] : base;
}
export function getClosingArcsInstruction(language, roundsRemaining) {
  return CLOSING_ARCS[normalizeLanguage(language)](roundsRemaining);
}
export function getSummaryPrompt(language) {
  return SUMMARY_PROMPT[normalizeLanguage(language)];
}
```

- [ ] **Step 4: PASS** (4 nuevos) + suite completa (59 esperados).

- [ ] **Step 5: Commit**
```bash
git add -A
git commit -m "feat(m2): prompts por modo, instruccion de cierre de arcos y prompt de resumen"
```

---

### Task 3: AIService — mode en narrativa/apertura + generateSummary

**Files:**
- Modify: `backend/src/services/AIService.js`
- Test: `backend/test/aiServiceM2.test.js` (nuevo)

- [ ] **Step 1: Test que falla**

```javascript
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
```
NOTA: si `AIService` no se exporta como clase con nombre, agregar `export class AIService` (manteniendo el default existente), igual que se hizo con NarrativeService.

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implementar**

```javascript
// firmas actualizadas (default mode para no romper callers existentes):
async generateStoryNarrative(prompt, { language = 'es', genre = 'fantasy', mode = 'colaborativo' } = {}) {
  if (!this.gemini.isConfigured()) return null;
  return await this.gemini.generate(prompt, {
    systemPrompt: getNarratorSystemPrompt(language, genre, mode),
    temperature: 0.8, maxOutputTokens: 400,
  });
}

async generateOpening({ language = 'es', genre = 'fantasy', mode = 'colaborativo' } = {}) {
  if (!this.gemini.isConfigured()) return null;
  return await this.gemini.generate(getOpeningPrompt(language, genre, mode), {
    systemPrompt: getNarratorSystemPrompt(language, genre, mode),
    temperature: 0.9, maxOutputTokens: 300,
  });
}

/**
 * @returns {Promise<string|null>} null cuando la IA no está configurada.
 */
async generateSummary(previousSummary, newNarrative, { language = 'es' } = {}) {
  if (!this.gemini.isConfigured()) return null;
  const prompt = `SINOPSIS ACTUAL:\n${previousSummary || '(la historia recién comienza)'}\n\n` +
    `HECHOS NUEVOS:\n${newNarrative}`;
  return await this.gemini.generate(prompt, {
    systemPrompt: getSummaryPrompt(language),
    temperature: 0.4, maxOutputTokens: 250,
  });
}
```
(importar `getSummaryPrompt` junto a los imports existentes de narrativePrompts.)

- [ ] **Step 4: PASS** (4 nuevos) + suite (63 esperados).

- [ ] **Step 5: Commit**
```bash
git add -A
git commit -m "feat(m2): AIService con modo en narrativa/apertura y generateSummary"
```

---

### Task 4: closeRound — resumen, cierre de arcos y epílogo automático

**Files:**
- Modify: `backend/src/services/NarrativeService.js` (closeRound, buildRoundPrompt, startSession)
- Test: `backend/test/milestone2Round.test.js` (nuevo)

- [ ] **Step 1: Tests que fallan**

```javascript
// backend/test/milestone2Round.test.js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NarrativeService } from '../src/services/NarrativeService.js';

async function makeSession(svc, settings = {}) {
  const session = await svc.createSession({ title: 'T', settings: { language: 'es', ...settings } });
  const { player: ana } = await svc.joinSession(session.id, { name: 'Ana' });
  const { player: beto } = await svc.joinSession(session.id, { name: 'Beto' });
  session.isActive = true;
  return { session, ana, beto };
}

async function playRound(svc, session, ana, beto) {
  await svc.submitAction(session.id, ana.id, 'a');
  return await svc.submitAction(session.id, beto.id, 'b');
}

describe('M2 — closeRound con resumen, arcos y epílogo automático', () => {
  let svc;
  beforeEach(() => {
    svc = new NarrativeService({ skipDatabase: true });
    svc.aiService = {
      generateStoryNarrative: vi.fn().mockResolvedValue('narración'),
      generateSummary: vi.fn().mockResolvedValue('sinopsis actualizada'),
      generateEpilogue: vi.fn().mockResolvedValue('epílogo'),
      generateOpening: vi.fn().mockResolvedValue('apertura'),
    };
  });

  it('actualiza el summary tras cerrar la ronda', async () => {
    const { session, ana, beto } = await makeSession(svc);
    await playRound(svc, session, ana, beto);
    expect(svc.aiService.generateSummary).toHaveBeenCalledWith('', 'narración',
      expect.objectContaining({ language: 'es' }));
    expect(session.summary).toBe('sinopsis actualizada');
  });

  it('si el resumen falla, se conserva el anterior y la ronda NO falla', async () => {
    const { session, ana, beto } = await makeSession(svc);
    session.summary = 'resumen previo';
    svc.aiService.generateSummary.mockRejectedValueOnce(new Error('boom'));
    const r = await playRound(svc, session, ana, beto);
    expect(r.narrative).toBe('narración');
    expect(session.summary).toBe('resumen previo');
  });

  it('con summary presente, el prompt de ronda usa el resumen (no el inicio completo)', async () => {
    const { session, ana, beto } = await makeSession(svc);
    session.summary = 'LA SINOPSIS';
    session.addAINarrative('apertura vieja');
    await playRound(svc, session, ana, beto);
    const prompt = svc.aiService.generateStoryNarrative.mock.calls[0][0];
    expect(prompt).toContain('LA SINOPSIS');
    expect(prompt).not.toContain('apertura vieja'); // queda cubierta por las últimas 3 solo si es reciente
  });

  it('agrega la instrucción de cierre de arcos cuando quedan <= 2 rondas', async () => {
    const { session, ana, beto } = await makeSession(svc, { maxRounds: 8 });
    session.turnNumber = 7; // roundsRemaining = 2
    await playRound(svc, session, ana, beto);
    const prompt = svc.aiService.generateStoryNarrative.mock.calls[0][0];
    expect(prompt).toContain('arcos');
  });

  it('NO agrega cierre de arcos lejos del final', async () => {
    const { session, ana, beto } = await makeSession(svc, { maxRounds: 8 });
    await playRound(svc, session, ana, beto); // turnNumber 1 → remaining 8
    const prompt = svc.aiService.generateStoryNarrative.mock.calls[0][0];
    expect(prompt).not.toContain('ATENCIÓN');
  });

  it('al completarse la última ronda genera el epílogo automáticamente y desactiva', async () => {
    const { session, ana, beto } = await makeSession(svc, { maxRounds: 3 });
    session.turnNumber = 3; // jugando la última ronda
    const r = await playRound(svc, session, ana, beto);
    expect(svc.aiService.generateEpilogue).toHaveBeenCalled();
    expect(session.isActive).toBe(false);
    expect(session.storyHistory.at(-1).type).toBe('ai_epilogue');
    expect(r.sessionEnded).toBe(true);
  });

  it('NO genera epílogo antes de la última ronda', async () => {
    const { session, ana, beto } = await makeSession(svc, { maxRounds: 3 });
    session.turnNumber = 2;
    const r = await playRound(svc, session, ana, beto);
    expect(svc.aiService.generateEpilogue).not.toHaveBeenCalled();
    expect(session.isActive).toBe(true);
    expect(r.sessionEnded).toBeUndefined();
  });

  it('pasa el modo de la sesión a la IA', async () => {
    const { session, ana, beto } = await makeSession(svc, { mode: 'narrador-activo' });
    await playRound(svc, session, ana, beto);
    const opts = svc.aiService.generateStoryNarrative.mock.calls[0][1];
    expect(opts.mode).toBe('narrador-activo');
  });
});
```

- [ ] **Step 2: FAIL.**

- [ ] **Step 3: Implementar**

`buildRoundPrompt` — con summary usa "[RESUMEN DE LA HISTORIA] + [ÚLTIMAS RONDAS] (3)"; sin summary mantiene el comportamiento actual (opening + últimas 4) para sesiones viejas:
```javascript
buildRoundPrompt(session, roundActions) {
  const allNarratives = session.storyHistory.filter(e => e.type === 'ai_narrative');
  const actions = roundActions.map(e => `${e.playerName ?? '?'}: ${e.action}`).join('\n');
  const task = `\n\nACCIONES DE ESTA RONDA:\n${actions}\n\nTu tarea: continúa la historia narrando SOLO el resultado de las acciones de esta ronda (100-180 palabras), como si fuera el siguiente párrafo del libro.`;

  let context = '';
  if (session.summary) {
    const recent = allNarratives.slice(-3).map(e => e.narrative).join('\n');
    context = `CONTEXTO — YA NARRADO ANTES (solo para tu memoria, NO lo repitas):\n[RESUMEN DE LA HISTORIA]\n${session.summary}`;
    if (recent) context += `\n[ÚLTIMAS RONDAS]\n${recent}`;
  } else if (allNarratives.length > 0) {
    // sesiones sin resumen aún (o IA no configurada): comportamiento del M1
    const opening = allNarratives[0];
    const recent = allNarratives.slice(-4).filter(e => e !== opening).map(e => e.narrative).join('\n');
    context = `CONTEXTO — YA NARRADO ANTES (solo para tu memoria, NO lo repitas):\n[INICIO DE LA HISTORIA]\n${opening.narrative}`;
    if (recent) context += `\n[ÚLTIMAS RONDAS]\n${recent}`;
  }

  let prompt = context ? context + task : task.trimStart();

  // Cierre de arcos cuando se acerca el final
  const remaining = session.settings.maxRounds
    ? Math.max(0, session.settings.maxRounds - session.turnNumber + 1) : null;
  if (remaining !== null && remaining <= 2) {
    prompt += `\n\n${getClosingArcsInstruction(session.settings.language, remaining)}`;
  }
  return prompt;
}
```
OJO con el test 3: con summary presente, las "últimas 3" PUEDEN incluir la apertura si la historia es corta — el test usa una sola narración vieja ('apertura vieja') que SÍ estaría en las últimas 3. Para cumplir el contrato del spec (el resumen REEMPLAZA al inicio), cuando hay summary las últimas-N se toman EXCLUYENDO la primera narración (la apertura): `allNarratives.slice(1).slice(-3)`. Ajustar el código de arriba en consecuencia.

`closeRound` — agregar mode, resumen y epílogo automático (mantener el contrato de errores intacto):
```javascript
async closeRound(session) {
  const roundActions = session.storyHistory.filter(
    e => e.type === 'player_action' && e.turnNumber === session.turnNumber
  );
  const prompt = this.buildRoundPrompt(session, roundActions);
  const language = (session.settings && session.settings.language) || 'es';
  const genre = (session.settings && session.settings.genre) || 'fantasy';
  const mode = (session.settings && session.settings.mode) || 'colaborativo';

  let aiText;
  try {
    aiText = await this.aiService.generateStoryNarrative(prompt, { language, genre, mode });
  } catch (err) {
    err.code = 'AI_NARRATION_FAILED';
    throw err;
  }

  const narrative = aiText ?? this.getFallbackNarrative({ characterName: 'los héroes' });
  const aiEntry = session.addAINarrative(narrative);
  if (!this.skipDatabase) await this.saveStoryEntryToDatabase(session.id, aiEntry);

  // Resumen acumulativo — NUNCA bloquea la ronda
  try {
    const updated = await this.aiService.generateSummary(session.summary, narrative, { language });
    if (updated) session.summary = updated;
  } catch (err) {
    logger.warn('No se pudo actualizar el resumen; se conserva el anterior:', err.message);
  }

  session.turnNumber += 1;
  if (!this.skipDatabase) await this.saveSessionToDatabase(session);
  return narrative;
}
```
(usar el logger real del archivo; si no hay, console.warn.)

Epílogo automático — en `submitAction` y `skipTurn`, tras `closeRound`:
```javascript
// en submitAction, dentro de if (roundComplete) tras closeRound:
let sessionEnded;
if (session.settings.maxRounds && session.turnNumber > session.settings.maxRounds) {
  await this.endSession(session.id); // genera epílogo, isActive=false, persiste
  sessionEnded = true;
}
// e incluir sessionEnded en el objeto de retorno (undefined si no aplica):
return { action: entry, narrative, nextPlayer: ..., turnNumber: ..., roundComplete, ...(sessionEnded && { sessionEnded }) };
```
(replicar el mismo bloque en `skipTurn` cuando cierra ronda con acciones.)

`startSession` — pasar `mode` al generateOpening:
```javascript
const aiOpening = await this.aiService.generateOpening({
  language: session.settings.language, genre: session.settings.genre,
  mode: session.settings.mode,
});
```

- [ ] **Step 4: PASS** (8 nuevos) + suite completa (71 esperados, 6 auth pre-existentes).

- [ ] **Step 5: Commit**
```bash
git add -A
git commit -m "feat(m2): resumen acumulativo, cierre de arcos y epilogo automatico en closeRound"
```

---

### Task 5: Frontend — crear sesión con estilo y duración

**Files:**
- Modify: `frontend/src/components/StoryLobby.vue`

- [ ] **Step 1: Agregar al form de crear** (junto a género/idioma):

```vue
<div class="form-group">
  <label for="mode">Estilo de narración</label>
  <select id="mode" v-model="newSession.settings.mode">
    <option value="narrador-activo">🎭 Narrador Activo — la IA propone, ustedes reaccionan</option>
    <option value="colaborativo">✍️ Colaborativo — ustedes proponen, la IA integra</option>
  </select>
</div>
<div class="form-group">
  <label for="duration">Duración</label>
  <select id="duration" v-model="newSession.settings.maxRounds">
    <option :value="null">Libre — el anfitrión decide cuándo terminar</option>
    <option :value="8">Corta — 8 rondas</option>
    <option :value="15">Media — 15 rondas</option>
  </select>
</div>
```
Estado inicial: `mode: 'narrador-activo'`, `maxRounds: null` dentro de `newSession.settings`. Ambos viajan en el POST /sessions existente (settings). Resetearlos tras crear, como los demás campos.

- [ ] **Step 2: Verificar** — `cd frontend; npx vite build` → limpio.

- [ ] **Step 3: Commit**
```bash
git add -A
git commit -m "feat(m2): selector de estilo de narracion y duracion al crear sesion"
```

---

### Task 6: Frontend — botón 📖 resumen, contador de rondas y placeholder por modo

**Files:**
- Modify: `frontend/src/components/StorySession.vue`
- Modify: `frontend/src/components/StoryInput.vue`

- [ ] **Step 1: Botón y panel de resumen** (StorySession)

Botón `📖` en la cabecera (junto a los controles existentes), visible siempre. Al tocarlo abre un panel/modal:
```vue
<div v-if="showSummary" class="summary-modal" @click.self="showSummary = false">
  <div class="summary-content">
    <h3>📖 ¿Qué ha pasado hasta ahora?</h3>
    <p v-if="session?.summary">{{ session.summary }}</p>
    <p v-else class="empty">Aún no hay resumen — se genera al cerrar la primera ronda.</p>
    <button class="close-btn" @click="showSummary = false">Cerrar</button>
  </div>
</div>
```
`showSummary = ref(false)`. CSS: overlay centrado; en `@media (max-width: 768px)` el `.summary-content` ocupa pantalla completa con scroll. El summary llega en el poll existente (session.toJSON ya lo trae — sin requests nuevos).

- [ ] **Step 2: Contador de rondas** (StorySession, en la cabecera junto al turno):

```vue
<span v-if="session?.roundsRemaining !== null && session?.settings?.maxRounds" class="rounds-badge">
  Ronda {{ session.turnNumber }} de {{ session.settings.maxRounds }}
</span>
```
Cuando el poll detecte `isActive === false` (epílogo automático), el flujo de solo-lectura existente ya aplica — verificar que al cerrar la última ronda el cliente refresca historial inmediato (la respuesta del POST /action trae `sessionEnded: true` → forzar `loadSession()+loadHistory()`).

- [ ] **Step 3: Placeholder por modo** (StoryInput)

StorySession ya pasa props a StoryInput — agregar prop `mode` (desde `session?.settings?.mode`). En StoryInput, placeholder del textarea:
```javascript
const placeholder = computed(() =>
  props.mode === 'narrador-activo'
    ? '¿Cómo reacciona tu personaje al evento? (ej: "Me escondo tras el árbol y observo...")'
    : props.placeholder /* el actual por gameType */
);
```

- [ ] **Step 4: Verificar** — `npx vite build` limpio + smoke con 2 pestañas si el server está corriendo.

- [ ] **Step 5: Commit**
```bash
git add -A
git commit -m "feat(m2): boton de resumen, contador de rondas y placeholder de reaccion"
```

---

### Task 7: E2E manual del M2

**Files:**
- Create: `docs/E2E-MILESTONE-2.md`

- [ ] **Step 1: Crear checklist**

```markdown
# E2E Milestone 2 — Narrador Activo (con la familia, LAN)

Pre: GEMINI_API_KEY activa, DATABASE_TYPE=sqlite, `npm run dev`.

- [ ] Crear sesión: 🎭 Narrador Activo + Corta (8 rondas) + español → la apertura TERMINA con un evento que pide reacción
- [ ] El placeholder del input dice "¿Cómo reacciona tu personaje...?"
- [ ] Ronda completa → la narración resuelve las reacciones Y plantea el siguiente evento
- [ ] En 3+ rondas: al menos un evento dirigido a un personaje por nombre (rotación de protagonismo)
- [ ] Botón 📖 muestra el resumen actualizado (y en el teléfono ocupa pantalla completa)
- [ ] Contador "Ronda X de 8" visible y avanza
- [ ] Rondas 7-8: la narración empieza a cerrar arcos
- [ ] Al cerrar la ronda 8: epílogo automático + modo lectura en TODOS los dispositivos
- [ ] Partida 2 (Colaborativo + Libre + pt): comportamiento del M1 intacto, narración en portugués, 🏁 manual funciona
- [ ] Reinicio del server a mitad de partida → resumen y contador sobreviven
```

- [ ] **Step 2: Commit**
```bash
git add docs/E2E-MILESTONE-2.md
git commit -m "test(e2e): checklist del milestone 2"
```

---

## Self-review (hecho al escribir el plan)

- **Cobertura del spec:** mode+maxRounds+summary modelo/DB (T1), prompts por modo + arcos + resumen (T2), AIService (T3), closeRound integrado + epílogo automático + sessionEnded (T4), selectores al crear (T5), 📖 + contador + placeholder (T6), E2E (T7). Botón 🏁 manual: intacto (no se toca endSession para el flujo manual). ✔
- **Sin placeholders:** cada paso tiene código o markup concreto; las anclas citan líneas reales del código actual. ✔
- **Consistencia de firmas:** `getNarratorSystemPrompt(language, genre, mode)` con default 'colaborativo' usada igual en T2/T3/T4; `generateSummary(previousSummary, newNarrative, {language})` igual en T3/T4; `sessionEnded` definido en T4 y consumido en T6; `roundsRemaining` (T1) = la fórmula del spec. ✔
- **Nota test 3 de T4:** el plan ya indica el ajuste (`slice(1).slice(-3)` cuando hay summary) para que la apertura quede representada SOLO por el resumen. ✔
