# Ideas para Milestone 2 — capturadas durante el playtest del M1 (2026-06-11)

## 1. Modo "Narrador Activo" (la IA como Dungeon Master) ⭐ pedido de Nick

Hoy la IA solo interviene en 3 momentos: apertura, cierre de cada ronda y epílogo — siempre
*reaccionando* a lo que escriben los jugadores. La idea: un modo donde **la IA lleva la
iniciativa de la historia** según el prompt/género inicial:

- **La IA abre cada ronda con un evento**: una situación, un giro, un peligro o un encuentro
  ("Un dragón bloquea el paso del puente...", "Una carta misteriosa llega a manos de Ana...").
- **Cada jugador reacciona con su personaje** a lo que la IA planteó (en vez de inventar
  acciones desde cero). El turno se vuelve: evento de la IA → reacción de cada uno → la IA
  resuelve la ronda integrando las reacciones → nuevo evento.
- **Eventos dirigidos**: la IA puede dirigir eventos a personajes específicos por turno
  ("A Josias se le aparece...") para que cada quien tenga su momento protagónico.
- **Frecuencia configurable** al crear la sesión: ¿la IA interviene cada ronda? ¿cada 2?
  ¿solo cuando la historia se estanca?

Implementación estimada: nuevo campo `settings.mode` ('colaborativo' actual | 'narrador-activo'),
un prompt de "generar evento de ronda" en narrativePrompts.js, y que closeRound encadene
resolución + evento siguiente. El frontend casi no cambia (el evento es una entrada ai_narrative
al inicio de cada ronda).

## 2. Resumen acumulativo de la historia ⭐ confirmado por Nick (doble uso)

La IA mantiene una sinopsis comprimida que se actualiza cada N rondas. Sirve para DOS cosas:

- **Para los jugadores** (el uso que pidió Nick): botón "📖 ¿Qué ha pasado hasta ahora?" en la
  sesión — muestra el resumen para ponerse al día sin releer todos los mensajes. Ideal para
  quien se reconecta, llega tarde a la partida o se distrajo.
- **Para la IA** (coherencia): la sinopsis se inyecta siempre en el contexto del narrador, así
  no pierde el hilo en historias de 20+ rondas (hoy solo ve inicio + últimas 4 narraciones).

Implementación: tras cada cierre de ronda (o cada 3), una llamada extra a Gemini "actualiza
esta sinopsis con lo nuevo" → se guarda en la sesión (campo summary, persistido) → UI la
muestra bajo demanda y buildRoundPrompt la incluye. Costo: +1 llamada corta por ronda (free tier ok).

## 3. Otras ideas en el radar

- Fase 2 híbrida: usar los sistemas de civilización (recursos/ciudades/militar, ya en master)
  como mecánica opcional dentro de las historias.
- Export de la historia terminada a PDF bonito para guardar/imprimir (make-pdf).
- Deploy a internet para jugar con familia remota (Railway/Render + Neon).
