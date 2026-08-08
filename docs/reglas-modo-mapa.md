# Reglas del modo mapa

Referencia de balance del "modo mapa" (estrategia por turnos sobre un tablero de casillas). Todos los valores están copiados tal cual de `backend/src/domain/mapa/constantes.js`; si algo cambia en ese archivo, hay que actualizar esta tabla. Para la fórmula de combate y las condiciones de victoria, la fuente es `backend/src/domain/mapa/reglas/combate.js` y `backend/src/domain/mapa/reglas/turnos.js`.

## Recursos

Recursos existentes: `food`, `gold`, `wood`, `stone`, `science`, `culture`.

Recursos que se pueden extraer de una casilla de terreno (bonos de producción): `food`, `gold`, `wood`, `stone` (es decir, todos salvo `science` y `culture`).

### Recursos iniciales de cada jugador

| Recurso | Cantidad |
|---|---|
| food | 100 |
| gold | 50 |
| wood | 80 |
| stone | 30 |
| science | 0 |
| culture | 0 |

## Fundar una ciudad

Costo de fundar una ciudad nueva:

| Recurso | Costo |
|---|---|
| food | 50 |
| wood | 30 |
| stone | 20 |

No se puede fundar sobre agua ni sobre una casilla ya ocupada (con ciudad o con dueño).

## Edificios

| Edificio | Costo | Producción por ronda |
|---|---|---|
| granary | food 30, wood 20 | food +3 |
| market | gold 50, wood 30 | gold +5 |
| library | science 20, stone 40 | science +3 |
| barracks | gold 40, stone 30 | (ninguna; habilita reclutar cavalry y catapult) |

No se puede construir el mismo edificio dos veces en la misma ciudad.

## Unidades

| Unidad | Ataque | Defensa | Salud | Movimiento | Costo | Requiere barracks |
|---|---|---|---|---|---|---|
| warrior | 10 | 8 | 100 | 2 | food 20, gold 30, wood 10 | No |
| archer | 15 | 5 | 80 | 2 | food 15, gold 25, wood 15 | No |
| spearman | 12 | 15 | 90 | 2 | food 18, gold 20, wood 12 | No |
| cavalry | 20 | 12 | 120 | 3 | food 25, gold 40, wood 5 | Sí |
| catapult | 25 | 3 | 60 | 1 | food 10, gold 50, wood 30, stone 20 | Sí |

`cavalry` y `catapult` sólo se pueden reclutar en una ciudad que ya tenga el edificio `barracks` construido.

## Terreno: bonos de producción

Producción extra que da cada tipo de terreno, además de la producción base de la ciudad (ver más abajo):

| Terreno | Bono |
|---|---|
| plains | food +2, gold +1 |
| forest | wood +3, food +1 |
| mountains | stone +4, gold +2 |
| hills | stone +2, gold +1, food +1 |
| desert | gold +1 |
| water | (ninguno) |

## Terreno: bonos de defensa

Multiplicador que se aplica al poder de defensa de una unidad (o ciudad) que está parada sobre esa casilla al ser atacada. El terreno que no aparece en esta tabla no da bono (multiplicador 1.0):

| Terreno | Multiplicador de defensa |
|---|---|
| mountains | x1.25 |
| hills | x1.25 |
| forest | x1.1 |

Ejemplo concreto ("¿por qué perdió mi archer en una montaña?"): un `archer` (defensa base 5) parado en `mountains` defiende con `5 * 1.25 = 6.25` de base (antes de la tirada aleatoria), muy por debajo del ataque base de casi cualquier unidad. `mountains` ayuda, pero no compensa una defensa base tan baja.

## Producción base de una ciudad

Cada ciudad, sin importar el terreno ni los edificios, produce esto por ronda:

| Recurso | Cantidad |
|---|---|
| food | 5 |
| gold | 3 |
| culture | 2 |

La producción total de una ciudad en una ronda es: producción base de ciudad + bono de terreno de la casilla donde está fundada + producción de cada edificio construido.

## Defensa de una ciudad

- Defensa base de una ciudad según su nivel: `8 + 2 * nivel`.
- Además, si el objetivo del ataque es una ciudad (no una unidad en campo abierto), la defensa recibe un multiplicador adicional de **x1.5** (`BONO_DEFENSA_CIUDAD`), que se suma al multiplicador de terreno de la casilla.

