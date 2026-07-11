# Escritura simultánea — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir un modo opt-in de turnos simultáneos donde todos los jugadores escriben su acción a la vez dentro de una ronda.

**Architecture:** Un setting `settings.turnMode` (`sequential` por defecto | `simultaneous`). El estado "quién envió esta ronda" se deriva del `storyHistory` (sin migración). En simultáneo, `submitAction` no exige orden y la ronda se cierra cuando todos enviaron (o el host fuerza con `closeRoundNow`). La narración (`closeRound`) no cambia.

**Tech Stack:** Node/Express, Vitest (backend), Vue 3 (`<script setup>`), Socket.io polling.

## Global Constraints

- Modo opt-in: `settings.turnMode ∈ {'sequential','simultaneous'}`, default `'sequential'`.
- Sin migración de base de datos: el estado de envíos se deriva de `storyHistory`.
- Tope de acción: 280 caracteres (sin cambios).
- El modo secuencial debe quedar **idéntico** a hoy (los tests previos del M2 deben seguir verdes).
- Backend con TDD (Vitest). Frontend con checklist manual (sin runner).
- Patrón de test: `new NarrativeService({ skipDatabase: true })` + reemplazar `svc.aiService` por un mock (ver `backend/test/milestone2Round.test.js`).

---

### Task 1: Setting `turnMode` (modelo + validación)

**Files:**
- Modify: `backend/src/models/StorySession.js` (constructor `settings`, ~líneas 23-32)
- Modify: `backend/src/services/NarrativeService.js` (`createSession`, ~líneas 186-192)
- Test: `backend/test/simultaneousTurns.test.js` (nuevo)

**Interfaces:**
- Produces: `session.settings.turnMode: 'sequential' | 'simultaneous'`

- [ ] **Step 1: Escribir el test que falla**

Create `backend/test/simultaneousTurns.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NarrativeService } from '../src/services/NarrativeService.js';

function mockAi(svc) {
  svc.aiService = {
    generateStoryNarrative: vi.fn().mockResolvedValue('narración'),
    generateSummary: vi.fn().mockResolvedValue('sinopsis'),
    generateEpilogue: vi.fn().mockResolvedValue('epílogo'),
    generateOpening: vi.fn().mockResolvedValue('apertura'),
  };
}

async function makeSession(svc, settings = {}) {
  const session = await svc.createSession({ title: 'T', settings: { language: 'es', ...settings } });
  const { player: ana } = await svc.joinSession(session.id, { name: 'Ana' });
  const { player: beto } = await svc.joinSession(session.id, { name: 'Beto' });
  const { player: cris } = await svc.joinSession(session.id, { name: 'Cris' });
  session.isActive = true;
  return { session, ana, beto, cris };
}

describe('turnMode setting', () => {
  let svc;
  beforeEach(() => { svc = new NarrativeService({ skipDatabase: true }); mockAi(svc); });

  it('por defecto es sequential', async () => {
    const s = await svc.createSession({ title: 'T', settings: { language: 'es' } });
    expect(s.settings.turnMode).toBe('sequential');
  });

  it('acepta simultaneous', async () => {
    const s = await svc.createSession({ title: 'T', settings: { turnMode: 'simultaneous' } });
    expect(s.settings.turnMode).toBe('simultaneous');
  });

  it('un turnMode inválido cae a sequential', async () => {
    const s = await svc.createSession({ title: 'T', settings: { turnMode: 'loquesea' } });
    expect(s.settings.turnMode).toBe('sequential');
  });
});
```

- [ ] **Step 2: Correr el test y verlo fallar**

Run: `cd backend && npx vitest run test/simultaneousTurns.test.js`
Expected: FAIL (turnMode es `undefined`).

- [ ] **Step 3: Implementar**

En `backend/src/models/StorySession.js`, dentro del objeto `this.settings` (después de `maxRounds: data.settings?.maxRounds ?? null,`):

```js
      mode: data.settings?.mode ?? 'narrador-activo',
      maxRounds: data.settings?.maxRounds ?? null,
      turnMode: data.settings?.turnMode ?? 'sequential',
```

