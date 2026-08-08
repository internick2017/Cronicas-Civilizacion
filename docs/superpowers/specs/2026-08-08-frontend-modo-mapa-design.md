# Frontend del modo mapa — Diseño

Fecha: 2026-08-08. Rama base: `master` (con el backend del modo mapa completo, incluida
autorización por token).

Contexto previo: `docs/auditoria-sistema-legacy.md`, `docs/reglas-modo-mapa.md`,
`docs/modo-mapa-deuda-conocida.md` (ítem "Frontend del modo mapa").

## Objetivo

Construir la interfaz Vue para jugar el modo mapa: crear/unirse/iniciar una partida, ver el
mapa con niebla de guerra, y ejecutar el subconjunto económico de acciones (fundar ciudad,
construir, terminar turno), en vivo vía socket.

## Por qué no se reusa `GameMap.vue`

El componente legacy asume una forma de tile completamente distinta a la que produce
`vistaJugador` del backend nuevo: `tile.owner.name`, `tile.city.name`, `tile.army.strength`
(objetos anidados) contra `dueno` (string id), `ciudad`/`ejercito` planos, `descubierto`
booleano. `useGameApi.js` apunta a las rutas legacy (`/api/games`, `/api/players`), no a
`/api/map`; `useGameSocket.js` es un socket singleton sin `map:join` ni token. No es
adaptación mecánica, es reescritura. El legacy se conserva sin tocar hasta el PR de limpieza
del sistema viejo (ítem aparte de la deuda conocida).

## Decisiones tomadas (con el usuario)

1. **Alcance del MVP: fundar ciudad, construir, terminar turno.** Sin mover ejército, atacar,
   ni reclutar (necesitan UI de combate, quedan para una iteración posterior).
2. **Renderizado: grilla CSS (`div`s en CSS grid), no `<canvas>`.** Más fácil de testear
   manualmente, de estilar consistente con el resto de la app (que no usa canvas en ningún
   lado), y de hacer clickeable/accesible. Sin zoom/pan en el MVP; scroll nativo alcanza
   para el máximo de 60×60 casillas que valida el backend.
3. **Sockets desde el MVP**, no REST puro. `StorySession.vue` (modo narrativo) ya tiene el
   patrón de conectar socket y escuchar eventos de estado; no es una técnica nueva en este
   codebase. Sin esto, dos jugadores en la misma partida no se enteran de las jugadas del
   otro sin recargar la página, pobre para un juego pensado para jugarse en la misma sala.
4. **Navegación: selector de modo en la pantalla inicial** (narrativo vs mapa beta), delante
   de lo que hoy es directamente `StoryLobby`. Consistente con cómo creció el proyecto
   (agregar sin romper lo que ya funciona).
5. **Sin tests automatizados de frontend** (el proyecto no tiene ninguno hoy, confirmado en
   la auditoría original). Verificación manual en navegador real antes de dar la tarea por
   terminada.

## 1. Arquitectura de archivos

Todo nuevo, en su propio namespace. No se toca ningún componente del modo narrativo ni los
archivos legacy del modo mapa viejo (`GameMap.vue`, `useGameApi.js`, `useGameSocket.js`,
`GameLobby.vue`, `ActionPanel.vue`, `PlayerInfo.vue`, `ResourcePanel.vue`).

```
frontend/src/composables/useMapApi.js       peticiones REST a /api/map, header X-Jugador-Token
frontend/src/composables/useMapSocket.js    conexion socket, map:join con token, listener 'estado'
frontend/src/components/mapa/
  ModeSelect.vue        pantalla inicial: "Modo narrativo" | "Modo mapa (beta)"
  MapLobby.vue           crear / unirse / listar partidas / iniciar
  MapSession.vue         orquesta la partida en curso (vista, acciones, socket)
  MapGrid.vue             la grilla de casillas (CSS grid, sin canvas)
  MapTile.vue              una casilla individual
  MapPlayerPanel.vue      recursos propios, jugadores, de quien es el turno
  MapActionBar.vue        fundar ciudad / construir / terminar turno
```

`App.vue` gana un `currentMode` ref (`'narrativo' | 'mapa' | null`), delante del
`currentView` que ya tiene. Con `currentMode === null` se muestra `ModeSelect`. Elegir
"narrativo" mantiene el flujo actual sin cambios (`StoryLobby`/`StorySession`). Elegir "mapa"
monta `MapLobby`/`MapSession` con la misma lógica de alternancia. El resto de `App.vue`
(error toast, estilos globales) no cambia de forma.

## 2. Contrato de la API consumida (referencia exacta)

De `backend/src/routes/mapRoutes.js` y `backend/src/domain/mapa/MapGame.js`:

