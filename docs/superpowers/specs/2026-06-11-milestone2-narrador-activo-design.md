# Milestone 2 — Narrador Activo, Resumen Acumulativo y Duración Configurable

**Fecha:** 2026-06-11
**Estado:** Aprobado por Nick
**Rama:** `milestone-2` (desde master = M1 mergeado tras playtest real)
**Origen:** las 3 mejoras nacieron del playtest en vivo del M1 (docs/IDEAS-MILESTONE-2.md).

## Objetivo

Tres mejoras que cambian la experiencia de juego sin tocar la base probada del M1
(salas, turnos, reconexión, persistencia SQLite, LAN):

1. **Modo Narrador Activo**: la IA lleva la iniciativa (eventos) y los jugadores reaccionan.
2. **Resumen acumulativo**: sinopsis viva con doble uso — botón 📖 para ponerse al día +
   memoria del narrador en historias largas.
3. **Duración configurable**: historias Corta/Media/Libre con cierre automático.

**Criterio de éxito:** una partida Narrador Activo "Corta" (8 rondas) de punta a punta con
la familia: eventos variados (globales y dirigidos), resumen consultable, cierre de arcos en
las últimas rondas y epílogo automático al llegar al límite.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Alcance M2 | Las 3 mejoras juntas |
| Loop Narrador Activo | UN solo texto por ronda: resolución de reacciones + siguiente evento encadenado (1 llamada) |
| Eventos dirigidos | La IA decide libremente (global vs dirigido a un personaje), el prompt le pide rotar protagonismo |
| Modo default al crear | 🎭 Narrador Activo (lo nuevo); ✍️ Colaborativo disponible en el selector |
| Resumen — UI | Botón 📖 en la cabecera → panel/modal; NO panel fijo (espacio en móvil) |
| Resumen — cadencia | Se actualiza tras CADA cierre de ronda (1 llamada corta extra; si falla, se conserva el anterior) |
| Resumen — narrador | Reemplaza el contexto actual "inicio + últimas 4 narraciones" por "resumen + últimas 3" en ambos modos |
| Duración | Presets al crear: Corta (8 rondas) / Media (15) / Libre (default, sin límite) |
| Cierre automático | Con límite: últimas 2 rondas la IA cierra arcos (prompt), al completar la última ronda genera epílogo automático y la sesión pasa a modo lectura |
| Terminar antes | El botón 🏁 del anfitrión sigue disponible siempre |
| Arquitectura | UN solo flujo (closeRound actual) con prompts por modo — NO motores separados por modo (YAGNI) |

## Diseño

### 1. Modelo de sesión (StorySession + SQLite)

Campos nuevos en `settings`: `mode` ('narrador-activo' | 'colaborativo', default 'narrador-activo'),
`maxRounds` (number | null, null = Libre). Campo nuevo de sesión: `summary` (string,
persistido en story_sessions — columna nueva con migración idempotente como se hizo con `code`).
`toJSON()` expone `summary`, `mode` y `maxRounds` (vía settings) y un derivado
`roundsRemaining` (null si Libre).

### 2. Prompts por modo (narrativePrompts.js)

- `getNarratorSystemPrompt(language, genre, mode)`: el modo 'narrador-activo' agrega al
  prompt del narrador: terminar SIEMPRE la narración planteando el siguiente evento o
  situación (pregunta abierta o peligro inminente), variando entre eventos globales y
  dirigidos a un personaje específico por nombre, rotando el protagonismo entre los
  jugadores a lo largo de las rondas. Mantiene las reglas existentes (coherencia, no
  repetir, 100-180 palabras, es/pt).
- `getOpeningPrompt(language, genre, mode)`: en narrador-activo la introducción termina con
  el primer evento y una invitación a reaccionar.
- Nuevo `getClosingArcsInstruction(language, roundsRemaining)`: cuando `roundsRemaining <= 2`,
  se añade al prompt de ronda: "quedan N rondas: empieza a cerrar los arcos de los personajes
  y encamina el final" (es/pt).
- Nuevo `getSummaryPrompt(language)`: "actualiza esta sinopsis con los hechos nuevos;
  máx. 150 palabras; conserva nombres, lugares y hechos clave" (es/pt).

### 3. Flujo de ronda (NarrativeService.closeRound — sin bifurcar el loop)

1. Construye el prompt de ronda con contexto = `summary` (si existe) + últimas 3 narraciones
   + acciones de la ronda (las etiquetas "YA NARRADO, NO repetir" se mantienen).
2. Si la sesión tiene `maxRounds` y `roundsRemaining <= 2`, añade la instrucción de cierre de arcos.
3. Genera la narración (1 llamada — en narrador-activo el texto ya trae el siguiente evento).
4. **Actualiza el resumen** (segunda llamada, corta): `summary = gemini(getSummaryPrompt, resumen anterior + narración nueva)`.
   Si falla → conserva el resumen anterior, loguea, NO bloquea la ronda.
5. Si con esta ronda se alcanzó `maxRounds` → genera el **epílogo automáticamente**
   (reutiliza `endSession`) y la sesión queda inactiva (modo lectura). El frontend ya sabe
   renderizar `ai_epilogue` y ocultar el input.

### 4. Frontend

- **StoryLobby (crear)**: selector "Estilo de narración" (🎭 Narrador Activo default /
  ✍️ Colaborativo) + selector "Duración" (Corta 8 / Media 15 / Libre default). Dos campos
  más en el form existente.
- **StorySession**: botón 📖 en la cabecera → panel/modal con `session.summary`
  ("Aún no hay resumen" si vacío). Contador "Ronda X de Y" junto al turno cuando hay límite.
  Placeholder del input según modo: narrador-activo → "¿Cómo reacciona tu personaje?";
  colaborativo → el actual.
- Móvil: el panel del resumen ocupa pantalla completa en ≤768px con botón cerrar.

### 5. Manejo de errores

Los mecanismos del M1 cubren todo sin cambios: retry de narración, detección roundPending,
fallbacks locales si la IA no está configurada, reconexión. Única regla nueva: el fallo del
resumen NUNCA afecta la ronda (catch + conservar anterior).

### 6. Testing

- Unitarios: prompts por modo (es/pt, narrador-activo contiene instrucción de evento;
  colaborativo no), getSummaryPrompt, cierre de arcos cuando roundsRemaining<=2,
  actualización del summary tras closeRound (mockeando IA), summary se conserva si la llamada
  falla, epílogo automático exactamente al llegar a maxRounds (y NO antes), persistencia del
  summary (columna nueva + hydrate), roundsRemaining en toJSON.
- E2E manual (criterio de éxito): partida Narrador Activo Corta completa con la familia.

## Fuera de alcance (M3+)

Export PDF de la historia, deploy a internet, modo híbrido con sistemas de civilización,
edición manual del resumen, imágenes generadas por IA.
