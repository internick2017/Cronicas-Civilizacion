# Auditoría del sistema legacy de civilización

Fecha: 2026-08-08. Rama: `milestone-2`.

Alcance: `models/Game.js`, `models/Player.js`, `services/GameService.js`, `CityService.js`,
`MilitaryService.js`, `ResourceService.js`, `PlayerService.js`, contrastados contra
`database/init.sql`.

Objetivo: saber en qué estado real está la base sobre la que el backlog #3 ("modo mapa de
ciudades") pensaba construir, antes de escribir una línea de código nuevo.

**Conclusión corta:** la base no es "código sin terminar al que le faltan features". Son **dos
implementaciones rivales e incompatibles del mismo juego**, y la mitad basada en SQL nunca
pudo haber funcionado, porque consulta columnas que no existen en el esquema. Reconstruir
encima de esto sale más caro que rehacer la capa de dominio.

Todos los hallazgos marcados como *verificado* se comprobaron ejecutando el código, no
leyéndolo.

---

## Bloqueantes

### B1. Dos modelos de datos rivales para la misma entidad

Existen dos implementaciones completas y desconectadas de "ciudad", "ejército" y "recursos":

| Concepto | Implementación A | Implementación B |
|---|---|---|
| Ciudad | `Game.foundCity()`, objeto `tile.city` en memoria | `CityService.foundCity()`, tabla `cities` |
| Costo de ciudad | `food 50, gold 100, wood 30` | `food 50, wood 30, stone 20` |
| Ejército | `tile.army` + `Game.initiateCombat()` | `MilitaryService`, tabla `armies`, 5 tipos de unidad |
| Recursos | `player.resources` en memoria | `ResourceService`, tabla `player_resources` |
| Recursos iniciales | `food 10 / gold 10` (ver B4) | `food 100, gold 50, wood 80, stone 30` |

Nunca se comunican. `Game.js` no importa ningún servicio; los servicios no conocen `Game`.
Las reglas de negocio (costos, producción, combate) están duplicadas con valores distintos.

### B2. `CityService` y `MilitaryService` no pueden funcionar contra el esquema real

No es que estén incompletos: las consultas referencian columnas que `database/init.sql`
nunca crea. Fallan en el primer `INSERT`/`UPDATE`.

- `CityService.foundCity()` inserta en `cities` las columnas `city_type, defense, happiness,
  culture_level, science_level` — ninguna existe. Y **omite `founded_turn`**, que es `NOT NULL`
  sin default. Doble fallo garantizado.
- `CityService.foundCity()` y `MilitaryService.createUnit()` hacen
  `UPDATE map_tiles SET has_city / city_id / has_army / army_id` — ninguna de esas 4 columnas
  existe en `map_tiles`.
- `MilitaryService.createUnit()` inserta en `armies` las columnas `unit_type, name, attack,
  defense, health, max_health, movement, current_movement, experience, level`. La tabla real
  solo tiene `strength` y `created_turn`.
- `CityService.updateCityStats()` valida contra esa misma lista de columnas inexistentes.

Consecuencia: los endpoints `/api/cities` y `/api/military` están montados en
`server-dynamic.js` y devuelven error siempre que tocan la base. Nadie lo notó porque el
frontend nunca los llama.

### B3. Las ciudades nunca se persisten

`GameService.saveMapToDB()` guarda `terrain, resources, owner_id, discovered`. **No guarda
`tile.city`** — y no podría, porque `map_tiles` no tiene columna para ello (ver B2).
`loadMapFromDB()` reconstruye cada tile con esos 4 campos, así que además pierde `army`.

Al recargar una partida desde la base, el territorio sobrevive pero **todas las ciudades
desaparecen**, incluidas las capitales.

El parche `checkMapHasPlayerTerritories()` + `initializeStartingPositions()` en
`getGameById()` intenta tapar esto, pero está mal condicionado: pregunta
`ownedTiles > 0 || citiesFound > 0`. Como el `owner` **sí** se persiste, la condición da
verdadero y la reinicialización nunca se dispara. La partida queda con dueños de territorio
y cero ciudades.

### B4. Cada jugador recibe dos capitales — *verificado*

`GameService.startGame()` llama a `Game.startGame()`. Pero la capital ya fue asignada antes,
en `Game.addPlayer()` → `assignStartingPosition()`. `startGame()` coloca **otra** capital en
una posición aleatoria, sin comprobar la existente.

```
tras addPlayer  -> p1: 1 capital   p2: 1 capital
tras startGame  -> p1: 2 capitales p2: 2 capitales
```

### B5. `getState()` nunca expone los recursos del jugador — *verificado*

`Player.toJSON()` no incluye `resources`. `Game.getState()` usa `toJSON()` cuando el jugador
es una instancia de `Player` (siempre, en el flujo real) y solo incluye `resources` en la
rama de fallback para objetos planos.

```
players[0] keys: id,name,civilizationName,avatar,isOnline,stats,createdAt,lastSeen
players[0].resources = undefined
```

El frontend no puede mostrar recursos. `ResourcePanel.vue` no tiene de dónde leerlos.

### B6. Los recursos se escriben en la base pero nunca se leen de vuelta

`GameService.updateGameInDB()` guarda `player_resources` correctamente. Pero al recargar,
`getGameById()` reconstruye cada jugador con `new Player({id, name, civilizationName})`, y el
constructor de `Player` inicializa todos los recursos en **0**. La tabla `player_resources`
se escribe y jamás se consulta.

B3 + B6 juntos: al reiniciar el backend, una partida en curso pierde ciudades y recursos. Solo
sobrevive quién es dueño de qué casilla.

---