- `POST /api/map` — body `{ nombre, semilla?, config? }`. `config` opcional:
  `{ tamanoMapa: 10-60, maxJugadores: 2-8, modoTurno: 'secuencial' }` (valores fuera de rango
  dan `ReglaError CONFIG_INVALIDA`; el default es `{20, 4, 'secuencial'}`). Devuelve
  `{ id, codigo }`, 201.
- `GET /api/map` — lista `[{ id, codigo, nombre, estado }]`, sin auth.
- `POST /api/map/:id/unirse` — body `{ id: jugadorId, nombre, civilizacion }`. El `jugadorId`
  lo genera el cliente con `crypto.randomUUID()` (disponible nativamente en el navegador) al
  entrar al lobby, antes de llamar a `unirse`. Devuelve `{ vista, token }`, 200. El `token`
  se emite una única vez acá.
- `POST /api/map/:id/iniciar` — sin body, sin token. Devuelve la vista del jugador que
  arranca, 200.
- `POST /api/map/:id/accion` — header `X-Jugador-Token`, body
  `{ jugadorId, tipo, ...datosDeLaAccion }`. Para este MVP, `tipo` es una de:
  - `fundarCiudad`: `{ x, y, nombre }`
  - `construir`: `{ x, y, edificio }` (edificio uno de `granary`, `market`, `library`,
    `barracks`, ver `docs/reglas-modo-mapa.md` para costos)
  - `terminarTurno`: sin datos adicionales
  Devuelve `{ vista, eventos }`, 200.
- `GET /api/map/:id?jugadorId=` — header `X-Jugador-Token`. Devuelve la vista filtrada, 200.
- Errores: `ReglaError` → 400 `{ codigo, mensaje }` (`PARTIDA_NO_ENCONTRADA` → 404 en su
  lugar).
- Socket: `map:join(gameId, jugadorId, token, ack?)` une la sala privada
  `map:<gameId>:<jugadorId>`; evento `'estado'` llega con la vista filtrada actualizada cada
  vez que cualquier jugador ejecuta una acción (incluida la propia).

## 2b. `MapLobby.vue` — alcance del formulario

Dos acciones: "Crear partida nueva" (pide solo `nombre`; `config` NO se expone en el MVP,
se manda `undefined` y el backend aplica sus defaults — `20×20`, hasta 4 jugadores) y "Unirse
con código" (pide `código` + `nombre` civilización). Ambas piden también el nombre del
jugador (civilización) antes de llamar a `unirse`. Tras crear, el lobby llama automáticamente
a `unirse` con el `jugadorId` recién generado (el creador entra como jugador 1, mismo patrón
que `StoryLobby` con las sesiones narrativas) y navega a `MapSession`. `GET /api/map` alimenta
una lista de partidas "esperando" a las que unirse sin escribir código a mano, como atajo.

## 3. Estado y flujo de datos

`MapSession.vue` es el único componente que habla con la API y el socket; los hijos son
props-down/emit-up puro, mismo patrón que ya usa `StorySession.vue`. Estado que maneja:

```js
partidaId, codigo, jugadorId, token   // persistidos en localStorage bajo las claves
                                        // cronicas-mapa-id, cronicas-mapa-codigo,
                                        // cronicas-mapa-jugadorId, cronicas-mapa-token
vista        // el objeto que devuelve GET /api/map/:id (la vista ya filtrada)
eventos      // eventos de la ultima accion propia, para feedback breve (ej. toast)
```

**Al montar `MapSession`:** si hay algo guardado en localStorage, intenta
`GET /api/map/:id?jugadorId=` con el token guardado. Si responde 400 (`TOKEN_INVALIDO`) o 404
(`PARTIDA_NO_ENCONTRADA`), limpia las 4 claves de localStorage y vuelve a `MapLobby` (mismo
criterio que `loadSavedSession` en `App.vue` para el modo narrativo). Si responde 200, guarda
`vista` y conecta el socket: `useMapSocket().connect()` seguido de
`map:join(partidaId, jugadorId, token)`.

**Cada acción** (`fundarCiudad`, `construir`, `terminarTurno`) llama
`POST /api/map/:id/accion` con el header, y actualiza `vista` con `resultado.vista` de la
respuesta. El listener del evento `'estado'` del socket simplemente reemplaza `vista` con el
payload recibido — no distingue si el cambio vino de la propia acción o de otro jugador,
porque en ambos casos el valor final es el mismo (la vista ya filtrada y actualizada).

## 4. La grilla del mapa

`MapGrid.vue` recibe `vista.mapa` (array plano) y `vista.config.tamanoMapa`, y arma un CSS
grid de `tamanoMapa × tamanoMapa` (`grid-template-columns: repeat(tamanoMapa, minmax(24px,
1fr))`) con scroll nativo (`overflow: auto`) dentro de un contenedor de alto/ancho fijo (ej.
`70vh`). El índice de cada tile en el array ya es `y * tamanoMapa + x` (mismo orden que
`generarMapa` produce en el backend), así que no hace falta reordenar nada del lado del
cliente.

