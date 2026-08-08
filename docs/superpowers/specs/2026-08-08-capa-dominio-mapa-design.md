# Capa de dominio del modo mapa — Diseño

Fecha: 2026-08-08. Rama: `milestone-2`.
Contexto previo: `docs/auditoria-sistema-legacy.md` (auditoría que motiva este rediseño).

## Objetivo

Rehacer desde cero la capa de dominio del modo "mapa de civilización" (backlog #3 + #4),
con TDD, un único modelo de datos y persistencia real. Reemplaza a `Game.js`,
`GameService.js`, `CityService.js`, `MilitaryService.js` y `ResourceService.js`, que quedan
solo como especificación de reglas (tipos de unidad, bonos de terreno, costos) hasta su
borrado al final.

## Decisiones tomadas (con el usuario)

1. **El dominio calcula, la IA cuenta.** El modo mapa es un juego de reglas determinista;
   el narrador IA describe cada ronda a partir de eventos estructurados. La IA nunca toca
   el estado del juego. Si la IA falla, la partida sigue sin prosa.
2. **Alcance completo:** mapa, ciudades, recursos, ejércitos y combate (backlog #3 y #4).
   El plan de implementación escalona: jugable sin combate primero.
3. **Persistencia:** snapshot JSON por partida + log de eventos append-only. Nada de
   tablas por concepto.
4. **Turnos:** secuencial. El modelo (resolución por ronda, eventos) deja la puerta
   abierta al modo simultáneo, que NO se implementa ahora.
5. **Arquitectura:** agregado `MapGame` tonto (estado + serialización) + módulos de reglas
   puros que devuelven eventos + un único módulo que aplica eventos al estado.

## 1. Arquitectura y límites

```
backend/src/domain/mapa/            dominio puro. PROHIBIDO importar fuera del directorio:
  MapGame.js                        ni pool, ni aiService, ni logger, ni socket.
  generarMapa.js
  aplicar.js
  errores.js                        ReglaError
  reglas/ciudades.js
  reglas/militar.js
  reglas/movimiento.js
  reglas/combate.js
  reglas/turnos.js
  reglas/visibilidad.js
backend/src/services/MapGameService.js   orquestación: DB, narrador, sockets
backend/src/routes/mapRoutes.js
```

Flujo de una acción:

```
POST /api/map/:id/accion
  -> MapGameService carga snapshot
  -> dominio: validar(estado, accion, rng) -> [eventos] | ReglaError
  -> dominio: aplicar(estado, eventos) -> estado nuevo
  -> MapGameService guarda snapshot + agrega eventos al log
  -> NarrativeService: eventos de la ronda -> prosa (async, no bloquea)
  -> socket: estado (vista por jugador) + narrativa
```

Regla de oro: si un test del dominio necesita base de datos o mock, el diseño se rompió.

### Código legacy

- Al empezar: extraer a docs las reglas útiles (5 tipos de unidad de `MilitaryService`,
  bonos de terreno de `ResourceService`, costos de acciones).
- Durante la construcción: el legacy no se toca, convive.
- Al final (PR aparte y explícito): borrar `Game.js`, `GameService.js`, `CityService.js`,
  `MilitaryService.js`, `ResourceService.js`, sus rutas (`gameRoutes`, `cityRoutes`,
  `militaryRoutes`, `resourceRoutes`), `gameSocket.js`, y los componentes Vue muertos que
  no se reusen.

## 2. Modelo de datos (snapshot)

```js
{
  id, nombre,
  estado: 'esperando' | 'jugando' | 'terminado',
  versionEsquema: 1,
  semilla,                    // string; el mapa se regenera identico desde la semilla
  turno, indiceJugadorActual,
  config: { tamanoMapa: 20, maxJugadores: 4, modoTurno: 'secuencial' },
  jugadores: [
    { id, nombre, civilizacion,
      recursos: { food, gold, wood, stone, science, culture },  // SIEMPRE las 6 claves
      activo }
  ],
  mapa: [   // array PLANO de tamano*tamano tiles; indice = y * tamano + x
    { x, y, terreno, recurso,          // recurso: string | null
      dueno,                            // playerId | null
      ciudad,                           // { nombre, nivel, poblacion, edificios: [] } | null
      ejercito,                         // { tipo, salud, movimientoRestante } | null
      descubiertoPor: []                // playerIds; niebla POR JUGADOR
    }
  ],
  ganador: null | { jugadorId, tipoVictoria, turno }
}
```

Mapa de decisiones → hallazgos de la auditoría que cierran:

| Decisión | Cierra |
|---|---|
| `descubiertoPor: []` por jugador | A2 (niebla global) |
| Todo el estado vive en el snapshot | B3, B6 (ciudades/recursos no persistidos) |
| Capitales se reparten en un único lugar, `iniciar()` | B4 (dos capitales) |
| Posiciones iniciales garantizadas o la partida no arranca | A3 (jugador sin capital en silencio) |
| `recursos` con las 6 claves siempre + validación de clave en `puedePagar` | A4 (NaN / recursos infinitos) |
| Helper único `tileEn(estado, x, y)` → `null` fuera de rango | A5 (TypeError 500) |
| `semilla` explícita, rng inyectado | tests deterministas |
| Array plano con `tamanoMapa` en config | M3 (Math.sqrt frágil) |
| Un solo arranque `iniciar()` | A1 (start vs startGame) |
| `versionEsquema` en el snapshot | migraciones futuras |

Nota de tamaño: 20×20 = 400 tiles ≈ 60KB de JSON. Sin problema.

## 3. Acciones y eventos

Cada acción es una función pura `(estado, jugadorId, params, rng) -> [eventos]` o lanza
`ReglaError`. Seis acciones:

| Acción | Módulo | Eventos |
|---|---|---|
| `fundarCiudad(pos, nombre)` | ciudades | RecursosGastados, CiudadFundada, TerritorioReclamado, TerritorioDescubierto |
| `construir(pos, edificio)` | ciudades | RecursosGastados, EdificioConstruido |
| `reclutar(pos, tipoUnidad)` | militar | RecursosGastados, UnidadReclutada |
| `moverEjercito(desde, hasta)` | movimiento | EjercitoMovido, TerritorioDescubierto, TerritorioReclamado |
| `atacar(desde, hasta)` | combate | CombateResuelto, UnidadDestruida?, CiudadCapturada? |
| `terminarTurno()` | turnos | RecursosProducidos, TurnoAvanzado, RondaCompletada?, PartidaTerminada? |

Forma de un evento (dato plano, sin comportamiento):

```js
{ tipo: 'CiudadFundada', turno: 3, jugadorId: 'p1',
  datos: { x: 7, y: 12, nombre: 'Cusco', terreno: 'hills' } }
```

`aplicar.js` es el ÚNICO código que muta el estado, un caso por tipo de evento.
El narrador consume la lista de eventos de la ronda; no lee ni escribe estado.

### Combate

Determinista dado un rng sembrado:

```
poderAtaque  = unidad.ataque  * tirada(rng)                  // tirada en [0.8, 1.2]
poderDefensa = unidad.defensa * tirada(rng) * bonoTerreno * bonoCiudad
```

Tipos de unidad, stats y costos: los 5 de `MilitaryService` (warrior, archer, cavalry,
spearman, catapult). Bonos de terreno: los de `ResourceService.getTerrainBonuses`.
Un ejército por tile. Daño al perdedor proporcional a la diferencia; unidad con salud 0
se destruye; ciudad atacada con éxito cambia de dueño (CiudadCapturada).

Reglas de borde (explícitas para evitar ambigüedad):
- `reclutar` solo en un tile con ciudad propia y sin ejército presente.
- `moverEjercito` solo a tiles adyacentes (distancia Manhattan 1), gasta 1 punto de
  movimiento; `atacar` solo a tile adyacente y consume todo el movimiento restante.
- El movimiento de todas las unidades se restaura al cierre de cada ronda.
- Mover a tile neutral lo reclama; mover a tile enemigo NO está permitido (hay que
  `atacar`); el agua es intransitable.

### Producción y victoria

- Al `terminarTurno()` del último jugador de la ronda se cierra la ronda: producción de
  recursos por ciudades (base + edificios + bono de terreno) para TODOS los jugadores,
  y evaluación de victoria. Esto atribuye la victoria al turno correcto (cierra M5) y es
  el punto de extensión para el futuro modo simultáneo.
- Victoria v1: dominación (≥60% de tiles con dueño propio) o último jugador activo en pie.
  Ciencia/cultura/economía quedan fuera; `PartidaTerminada.datos.tipoVictoria` las admite
  después.

## 4. Persistencia

Dos tablas, declaradas UNA sola vez y creadas desde esa declaración en ambos motores
(Postgres y SQLite). La duplicación manual de esquemas fue la causa raíz del bloqueante
B2; no se repite.

```sql
map_games        (id, codigo, version_esquema, estado_json, creado, actualizado)
map_game_eventos (id, game_id, turno, orden, tipo, datos_json, narrativa, creado)
```

- `codigo`: código corto para unirse desde el celular, mismo patrón que StorySession.
- `map_game_eventos` es append-only; `narrativa` guarda la prosa junto a su ronda
  (historial correcto, cierra M2; permite re-narrar sin tocar estado).
- Test obligatorio de round-trip: `estado -> toJSON -> guardar -> cargar -> fromJSON ->
  estado` idéntico, con partidas en los tres estados. Hace imposible repetir B3/B6.
- Cache en memoria (Map) como el narrador; la DB es la fuente de verdad al recargar.

## 5. Errores

`ReglaError` con `codigo` legible por máquina: `RECURSOS_INSUFICIENTES`, `NO_ES_TU_TURNO`,
`POSICION_INVALIDA`, `CASILLA_OCUPADA`, `PARTIDA_LLENA`, `PARTIDA_YA_INICIADA`,
`UNIDAD_SIN_MOVIMIENTO`, `OBJETIVO_INVALIDO`, etc.

- Dominio lanza `ReglaError` → HTTP 400 con `{ codigo, mensaje }`.
- Cualquier otra excepción → 500 y es un bug nuestro.
- Se integra con `utils/errors.js` existente.

## 6. Testing (TDD, orden de construcción)

1. `generarMapa`: misma semilla ⇒ mismo mapa; no todo agua; posiciones iniciales
   garantizadas para `maxJugadores` o error al crear.
2. Round-trip de persistencia (propiedad, tres estados de partida).
3. Una suite por módulo de reglas: estado armado a mano + acción ⇒ eventos esperados o
   `ReglaError` esperado. Sin DB, sin mocks.
4. `aplicar.js`: cada tipo de evento muta exactamente lo que debe.
5. Integración `MapGameService`: crear → unirse → jugar ronda → **reiniciar/recargar desde
   DB → seguir jugando** (el test que el legacy jamás habría pasado).
6. Regresiones explícitas de la auditoría: dos capitales (B4), `puedePagar` con clave
   inexistente (A4), niebla por jugador (A2), posición fuera de rango (A5).

## 7. API y frontend (resumen; detalle en el plan)

- REST: `POST /api/map` (crear), `POST /api/map/:id/unirse`, `POST /api/map/:id/iniciar`,
  `POST /api/map/:id/accion`, `GET /api/map/:id`.
- `GET` y todo push de socket devuelven la **vista del jugador**: niebla aplicada en el
  backend; el mapa completo nunca viaja al cliente.
- Socket.io para push de estado y narrativa, patrón StorySession.
- Frontend: `App.vue` gana selector de modo (narrativo | mapa); `GameMap.vue` se revive
  como base visual adaptada al estado nuevo; los componentes legacy que no se adapten se
  borran en el PR final.

## Fuera de alcance (explícito)

- Modo simultáneo (diseño lo permite; no se implementa).
- Diplomacia (el stub legacy no hacía nada; no se replica).
- Victorias por ciencia/cultura/economía.
- Migración de partidas legacy (no existen partidas que migrar).
- Narración con IA dentro del dominio (la IA queda en la capa de servicio).