En `backend/src/services/NarrativeService.js`, dentro de `createSession`, justo después del bloque que valida `maxRounds` (después de `sessionData.settings.maxRounds = ...`):

```js
    const VALID_TURN_MODES = ['sequential', 'simultaneous'];
    sessionData.settings.turnMode = VALID_TURN_MODES.includes(sessionData.settings.turnMode)
      ? sessionData.settings.turnMode : 'sequential';
```

- [ ] **Step 4: Correr el test y verlo pasar**

Run: `cd backend && npx vitest run test/simultaneousTurns.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/models/StorySession.js backend/src/services/NarrativeService.js backend/test/simultaneousTurns.test.js
git commit -m "feat(simultaneo): setting turnMode (sequential|simultaneous) con default y validacion"
```

---

### Task 2: Helpers de envíos en el modelo

**Files:**
- Modify: `backend/src/models/StorySession.js` (métodos nuevos + `toJSON`)
- Test: `backend/test/simultaneousTurns.test.js` (agregar describe)

**Interfaces:**
- Produces:
  - `session.actedPlayerIds(): string[]` — ids con `player_action` en el `turnNumber` actual
  - `session.hasActed(playerId: string): boolean`
  - `session.allActed(): boolean` — todos los jugadores ya enviaron esta ronda
  - `toJSON().actedPlayerIds: string[]`

- [ ] **Step 1: Escribir el test que falla**

Agregar al final de `backend/test/simultaneousTurns.test.js` (antes del cierre del archivo):

```js
describe('helpers de envíos del modelo', () => {
  let svc;
  beforeEach(() => { svc = new NarrativeService({ skipDatabase: true }); mockAi(svc); });

  it('actedPlayerIds / hasActed / allActed reflejan los envíos de la ronda', async () => {
    const { session, ana, beto, cris } = await makeSession(svc, { turnMode: 'simultaneous' });
    expect(session.actedPlayerIds()).toEqual([]);
    expect(session.allActed()).toBe(false);

    session.addPlayerAction(ana.id, 'a');
    expect(session.hasActed(ana.id)).toBe(true);
    expect(session.hasActed(beto.id)).toBe(false);
    expect(session.allActed()).toBe(false);

    session.addPlayerAction(beto.id, 'b');
    session.addPlayerAction(cris.id, 'c');
    expect(session.allActed()).toBe(true);
    expect(session.toJSON().actedPlayerIds.sort()).toEqual([ana.id, beto.id, cris.id].sort());
  });

  it('actedPlayerIds solo cuenta la ronda actual', async () => {
    const { session, ana } = await makeSession(svc, { turnMode: 'simultaneous' });
    session.addPlayerAction(ana.id, 'vieja');
    session.turnNumber = 2;
    expect(session.actedPlayerIds()).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `cd backend && npx vitest run test/simultaneousTurns.test.js`
Expected: FAIL (`actedPlayerIds is not a function`).

- [ ] **Step 3: Implementar**

En `backend/src/models/StorySession.js`, agregar estos métodos después de `getCurrentPlayer()` (~línea 151):

```js
  /**
   * Ids de jugadores con una acción registrada en el turnNumber actual.
   */
  actedPlayerIds() {
    const ids = new Set();
    for (const e of this.storyHistory) {
      if (e.type === 'player_action' && e.turnNumber === this.turnNumber) ids.add(e.playerId);
    }
    return [...ids];
  }

  hasActed(playerId) {
    return this.actedPlayerIds().includes(playerId);
  }

  /**
   * True cuando todos los jugadores de la sesión ya enviaron su acción esta ronda.
   */
  allActed() {
    if (this.players.length === 0) return false;
    const acted = new Set(this.actedPlayerIds());
    return this.players.every(p => acted.has(p.id));
  }
```

En `toJSON()`, agregar la propiedad (después de `roundPending: this.isRoundPending()`):

```js
      roundPending: this.isRoundPending(),
      actedPlayerIds: this.actedPlayerIds()