`MapTile.vue` recibe un tile y pinta:
- `tile.descubierto === false` → gris uniforme, sin contenido, sin interacción (no hay nada
  que mostrar ni que clickear ahí).
- `tile.descubierto === true` → color de fondo según `tile.terreno` (paleta fija de 6
  colores, uno por tipo de terreno); ícono simple si `tile.ciudad` existe; borde de color
  distinto si `tile.dueno === jugadorId` (propio) vs cualquier otro valor no nulo (ajeno);
  sin borde si `tile.dueno` es `null` (neutral).

Click en un tile con `descubierto === true`, `dueno === jugadorId` (o `null`, territorio
propio recién reclamado) y sin `ciudad`: emite `fundar-ciudad` con `{x, y}` hacia
`MapSession`, que abre el flujo de fundar (ver sección 5). Click en un tile con `ciudad`
propia: emite `abrir-ciudad` con `{x, y}` para el flujo de construir. Cualquier otro click no
hace nada en este MVP (no hay acción de mover/atacar).

## 5. Acciones — `MapActionBar.vue` y flujos

`MapActionBar.vue` recibe `vista` y `jugadorId`, y muestra:
- De quién es el turno actual: `vista.jugadores[vista.indiceJugadorActual].nombre`.
- Un botón "Terminar turno", habilitado solo si `vista.jugadores[vista.indiceJugadorActual].id
  === jugadorId`; deshabilitado (con el texto "No es tu turno") en cualquier otro caso. Esto
  es adelantarse a lo obvio en la UI; el backend igual valida y devuelve `NO_ES_TU_TURNO` si
  se intenta de todas formas.

**Fundar ciudad:** disparado por el click en `MapGrid` (sección 4). Pide el nombre de la
ciudad con `prompt()` (simple a propósito para el MVP; nada de modal custom todavía). Si el
usuario cancela el prompt, no se llama a la API. Si completa, `POST accion` con
`{ tipo: 'fundarCiudad', x, y, nombre }`.

**Construir:** disparado por el click en una ciudad propia. Muestra un menú simple (4
botones, uno por edificio: `granary`, `market`, `library`, `barracks`) con su costo tomado de
`docs/reglas-modo-mapa.md` mostrado en el botón. Click en un edificio dispara
`POST accion` con `{ tipo: 'construir', x, y, edificio }`.

## 6. Manejo de errores y feedback

Cada error de `ReglaError` (`NO_ES_TU_TURNO`, `RECURSOS_INSUFICIENTES`, `POSICION_INVALIDA`,
`CASILLA_OCUPADA`, `EDIFICIO_DUPLICADO`, `TOKEN_INVALIDO`, etc.) se muestra con el
`error-toast` que ya existe en `App.vue` (reusado tal cual, mismo componente que usa el modo
narrativo), con el `mensaje` que manda el backend directamente, sin traducir ni reformular.

**Desconexión de socket:** se deja la reconexión automática default de `socket.io-client`
(no se desactiva `reconnection`). Mientras el socket está caído, la UI sigue funcionando por
REST — las acciones no dependen del socket, solo la actualización en vivo de las jugadas de
otros jugadores.

## 7. Testing

El frontend no tiene ningún test hoy (`frontend/package.json` no define script `test`,
confirmado en `docs/auditoria-sistema-legacy.md`). Este plan no lo introduce; sigue el
patrón ya establecido del proyecto. La verificación es manual en navegador real
(`preview_start` + dos pestañas simulando dos jugadores) antes de dar cada tarea por
terminada: crear partida, unirse con dos jugadores, iniciar, fundar ciudad, confirmar que la
otra pestaña recibe el evento de socket sin recargar, construir un edificio, terminar turno,
confirmar que el turno pasa al otro jugador visualmente.

## Fuera de alcance (explícito)

- Mover ejército, atacar, reclutar (necesitan UI de combate; próxima iteración).
- Zoom/pan del mapa.
- Tests automatizados de frontend.
- Borrado de `GameMap.vue`/`useGameApi.js`/`useGameSocket.js`/`GameLobby.vue`/
  `ActionPanel.vue`/`PlayerInfo.vue`/`ResourcePanel.vue` legacy (PR de limpieza aparte).
- Diseño visual nuevo: se reusa la paleta oscura y los estilos ya existentes del proyecto
  (gradiente `gray-900`/`gray-800`, mismo `error-toast`), sin inversión de diseño adicional.
- Responsive/mobile específico para el mapa (el resto de la app sí lo tiene; el mapa en este
  MVP asume pantalla de escritorio).
