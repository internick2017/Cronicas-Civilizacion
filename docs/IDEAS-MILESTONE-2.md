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

## 2. Resumen acumulativo de la historia (coherencia en partidas largas)

El narrador hoy ve el inicio + las últimas 4 narraciones. En historias de 20+ rondas pierde
el medio. Mejora: la IA mantiene una sinopsis comprimida que se actualiza cada N rondas y se
inyecta siempre en el contexto.

## 3. Otras ideas en el radar

- Fase 2 híbrida: usar los sistemas de civilización (recursos/ciudades/militar, ya en master)
  como mecánica opcional dentro de las historias.
- Export de la historia terminada a PDF bonito para guardar/imprimir (make-pdf).
- Deploy a internet para jugar con familia remota (Railway/Render + Neon).
