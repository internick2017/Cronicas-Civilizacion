# Diseño — Escritura simultánea (turnos simultáneos)

- **Fecha:** 2026-06-23
- **Estado:** Aprobado (brainstorming)
- **Feature:** #2 del backlog de mejoras ([memory/mejoras-backlog.md])
- **Alcance:** una sola feature. Los modos de mapa (#3, #4) se diseñan por separado.

## Contexto y motivación

Hoy el juego es estrictamente por turnos: `submitAction` rechaza con "No es tu turno"
si no eres el jugador en `currentPlayerIndex`, y la ronda se cierra cuando el índice
vuelve a 0. Eso obliga a esperar. Queremos una **opción** donde todos escriban su acción
a la vez dentro de una ronda, para agilizar el juego multijugador.

**Hallazgo clave:** el backend **ya narra por ronda en lote** — `closeRound()` junta
TODAS las acciones del `turnNumber` actual y llama a la IA **una sola vez**. Lo único que
hace el juego "secuencial" es la traba de orden. Por eso esta feature no es una reescritura:
cambia *cuándo* y *quién* dispara el cierre, no *cómo* se narra.

## Decisiones tomadas (brainstorming)

| Decisión | Elección | Razón |
|----------|----------|-------|
| ¿Opción o reemplazo? | **Opción opt-in** (`settings.turnMode`) | Conserva el modo por turnos, menos riesgo, comparable. |
| Cierre de ronda | **Todos enviaron + host puede forzar** | Maneja el caso del jugador AFK. |
| Visibilidad | **Solo quién ya envió** (✅/✍️), no el texto | Evita que se copien/influyan; mantiene la sorpresa. |
| Editar tras enviar | **No** (se mantiene el guard `alreadyActed`) | Consistente con el modelo actual. |
| Estado de envíos | **Derivado** de `storyHistory` | Cero columnas nuevas, cero migración. |

## Arquitectura y modelo de datos

No se agrega estado nuevo a la base de datos. "Quién envió esta ronda" se deriva de las
`player_action` con el `turnNumber` actual (igual que `closeRound` ya filtra `roundActions`).

**Único campo de configuración nuevo:** `settings.turnMode`:
- `'sequential'` (default — comportamiento actual intacto)
- `'simultaneous'`

Vive en el objeto `settings` (JSON serializado), **no toca el esquema de tablas**. Se valida
en `createSession` igual que `mode`/`maxRounds`.

### Helpers nuevos en el modelo `StorySession` (backend/src/models/StorySession.js)

- `actedPlayerIds()` → array de `playerId` con `player_action` en el `turnNumber` actual.
- `hasActed(playerId)` → boolean.
- `allActed()` → ¿todos los jugadores activos ya enviaron? (`actedPlayerIds().length >= players activos`).

### `toJSON()` expone

- `settings.turnMode` (ya viaja dentro de `settings`).
- `actedPlayerIds: [...]` — para que el frontend pinte ✅/✍️ sin revelar el texto.

### Concurrencia

En simultáneo varios envían "a la vez". Node es single-thread; el `push` de la acción y el
chequeo `allActed()` son **síncronos** (sin `await` en medio), así que exactamente UN request
lleva el conteo al total y dispara el cierre. Además `closeRound` se protege con idempotencia:
si ese `turnNumber` ya tiene un `ai_narrative`, no narra de nuevo (la verificación ya existe en
`retryNarration` y se reutiliza).

## Comportamiento del backend (backend/src/services/NarrativeService.js)

`submitAction(sessionId, playerId, actionText)` se ramifica por `turnMode`:

- **Secuencial:** sin cambios. Valida turno, avanza `currentPlayerIndex`, cierra al volver a 0.
- **Simultáneo:**
  - Quita la validación "No es tu turno".
  - Mantiene el guard `alreadyActed` → "Ya enviaste tu acción en esta ronda".
  - No avanza `currentPlayerIndex`.
  - Tras guardar la acción: si `allActed()` → `closeRound()` + `maybeAutoEpilogue`. Si no,
    responde con `roundComplete: false` (esperando a los demás).

**Cierre forzado por el host** — método nuevo `closeRoundNow(sessionId)`:
- Si hay acciones esta ronda → `closeRound()` + `maybeAutoEpilogue`.
- Si nadie escribió → solo `turnNumber += 1` (como `skipTurn` sin acciones).
- Reutiliza la lógica del bloque `roundComplete` de `skipTurn`.

**Ruta nueva:** `POST /api/narrative/sessions/:id/close-round` — reusa el manejo de error
`AI_NARRATION_FAILED` de `/action`.

**No cambia:** `closeRound`, el prompt por ronda, el resumen acumulativo, el epílogo automático,
`retryNarration`. Si la IA falla al cerrar, el mismo botón de reintento sirve.

## Frontend (UX)

Todo condicionado por `session.settings.turnMode`.

### Creación (frontend/src/components/StoryLobby.vue)
Selector nuevo "Modo de escritura": **Por turnos** (default) / **Simultáneo**, junto a los
selectores de estilo/duración del M2. Se envía en `settings.turnMode` al crear.

### Sesión (frontend/src/components/StorySession.vue)
- **¿Puedo escribir?** En simultáneo, `isMyTurn` pasa a ser **"aún no envié esta ronda"**
  (`!actedPlayerIds.includes(miId)`). Si ya envié → input bloqueado.
- **Lista de jugadores:** ✅ (envió) / ✍️ (pendiente) esta ronda, en vez del 🎯 actual.
- **Banner de espera:** "Esperando a N de M jugadores" en vez de "Le toca a X".
- **Botón del host:** en simultáneo, "Cerrar ronda ahora" (→ `/close-round`) en vez de "Saltar turno".
- Al cerrar la ronda, el polling trae la narración nueva y limpia el estado de envíos (igual que hoy).

### Input (frontend/src/components/StoryInput.vue)
Recibe `turnMode` además de `mode` para ajustar los textos del banner
("✅ Enviado, esperando a los demás…" vs "Le toca a X"). El botón 🎤 de voz funciona igual en ambos modos.

## Casos de borde

| Caso | Manejo |
|------|--------|
| Jugador AFK | Host usa "Cerrar ronda ahora". |
| Falla la IA al cerrar | Acciones guardadas + botón "Reintentar narración" (`retryNarration`); el estado de envíos no se pierde. |
| Dos envíos a la vez | `push` + `allActed()` síncronos → un solo cierre; guard de idempotencia evita doble narración. |
| Jugador se une a mitad de ronda | `allActed()` cuenta sobre jugadores activos al momento; se espera también su envío (o el host cierra). |
| Jugador se va a mitad de ronda | Tras `leaveSession`, recomputar `allActed()`: si los que quedan ya enviaron, cerrar. |
| Reconexión | Sin cambios; el estado vive en el backend y el polling lo reconstruye. |
| Sesión secuencial existente | `turnMode` ausente → default `'sequential'`; sesiones viejas intactas. |
| Simultáneo con 1 jugador | `allActed()` se cumple con ese envío → cierra de inmediato. Aceptable. |

## Pruebas

### Backend (Vitest, TDD real — estilo backend/test/milestone2Round.test.js)
- `turnMode` se valida y persiste (`'simultaneous'`; default `'sequential'`).
- Helpers: `actedPlayerIds()`, `hasActed()`, `allActed()` con 0 / algunos / todos.
- `submitAction` simultáneo: cualquier jugador puede enviar (sin orden).
- `submitAction` simultáneo: `alreadyActed` bloquea reenvío.
- La ronda no cierra hasta `allActed()`; cierra (IA una vez) cuando el último envía.
- `closeRoundNow`: con acciones → narra; sin acciones → solo avanza `turnNumber`.
- Idempotencia: no doble narración si el turno ya tiene `ai_narrative`.
- Secuencial intacto (los tests del M2 siguen verdes — red de seguridad).
- Jugador se va y completa la ronda → cierra.

### Frontend (checklist manual)
- [ ] Crear sesión "Simultáneo" → todos escriben sin esperar → al enviar el último aparece la narración.
- [ ] Lista muestra ✅/✍️; banner "Esperando a N de M".
- [ ] Input se bloquea tras enviar.
- [ ] Host: "Cerrar ronda ahora" narra con lo que haya.
- [ ] Voz 🎤 funciona en simultáneo.
- [ ] Sesión "Por turnos" se comporta como hoy.

**Comando:** `cd backend && yarn test` verde (incluyendo los tests previos).

## Fuera de alcance

- Temporizador de ronda (descartado en brainstorming).
- Ver el texto de los demás en vivo (descartado: solo estado ✅/✍️).
- Editar la acción tras enviarla.
- Vitest en el frontend (la verificación de UI sigue siendo checklist manual).
- Modos de mapa (#3, #4 del backlog) — specs aparte.