## Fórmula de combate

Al atacar, se calcula:

- `poderAtaque = ataqueDeLaUnidadAtacante * tirada()`
- `poderDefensa = defensaBase * tirada() * bonoDeTerreno * (1.5 si el objetivo es una ciudad, si no 1)`

Donde `defensaBase` es la defensa de la unidad defensora, o `8 + 2 * nivel` si se ataca una ciudad sin unidad defendiéndola. `tirada()` es un número aleatorio (mismo generador para ambos lados, pero tirado por separado para cada uno, así que el resultado no es determinista).

**Gana el atacante sólo si `poderAtaque > poderDefensa` (estrictamente mayor). En caso de empate exacto, gana el defensor.** Esta regla se decidió durante la implementación: no está en ningún documento previo, así que si alguna vez cambia el código sin querer, hay que corregir este párrafo también.

El daño se calcula así:

- `damageMultiplier = |poderAtaque - poderDefensa| / max(poderAtaque, poderDefensa)`
- `dano = max(10, round(50 * damageMultiplier))`

Es decir: el daño mínimo de cualquier combate es 10, y crece hasta un máximo teórico de 50 cuanto más lejos está el resultado de un empate. Sólo el bando perdedor recibe daño (el ganador no pierde salud en ese combate).

Si una unidad defensora queda con salud <= 0 tras el daño, es destruida. Si el objetivo era una ciudad sin unidad defendiéndola y el atacante gana, la ciudad es capturada por el atacante (con sus edificios).

## Condiciones de victoria

Al cerrar cada ronda (cuando el turno vuelve a pasar por el primer jugador) se evalúa la victoria en este orden:

1. **Si no queda ningún jugador activo** (todos fueron eliminados en el mismo cierre de ronda), la partida termina en **empate** (`PartidaTerminada` con `ganador: null`). Esta regla es defensiva: hoy es inalcanzable en la práctica, porque capturar una ciudad transfiere su dueño en vez de destruirla, así que normalmente siempre queda al menos un jugador activo. Se dejó documentada por si en el futuro se agrega una forma de destruir ciudades.
2. **Victoria por dominación**: se cuenta cuántas casillas de tierra (terreno distinto de `water`) posee cada jugador activo, sobre el total de casillas de tierra del mapa (el agua nunca se incluye en el total, porque el agua nunca puede tener dueño). Si algún jugador llega a poseer el **60%** (`PORCENTAJE_VICTORIA_DOMINACION = 0.6`) o más de las casillas de tierra, gana por dominación.
3. **Último en pie**: si después de las eliminaciones de esa ronda sólo queda un jugador activo, ese jugador gana automáticamente.

### Eliminación de jugadores

Un jugador es eliminado al cierre de una ronda si se queda sin ninguna ciudad. Importante: **un jugador eliminado NO pierde sus casillas ni sus ejércitos**, sólo deja de poder jugar. Sus casillas siguen contando como suyas para el cálculo de dominación de los demás jugadores, así que un jugador no puede ganar por dominación simplemente esperando a que sus rivales sean eliminados: tiene que conquistar ese territorio en el campo de batalla.

## Movimiento

- Cada unidad tiene puntos de movimiento (columna "Movimiento" de la tabla de unidades) que se gastan al moverse o atacar.
- El movimiento es en cuadrícula (distancia Manhattan): sólo se puede mover o atacar a una casilla **adyacente** (arriba, abajo, izquierda o derecha), nunca en diagonal.
- El agua es intransitable: ninguna unidad puede moverse a una casilla de terreno `water`.
- No se puede mover una unidad propia hacia una casilla enemiga (con dueño, ejército o ciudad ajena): para eso hay que usar la acción de atacar.
- Sólo puede haber un ejército por casilla: si ya tenés una unidad propia en la casilla destino, no podés mover otra encima.
- Los puntos de movimiento de todas las unidades se restauran por completo al cierre de cada ronda.

## Reclutamiento

Para reclutar una unidad hace falta:

- Que la casilla tenga una ciudad propia.
- Que la casilla no tenga ya un ejército parado ahí.
- Si la unidad requiere `barracks` (`cavalry`, `catapult`), que la ciudad tenga ese edificio construido.
- Tener los recursos suficientes según el costo de la unidad.