## Altos

### A1. `start()` y `startGame()` son dos arranques rivales — *verificado*

`Game.js` define ambos. Dan recursos iniciales distintos:

```
start()     -> {"food":100,"gold":50,"wood":50,"stone":30,"science":10,"culture":10,"army":1}
startGame() -> {"food":10, "gold":10,"wood":10,"stone":10,"science":5, "culture":5, "army":5}
```

`GameService` solo llama a `startGame()`, así que `start()` es código muerto. Es el mismo
patrón del bug que arreglamos en el PR #4 (métodos duplicados), que sobrevivió porque los
nombres difieren y ESLint no lo detecta.

### A2. La niebla de guerra es global, no por jugador — *verificado*

`discoverSurroundingTiles(x, y, playerId)` **recibe `playerId` y lo ignora**: marca
`tile.discovered = true`, un booleano único para todos. `getPlayerView()` filtra por ese mismo
flag compartido.

```
tiles visibles r1: 18 | r2: 18 => identicos? true
```

Cuando un jugador explora, todos ven lo explorado. Para un modo de dominación territorial esto
no es un detalle: es la mecánica central rota. El arreglo requiere cambiar el modelo de tile
(`discoveredBy: Set<playerId>`) y su persistencia.

### A3. Jugadores que se quedan sin capital, en silencio — *verificado*

`findStartingPositions()` calcula `maxPlayers` posiciones en círculo y **descarta** las que caen
en agua, devolviendo un array más corto. `assignStartingPosition()` indexa ese array con
`this.players.length - 1`. Dos problemas:

1. Los índices dejan de corresponder al jugador (el jugador 3 recibe la posición pensada para
   el 4).
2. Si el array es más corto, `position` queda `undefined` y el `if (position)` **se traga el
   caso sin avisar**: el jugador entra a la partida sin capital ni territorio.

En una corrida, con `maxPlayers: 4`, devolvió solo **2** posiciones.

### A4. `canAfford()` aprueba compras con recursos que no existen — *verificado*

```js
if (player.resources[resource] < amount) return false;
```

Si la clave no existe, `undefined < amount` es `false`, así que la comprobación pasa. Después
`deductResources()` hace `undefined - amount`:

```
canAfford({gold:999}) = true  (esperado: false)
tras deduct -> gold = NaN
```

Una vez que un recurso es `NaN`, toda comparación posterior con él es `false` para siempre: el
jugador queda con recursos infinitos e imposibles de gastar.

### A5. Sin validación de límites del mapa — *verificado*

`foundCity()`, `collectResource()` y `moveArmy()` indexan `this.map[x][y]` con coordenadas del
cliente sin verificar rango. Validan la *forma* de la posición (`typeof x === 'undefined'`)
pero no el rango.

```
foundCity({x:999, y:999}) -> TypeError: Cannot read properties of undefined (reading '999')
```

Un cliente malicioso o con un bug convierte esto en un 500. `moveArmy()` ni siquiera valida la
forma.

---

## Medios

- **M1.** `loadGameFromDB()` llama a `getGameById()`, que ya registra una instancia en
  `this.games`, y después construye una **segunda** instancia con `new Game(estado)` que
  sobrescribe a la primera. Dos objetos divergentes para la misma partida.
- **M2.** `Game.processAction()` llama a `nextTurn()` **antes** de que `GameService` inserte en
  `game_history`, así que la acción se registra con el número de turno siguiente. El historial
  queda desfasado en uno.
- **M3.** `loadMapFromDB()` deduce el tamaño del mapa con `Math.sqrt(rows.length)`. Si falta una
  fila (borrado parcial, inserción a medias), el resultado no es entero y el mapa se corrompe en
  silencio.
- **M4.** `Game.resetToWaiting()` limpia recursos e historial pero **no** el mapa: ciudades y
  dueños de la partida anterior quedan en pie.
- **M5.** Las victorias se evalúan después de `nextTurn()`, así que se atribuyen al turno
  siguiente al que las produjo.
- **M6.** `Game.js` tiene `console.log` de depuración en rutas calientes (`getCurrentPlayer()`
  se llama desde `getState()`, o sea en cada request).
- **M7.** Cero tests para las ~3.400 líneas de este subsistema. Todo lo de arriba es
  indetectable por regresión hoy.

---

## Recomendación

El backlog #3 asumía que este código era "una base a la que le faltan features". No lo es. Con
B1–B3, la mitad SQL del sistema nunca ejecutó correctamente ni una vez, y la mitad en memoria
pierde el estado en cada reinicio.

Reconstruir sobre esto significa arreglar 6 bloqueantes y 5 problemas altos **antes** de
escribir la primera línea del modo mapa, y además elegir cuál de los dos modelos de datos
sobrevive, con sus reglas de negocio duplicadas.

Tres caminos:

1. **Rehacer la capa de dominio, reusar las ideas.** Empezar `Game` de nuevo con TDD, un solo
   modelo de datos y persistencia real. `CityService`/`MilitaryService` quedan como
   especificación en prosa de las reglas (tipos de unidad, bonos de terreno, costos), que es su
   valor real. Es lo que recomiendo.
2. **Reparar en orden.** B2→B3→B6 (persistencia), después B4/A1/A3 (arranque), después A2
   (niebla), con tests en cada paso. Más lento y hereda el diseño de dos cabezas.
3. **Aparcar el modo mapa** y avanzar con las otras deudas (QA de voz y modo simultáneo, tests
   de frontend, los god-objects).

En cualquiera de los tres, el paso siguiente inmediato es el mismo: **decidir un único modelo de
datos**. Es la decisión que desbloquea todo lo demás.