```

- [ ] **Step 4: Correr y ver pasar**

Run: `cd backend && npx vitest run test/simultaneousTurns.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/models/StorySession.js backend/test/simultaneousTurns.test.js
git commit -m "feat(simultaneo): helpers actedPlayerIds/hasActed/allActed y exposicion en toJSON"
```

---

### Task 3: `submitAction` en modo simultáneo

**Files:**
- Modify: `backend/src/services/NarrativeService.js` (`submitAction`, ~líneas 491-537)
- Test: `backend/test/simultaneousTurns.test.js` (agregar describe)

**Interfaces:**
- Consumes: `session.allActed()`, `session.settings.turnMode` (Tasks 1-2)
- Produces: `submitAction` no exige orden en simultáneo; cierra ronda con `allActed()`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `backend/test/simultaneousTurns.test.js`:

```js
describe('submitAction simultáneo', () => {
  let svc;
  beforeEach(() => { svc = new NarrativeService({ skipDatabase: true }); mockAi(svc); });

  it('cualquier jugador puede enviar sin esperar orden', async () => {
    const { session, beto } = await makeSession(svc, { turnMode: 'simultaneous' });
    // beto (índice 1) envía primero sin error
    const r = await svc.submitAction(session.id, beto.id, 'acción de beto');
    expect(r.roundComplete).toBe(false);
  });

  it('bloquea reenvío del mismo jugador en la ronda', async () => {
    const { session, ana } = await makeSession(svc, { turnMode: 'simultaneous' });
    await svc.submitAction(session.id, ana.id, 'una');
    await expect(svc.submitAction(session.id, ana.id, 'otra')).rejects.toThrow(/Ya enviaste/);
  });

  it('NO cierra la ronda hasta que todos enviaron; cierra al último', async () => {
    const { session, ana, beto, cris } = await makeSession(svc, { turnMode: 'simultaneous' });
    expect((await svc.submitAction(session.id, ana.id, 'a')).roundComplete).toBe(false);
    expect((await svc.submitAction(session.id, beto.id, 'b')).roundComplete).toBe(false);
    expect(svc.aiService.generateStoryNarrative).not.toHaveBeenCalled();
    const r = await svc.submitAction(session.id, cris.id, 'c');
    expect(r.roundComplete).toBe(true);
    expect(r.narrative).toBe('narración');
    expect(svc.aiService.generateStoryNarrative).toHaveBeenCalledTimes(1);
    expect(session.turnNumber).toBe(2);
  });

  it('el prompt de cierre incluye las acciones de todos', async () => {
    const { session, ana, beto, cris } = await makeSession(svc, { turnMode: 'simultaneous' });
    await svc.submitAction(session.id, ana.id, 'AAA');
    await svc.submitAction(session.id, beto.id, 'BBB');
    await svc.submitAction(session.id, cris.id, 'CCC');
    const prompt = svc.aiService.generateStoryNarrative.mock.calls[0][0];
    expect(prompt).toContain('AAA');
    expect(prompt).toContain('BBB');
    expect(prompt).toContain('CCC');
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `cd backend && npx vitest run test/simultaneousTurns.test.js`
Expected: FAIL (en simultáneo, `submitAction` de beto lanza "No es tu turno").

- [ ] **Step 3: Implementar**

En `backend/src/services/NarrativeService.js`, reemplazar el cuerpo de `submitAction` (desde la validación de `current` hasta el cálculo de `roundComplete`). Reemplazar este bloque:

```js
    const current = session.players[session.currentPlayerIndex];
    if (!current || current.id !== playerId) {
      throw new Error(`No es tu turno — le toca a ${current?.name ?? 'otro jugador'}`);
    }

    const alreadyActed = session.storyHistory.some(
      e => e.type === 'player_action' && e.turnNumber === session.turnNumber && e.playerId === playerId
    );
    if (alreadyActed) throw new Error('Ya enviaste tu acción en esta ronda');

    const entry = session.addPlayerAction(playerId, text);
    if (!this.skipDatabase) await this.saveStoryEntryToDatabase(sessionId, entry);

    session.currentPlayerIndex = (session.currentPlayerIndex + 1) % session.players.length;
    const roundComplete = session.currentPlayerIndex === 0;
```

por:

```js
    const simultaneous = session.settings.turnMode === 'simultaneous';

    if (simultaneous) {
      const inSession = session.players.some(p => p.id === playerId);
      if (!inSession) throw new Error('No perteneces a esta sesión');
    } else {
      const current = session.players[session.currentPlayerIndex];
      if (!current || current.id !== playerId) {
        throw new Error(`No es tu turno — le toca a ${current?.name ?? 'otro jugador'}`);
      }
    }

    const alreadyActed = session.storyHistory.some(
      e => e.type === 'player_action' && e.turnNumber === session.turnNumber && e.playerId === playerId
    );
    if (alreadyActed) throw new Error('Ya enviaste tu acción en esta ronda');

    const entry = session.addPlayerAction(playerId, text);
    if (!this.skipDatabase) await this.saveStoryEntryToDatabase(sessionId, entry);

    let roundComplete;
    if (simultaneous) {
      roundComplete = session.allActed();
    } else {
      session.currentPlayerIndex = (session.currentPlayerIndex + 1) % session.players.length;
      roundComplete = session.currentPlayerIndex === 0;
    }
```

(El resto de `submitAction` — el bloque `if (roundComplete) { ... }`, el `return` — queda igual.)

- [ ] **Step 4: Correr y ver pasar (toda la suite, para confirmar que secuencial sigue intacto)**

Run: `cd backend && npx vitest run`
Expected: PASS (incluyendo `milestone2Round.test.js` y los nuevos).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/NarrativeService.js backend/test/simultaneousTurns.test.js
git commit -m "feat(simultaneo): submitAction sin orden y cierre por allActed en modo simultaneo"
```

---

### Task 4: `closeRoundNow` (cierre forzado por host) + ruta

**Files:**
- Modify: `backend/src/services/NarrativeService.js` (método nuevo)
- Modify: `backend/src/routes/narrativeRoutes.js` (ruta nueva)
- Test: `backend/test/simultaneousTurns.test.js` (agregar describe)

**Interfaces:**
- Consumes: `closeRound`, `maybeAutoEpilogue`
- Produces:
  - `NarrativeService.closeRoundNow(sessionId): Promise<{ roundComplete: true, narrative, turnNumber, sessionEnded? }>`
  - `POST /api/narrative/sessions/:sessionId/close-round`

- [ ] **Step 1: Escribir el test que falla**

Agregar a `backend/test/simultaneousTurns.test.js`:

```js
describe('closeRoundNow (cierre forzado)', () => {
  let svc;
  beforeEach(() => { svc = new NarrativeService({ skipDatabase: true }); mockAi(svc); });

  it('con acciones parciales narra con lo que haya', async () => {
    const { session, ana } = await makeSession(svc, { turnMode: 'simultaneous' });
    await svc.submitAction(session.id, ana.id, 'solo ana'); // beto y cris no enviaron
    const r = await svc.closeRoundNow(session.id);
    expect(r.narrative).toBe('narración');
    expect(svc.aiService.generateStoryNarrative).toHaveBeenCalledTimes(1);
    expect(session.turnNumber).toBe(2);
  });

  it('sin acciones solo avanza el turnNumber sin narrar', async () => {
    const { session } = await makeSession(svc, { turnMode: 'simultaneous' });
    const r = await svc.closeRoundNow(session.id);
    expect(r.narrative).toBeNull();
    expect(svc.aiService.generateStoryNarrative).not.toHaveBeenCalled();
    expect(session.turnNumber).toBe(2);
  });

  it('es idempotente: no narra dos veces el mismo turno', async () => {
    const { session, ana, beto, cris } = await makeSession(svc, { turnMode: 'simultaneous' });
    await svc.submitAction(session.id, ana.id, 'a');
    await svc.submitAction(session.id, beto.id, 'b');
    await svc.submitAction(session.id, cris.id, 'c'); // ya cerró → turnNumber 2
    svc.aiService.generateStoryNarrative.mockClear();
    const r = await svc.closeRoundNow(session.id); // turno 2 sin acciones
    expect(r.narrative).toBeNull();
    expect(svc.aiService.generateStoryNarrative).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `cd backend && npx vitest run test/simultaneousTurns.test.js`
Expected: FAIL (`closeRoundNow is not a function`).

- [ ] **Step 3: Implementar el servicio**

En `backend/src/services/NarrativeService.js`, agregar después de `skipTurn` (~línea 615):

```js
  /**
   * Cierre forzado de la ronda (host, modo simultáneo).
   * Con acciones pendientes → narra. Sin acciones → solo avanza el turno.
   * Idempotente: si el turno ya tiene narrativa, no narra de nuevo.
   */
  async closeRoundNow(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session || !session.isActive) throw new Error('Sesión no activa');

    const roundActions = session.storyHistory.filter(
      e => e.type === 'player_action' && e.turnNumber === session.turnNumber
    );
    const alreadyNarrated = session.storyHistory.some(
      e => e.type === 'ai_narrative' && e.turnNumber === session.turnNumber
    );

    let narrative = null;
    let sessionEnded;
    if (roundActions.length > 0 && !alreadyNarrated) {
      narrative = await this.closeRound(session);
      sessionEnded = (await this.maybeAutoEpilogue(session)) || undefined;
    } else if (roundActions.length === 0) {
      session.turnNumber += 1;
      if (!this.skipDatabase) await this.saveSessionToDatabase(session);
      sessionEnded = (await this.maybeAutoEpilogue(session)) || undefined;
    }

    return {
      roundComplete: true,
      narrative,
      turnNumber: session.turnNumber,
      ...(sessionEnded && { sessionEnded }),
    };
  }
```

- [ ] **Step 4: Correr y ver pasar el servicio**

Run: `cd backend && npx vitest run test/simultaneousTurns.test.js`
Expected: PASS.

- [ ] **Step 5: Agregar la ruta**

En `backend/src/routes/narrativeRoutes.js`, después de la ruta `skip-turn` (~línea 432), agregar:

```js
/**
 * POST /api/narrative/sessions/:sessionId/close-round
 * Force-close the current round (host, simultaneous mode)
 */
router.post('/sessions/:sessionId/close-round', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const result = await NarrativeService.closeRoundNow(sessionId);
    res.json({ success: true, data: result, message: 'Ronda cerrada' });
  } catch (error) {
    if (error.code === 'AI_NARRATION_FAILED') {
      return res.status(500).json({
        success: false,
        error: 'ai_narration_failed',
        message: 'La IA no pudo narrar la ronda. Las acciones quedaron guardadas — reintenta la narración.',
      });
    }
    console.error('Error closing round:', error);
    const status = error.message === 'Sesión no activa' ? 400 : 500;
    res.status(status).json({ success: false, error: 'Failed to close round', message: error.message });
  }
});
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/NarrativeService.js backend/src/routes/narrativeRoutes.js backend/test/simultaneousTurns.test.js
git commit -m "feat(simultaneo): closeRoundNow + ruta POST /close-round para cierre forzado"
```

---

### Task 5: Auto-cierre al salir un jugador (simultáneo)

**Files:**
- Modify: `backend/src/services/NarrativeService.js` (`leaveSession`, ~líneas 390-414)
- Test: `backend/test/simultaneousTurns.test.js` (agregar describe)

**Interfaces:**
- Consumes: `session.allActed()`, `closeRound`, `maybeAutoEpilogue`
- Produces: `leaveSession` cierra la ronda (best-effort) si una salida la completa en simultáneo

- [ ] **Step 1: Escribir el test que falla**

Agregar a `backend/test/simultaneousTurns.test.js`:

```js
describe('salida de jugador en simultáneo', () => {
  let svc;
  beforeEach(() => { svc = new NarrativeService({ skipDatabase: true }); mockAi(svc); });

  it('si los que quedan ya enviaron, la salida cierra la ronda', async () => {
    const { session, ana, beto, cris } = await makeSession(svc, { turnMode: 'simultaneous' });
    await svc.submitAction(session.id, ana.id, 'a');
    await svc.submitAction(session.id, beto.id, 'b'); // falta cris
    expect(svc.aiService.generateStoryNarrative).not.toHaveBeenCalled();
    await svc.leaveSession(session.id, cris.id); // cris se va → ana y beto ya enviaron
    expect(svc.aiService.generateStoryNarrative).toHaveBeenCalledTimes(1);
    expect(session.turnNumber).toBe(2);
  });

  it('si aún faltan envíos, la salida NO cierra la ronda', async () => {
    const { session, ana, cris } = await makeSession(svc, { turnMode: 'simultaneous' });
    await svc.submitAction(session.id, ana.id, 'a'); // beto y cris no enviaron
    await svc.leaveSession(session.id, cris.id); // queda beto sin enviar
    expect(svc.aiService.generateStoryNarrative).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Correr y ver fallar**

Run: `cd backend && npx vitest run test/simultaneousTurns.test.js`
Expected: FAIL (la salida no dispara la narración).

- [ ] **Step 3: Implementar**

En `backend/src/services/NarrativeService.js`, en `leaveSession`, justo antes del `return {`  (después del bloque `if (session.players.length === 0) { ... }`), agregar:

```js
    // Simultáneo: una salida puede completar la ronda con los que quedan
    if (session.isActive && session.settings.turnMode === 'simultaneous' && session.players.length > 0) {
      const roundActions = session.storyHistory.filter(
        e => e.type === 'player_action' && e.turnNumber === session.turnNumber
      );
      const alreadyNarrated = session.storyHistory.some(
        e => e.type === 'ai_narrative' && e.turnNumber === session.turnNumber
      );
      if (roundActions.length > 0 && !alreadyNarrated && session.allActed()) {
        try {
          await this.closeRound(session);
          await this.maybeAutoEpilogue(session);
        } catch (err) {
          logger.warn('No se pudo cerrar la ronda tras una salida; se podrá reintentar:', err.message);
        }
      }
    }
```

- [ ] **Step 4: Correr y ver pasar (suite completa)**

Run: `cd backend && npx vitest run`
Expected: PASS (todo verde).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/NarrativeService.js backend/test/simultaneousTurns.test.js
git commit -m "feat(simultaneo): leaveSession cierra la ronda si una salida la completa"
```

---

### Task 6: Selector de modo de escritura (creación)

**Files:**
- Modify: `frontend/src/components/StoryLobby.vue` (template ~líneas 197-204, `newSession` ~líneas 330-335, payload ~líneas 434-439)

**Interfaces:**
- Consumes: el backend ya valida `settings.turnMode` (Task 1)

- [ ] **Step 1: Agregar el selector al template**

En `frontend/src/components/StoryLobby.vue`, después del `div.form-group` de "Duración" (después de la línea ~204, el `</div>` que cierra el bloque de duration), agregar:

```html
            <div class="form-group">
              <label for="turnMode">Modo de escritura</label>
              <select id="turnMode" v-model="newSession.settings.turnMode">
                <option value="sequential">🔁 Por turnos — uno escribe a la vez</option>
                <option value="simultaneous">⚡ Simultáneo — todos escriben a la vez</option>
              </select>
            </div>
```

- [ ] **Step 2: Agregar el default al estado**

En el objeto `newSession` (~líneas 330-335), agregar `turnMode`:

```js
  settings: {
    genre: 'fantasy',
    language: 'es',
    mode: 'narrador-activo',
    maxRounds: null,
    turnMode: 'sequential'
  }
```

- [ ] **Step 3: Enviar turnMode en el payload de creación**

En `createSession`, dentro de `body: JSON.stringify({ ... settings: { ... } })` (~líneas 434-439), agregar la línea `turnMode`:

```js
        settings: {
          genre: newSession.value.settings.genre,
          language: newSession.value.settings.language,
          mode: newSession.value.settings.mode,
          maxRounds: newSession.value.settings.maxRounds,
          turnMode: newSession.value.settings.turnMode
        }
```

- [ ] **Step 4: Verificar build**

Run: `cd frontend && npx vite build`
Expected: build sin errores.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/StoryLobby.vue
git commit -m "feat(simultaneo): selector de modo de escritura al crear la sesion"
```

---

### Task 7: UX de la sesión (StorySession.vue + StoryInput.vue)

**Files:**
- Modify: `frontend/src/components/StorySession.vue` (computeds ~líneas 318-348, template player-list ~líneas 123-137 y host-actions ~líneas 142-147 y binding StoryInput ~líneas 162-172, método nuevo)
- Modify: `frontend/src/components/StoryInput.vue` (prop nueva + banner)

**Interfaces:**
- Consumes: `session.settings.turnMode`, `session.actedPlayerIds` (backend), `POST /close-round` (Task 4)

- [ ] **Step 1: Computeds y helpers de turno en StorySession.vue**

En `frontend/src/components/StorySession.vue`, reemplazar el computed `isMyTurn` (líneas ~318-323) por:

```js
const turnMode = computed(() => session.value?.settings?.turnMode || 'sequential')
const actedIds = computed(() => session.value?.actedPlayerIds || [])

const isMyTurn = computed(() => {
  if (!session.value || !currentPlayer.value || !Array.isArray(session.value.players)) return false
  if (turnMode.value === 'simultaneous') {
    // En simultáneo "mi turno" = aún no envié esta ronda
    return !actedIds.value.includes(props.currentPlayerId)
  }
  const currentPlayerIndex = session.value.currentPlayerIndex
  const playerIndex = session.value.players.findIndex(p => p.id === props.currentPlayerId)
  return currentPlayerIndex === playerIndex
})

const hasSubmitted = (playerId) => actedIds.value.includes(playerId)

const pendingCount = computed(() => {
  const total = session.value?.players?.length || 0
  return Math.max(0, total - actedIds.value.length)
})
```

- [ ] **Step 2: Estado por jugador en la lista (template)**

En el `div.player-item` (líneas ~123-137), reemplazar el indicador final. Cambiar:

```html
              <div v-if="isCurrentPlayer(player.id)" class="current-indicator">
                🎯
              </div>
```

por:

```html
              <div v-if="turnMode === 'simultaneous'" class="current-indicator" :title="hasSubmitted(player.id) ? 'Ya envió' : 'Pendiente'">
                {{ hasSubmitted(player.id) ? '✅' : '✍️' }}
              </div>
              <div v-else-if="isCurrentPlayer(player.id)" class="current-indicator">
                🎯
              </div>
```

- [ ] **Step 3: Botón del host (template)**

Reemplazar el bloque `div.host-actions` (líneas ~142-147) por:

```html
        <div v-if="isHost && session?.isActive" class="host-actions">
          <button v-if="turnMode === 'simultaneous'" @click="closeRoundNow" class="skip-btn" :disabled="isSkipping" title="Cerrar la ronda con lo que haya">
            <span v-if="!isSkipping">🔚 Cerrar ronda ahora</span>
            <span v-else>Cerrando...</span>
          </button>
          <button v-else @click="skipTurn" class="skip-btn" :disabled="isSkipping" title="Saltar turno actual">
            <span v-if="!isSkipping">⏭️ Saltar turno</span>
            <span v-else>Saltando...</span>
          </button>
        </div>
```

- [ ] **Step 4: Método closeRoundNow (script)**

En `frontend/src/components/StorySession.vue`, agregar después del método `skipTurn` (~línea 573):

```js
const closeRoundNow = async () => {
  try {
    isSkipping.value = true
    errorMessage.value = ''

    const response = await fetch(`/api/narrative/sessions/${props.sessionId}/close-round`, {
      method: 'POST'
    })
    const result = await response.json()

    if (!result.success) {
      throw new Error(result.message || 'Error al cerrar la ronda')
    }

    await loadSession()
    await loadHistory()
  } catch (error) {
    console.error('Error closing round:', error)
    errorMessage.value = error.message || 'Error al cerrar la ronda'
  } finally {
    isSkipping.value = false
  }
}
```

- [ ] **Step 5: Pasar turnMode al input (template)**

En el componente `<StoryInput ... />` (líneas ~162-172), agregar la prop `:turn-mode`:

```html
          <StoryInput
            :current-player="currentPlayer"
            :is-my-turn="isMyTurn"
            :is-submitting="isGenerating"
            :next-player-name="currentActorName"
            :session-id="sessionId"
            :game-type="session?.settings?.gameType || 'character'"
            :mode="session?.settings?.mode || 'colaborativo'"
            :turn-mode="turnMode"
            @submit-action="handleSubmitAction"
            @clear-error="clearError"
          />
```

- [ ] **Step 6: Banner del input según turnMode (StoryInput.vue)**

En `frontend/src/components/StoryInput.vue`, agregar la prop `turnMode` en `defineProps` (después de `mode`, ~línea 121):

```js
  mode: {
    type: String,
    default: 'colaborativo'
  },
  turnMode: {
    type: String,
    default: 'sequential'
  }
```

Y reemplazar el banner de espera (líneas ~18-24) por una versión que distingue simultáneo:

```html
      <!-- Turn banner: waiting -->
      <div class="turn-banner waiting-turn" v-else-if="props.currentPlayer">
        <div class="waiting-message">
          <div class="waiting-icon">⏳</div>
          <span v-if="props.turnMode === 'simultaneous'">✅ Enviado — esperando a los demás…</span>
          <span v-else>Le toca a <strong>{{ props.nextPlayerName }}</strong></span>
        </div>
      </div>
```

- [ ] **Step 7: Verificar build**

Run: `cd frontend && npx vite build`
Expected: build sin errores.

- [ ] **Step 8: QA manual**

Con backend + `yarn dev` corriendo, crear una sesión "Simultáneo" con 2-3 jugadores (varios navegadores/pestañas):
- [ ] Todos pueden escribir sin esperar turno; el orden no importa.
- [ ] La lista muestra ✅/✍️ por jugador; el banner del que ya envió dice "esperando a los demás".
- [ ] Al enviar el último, aparece la narración para todos (tras el polling).
- [ ] El host ve "Cerrar ronda ahora" y narra con lo que haya.
- [ ] El botón 🎤 de voz funciona en simultáneo.
- [ ] Crear una sesión "Por turnos" → se comporta exactamente como antes (🎯, "Le toca a X", "Saltar turno").

- [ ] **Step 9: Commit**

```bash
git add frontend/src/components/StorySession.vue frontend/src/components/StoryInput.vue
git commit -m "feat(simultaneo): UX de sesion simultanea (estado por jugador, cerrar ronda, banner)"
```

---

## Self-Review

**1. Spec coverage:**
- `turnMode` opt-in (default sequential) → Task 1. ✅
- Submissions derivadas + helpers + toJSON → Task 2. ✅
- submitAction simultáneo (sin orden, cierra por allActed) → Task 3. ✅
- Cierre forzado del host + ruta → Task 4. ✅
- Salida de jugador completa la ronda → Task 5. ✅
- Selector en creación → Task 6. ✅
- UX (isMyTurn=¿no envié?, ✅/✍️, banner N de M / "esperando", host close, voz) → Task 7. ✅
- Secuencial intacto → Tasks 3/4 corren la suite completa (`npx vitest run`). ✅
- Idempotencia → Task 4 test "no narra dos veces". ✅

Nota de cobertura: el banner "Esperando a N de M" del spec se implementa como "✅ Enviado — esperando a los demás…" en el input + ✅/✍️ por jugador en la lista; `pendingCount` queda disponible por si se quiere el conteo literal. Cubre la intención (saber a quién se espera) sin texto redundante.

**2. Placeholder scan:** sin TBD/TODO; todo el código está completo.

**3. Type consistency:** `actedPlayerIds()` (método del modelo) ↔ `toJSON().actedPlayerIds` (array) ↔ `actedIds` (computed frontend) ↔ `hasSubmitted`/`hasActed`. `turnMode` consistente en backend (`settings.turnMode`), creación (`newSession.settings.turnMode`), y frontend (`turnMode` computed + prop). `closeRoundNow` (servicio) ↔ `/close-round` (ruta) ↔ `closeRoundNow` (método frontend). ✅
