# Crónicas de Civilización — Modo Narrativo Familiar (Milestone 1)

**Fecha:** 2026-06-11
**Estado:** Aprobado por Nick
**Decisión de rumbo:** terminar el modo narrativo (WIP existente) antes que el juego de
civilización. Los sistemas de civilización (recursos/ciudades/militar, ya commiteados y
documentados en docs/) quedan como activos dormidos para una posible fase 2 híbrida.

## Objetivo

Una partida narrativa completa, jugable en la red WiFi local: el anfitrión crea la sesión
desde su PC, los jugadores entran desde sus celulares con un código de sala, escriben
acciones por turnos en orden fijo, y la IA narra la historia en el idioma elegido al crear
la sesión (español o portugués). La historia persiste y se puede retomar.

**Criterio de éxito:** una partida real de punta a punta con 3+ jugadores en dispositivos
distintos en la misma WiFi, sin intervención técnica durante el juego.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Rumbo | Modo narrativo familiar primero; civilización = fase futura |
| Acceso | Red local (LAN/WiFi de casa); sin deploy a internet |
| Idioma de narración | Seleccionable por sesión: español o portugués |
| Idioma de UI | Español (un solo idioma en este milestone) |
| Entrada de jugadores | Código de sala (5 letras) + nombre; sin cuentas ni login |
| Proveedor de IA | Gemini API free tier (modelo flash); reemplaza a OpenAI |
| Persistencia | SQLite local (config existente database-sqlite.js); sin Docker/Neon/Redis |
| Turnos | Orden fijo de jugadores; la IA narra al cierre de cada ronda |

## Arquitectura

**Se mantiene:** Vue 3 + Express + Socket.io. El WIP narrativo existente es la base y se
termina, no se reescribe: componentes StoryLobby, StorySession, StoryInput, NarrativePanel,
WaitingRoom, ChatPanel (frontend) y NarrativeService + narrativeRoutes (backend).

**Cambios:**

1. **AIService → adapter de Gemini.** Misma interfaz que hoy consume NarrativeService
   (generar narración a partir de contexto + acciones de la ronda), implementación contra la
   API de Gemini (generateContent, modelo flash). La API key va en `.env`
   (`GEMINI_API_KEY`). El cambio queda contenido en AIService.
2. **Persistencia SQLite.** El servidor usa el config SQLite existente; el archivo de base
   vive en `backend/data/`. Sin servicios externos.
3. **Entrada sin login.** Crear sesión genera un código de 5 letras único. Entrar requiere
   código + nombre (único dentro de la sala). El AuthService queda en el código pero fuera
   del flujo del juego.
4. **Arranque LAN.** Vite (frontend) y Express (backend) escuchan en `0.0.0.0`; al arrancar
   se imprime/muestra la IP local para que los celulares se conecten. Un solo comando
   levanta todo (script raíz `npm run dev` o equivalente).

## Flujo de juego

1. **Crear sesión** (anfitrión): nombre de la historia, género (fantasía / histórico /
   sci-fi / misterio), idioma de narración (es/pt) → recibe código de sala.
2. **Sala de espera:** jugadores entran con código + nombre; el anfitrión ve la lista en
   vivo y pulsa "Comenzar" (mínimo 2 jugadores).
3. **Apertura:** la IA genera la introducción de la historia según género e idioma.
4. **Ronda:** en orden fijo, cada jugador escribe su acción (máx. 280 caracteres); los demás
   ven "le toca a X" en tiempo real (Socket.io). Al completarse la ronda, la IA narra el
   resultado integrando todas las acciones y abre la siguiente ronda.
5. **Cierre:** el anfitrión puede "Finalizar historia" → la IA escribe un epílogo y la
   historia completa queda legible.
6. **Retomar:** la sesión se recupera con el mismo código tras reinicio del servidor o en
   otro día (estado en SQLite: jugadores, rondas, narrativa acumulada).

## Manejo de errores

- **Gemini falla / rate limit:** 2 reintentos con espera exponencial; si persiste, mensaje
  claro al anfitrión con botón "Reintentar narración". Las acciones de la ronda no se
  pierden (ya están persistidas).
- **Jugador desconectado:** el anfitrión puede saltar su turno; el jugador puede reentrar
  con el mismo código + nombre y recupera su lugar en el orden.
- **Validación de acciones:** no vacías, máx. 280 caracteres, validado en backend además
  del frontend.

## Testing

- **Unitarios (backend):** flujo de turnos (orden, salteo, cierre de ronda, reentrada),
  generación/unicidad de códigos de sala, adapter de Gemini con API mockeada.
- **E2E manual:** partida completa con 3 pestañas/dispositivos en LAN antes de declarar el
  milestone cumplido (criterio de éxito).

## Fuera de alcance (explícito)

Deploy a internet, cuentas de usuario/login, sistemas de civilización en el flujo de juego,
export a PDF, UI multiidioma, imágenes generadas por IA, moderación de contenido avanzada.

## Primer paso de implementación

Commitear el WIP narrativo actual (51 archivos modificados/nuevos sin commit) en una rama
de trabajo (`modo-narrativo`) antes de tocar nada, para tener historial y poder volver
atrás.
