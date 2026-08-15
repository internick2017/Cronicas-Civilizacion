# Modo mapa: mundo con carácter, guerra jugable y feedback sin IA

Fecha: 2026-08-14
Estado: aprobado, pendiente de plan de implementación

## Problema

El modo mapa está completo de punta a punta (backend en `master`, frontend en
`frontend-modo-mapa`) pero se juega como un prototipo:

1. La interfaz solo permite fundar ciudad, construir y terminar turno. `reclutar`,
   `moverEjercito` y `atacar` existen en el dominio y están testeados, pero ningún
   componente los invoca. Sin conflicto no hay juego.
2. El mundo se genera con un dado por casilla: terreno uniformemente aleatorio y
   recursos dispersos al 30%. No hay continentes, costas, regiones ni lugares que
   valga la pena disputar.
3. Al cerrar una ronda no pasa nada visible. No hay log, no hay pantalla de victoria,
   y la narrativa de IA se guarda en la base pero **nunca se lee**: `guardarNarrativa`
   escribe en `map_game_eventos.narrativa` y ningún endpoint ni campo de la vista la
   devuelve.
4. El único narrador es Gemini. Con `GEMINI_API_KEY` vacía la partida queda muda.
5. El mapa se ve como un boceto: cuadrados de color plano, sin sprites, sin distinguir
   una ciudad de un ejército más allá de un emoji, y sin forma de recorrer un mapa que
   puede llegar a 60x60 casillas.

## Objetivo

Que el modo mapa sea un juego completo y con vida **sin depender de credenciales de
Gemini**: mundo legible, guerra jugable, y devolución al jugador en cada ronda y al
final de la partida.

## Fuera de alcance

- Unidades navales. El mapa sigue siendo intransitable por agua.
- Perspectiva isométrica. La vista es cenital con tiles cuadrados.
- Sonido y música.
- Oponentes controlados por bots o por LLM.
- Cualquier cosa del sistema legacy (`GameMap.vue`, `useGameApi.js`, `CityService.js`,
  `MilitaryService.js`, `cityRoutes.js`) y del modo narrativo.

## Decisiones tomadas

| Tema | Decisión |
|---|---|
| Forma del mundo | Continentes con costas irregulares y ríos |
| Narrador | Gemini si hay API key; narrador local por plantillas como fallback. Una sola voz por ronda |
| Control militar | Seleccionar ejército y clickear destino, con casillas válidas resaltadas. Sin drag and drop |
| Determinismo | Se mantiene: mismo `crearRng` namespaced, misma semilla, mismo mapa |
| Renderizado | PixiJS (renderizador, no motor de juego) sobre `<canvas>`, reemplazando la grilla de divs |
| Arte | Sprites CC0 de Kenney (Medieval RTS + Tower Defense Top-Down) |
| Perspectiva | Cenital con tiles cuadrados, 1 a 1 con la grilla del backend |

---

## Sección 1 — Generación de mundo

Archivo: `backend/src/domain/mapa/generarMapa.js`.

Se mantienen la firma `generarMapa(semilla, tamano)` y la forma exacta del tile
(`{x, y, terreno, recurso, dueno, ciudad, ejercito, descubiertoPor}`), así que nada
aguas abajo cambia. Se mantiene el determinismo por semilla.

### Pipeline

1. **Elevación.** Ruido de valor: grilla gruesa de puntos aleatorios (paso ~4 casillas)
   con interpolación bilineal suavizada. Sin dependencias externas, usando el `rng`
   existente. Produce masas continuas en vez de sal y pimienta.
2. **Mar y relieve.** Por umbral de elevación, calibrado para dejar aproximadamente
   **25-32% de agua**: bajo → `water`; muy alto → `mountains`; alto → `hills`.
   Las costas quedan irregulares porque siguen la curva del ruido.
3. **Humedad.** Segundo ruido independiente (semilla `humedad:<semilla>`). En tierra
   baja: húmedo → `forest`, seco → `desert`, medio → `plains`. Aparecen manchones de
   bosque y franjas de desierto.
4. **Ríos.** Desde algunos máximos locales de elevación (cantidad proporcional al
   tamaño), descenso por gradiente hasta tocar agua o el borde del mapa. El cauce se
   marca como `water`. Un río corta en cuanto entra en bucle o supera un largo máximo.

### Recursos en yacimientos

Reemplaza el 30% por casilla independiente. Se siembran N focos (proporcionales al
tamaño) y cada uno crece 2-5 casillas contiguas del mismo recurso, sesgado por terreno:

- `mountains` / `hills` → `stone`
- `forest` → `wood`
- `plains` → `food`
- `desert` / `hills` → `gold`

### Conectividad (riesgo crítico)

Los continentes introducen el riesgo de que dos jugadores queden en masas de tierra
separadas y, sin unidades navales, no puedan alcanzarse jamás: la partida no puede
terminar por dominación ni por conquista.

Mitigación: flood fill sobre las casillas de tierra para identificar la **masa
principal** (la más grande). `posicionesIniciales` reparte capitales **solo dentro de
esa masa**. Si no entran todas con la distancia mínima `tamano/4`, se relaja la
distancia en pasos (`/4 → /5 → /6 → 2`) antes de lanzar `MAPA_SIN_POSICIONES`. Hoy ese
error se dispara demasiado fácil con 500 intentos ciegos.

### Impacto en tests

Los tests actuales de `generarMapa` afirman propiedades del algoritmo viejo (tope de
15% de agua, distribución uniforme de terreno) y van a fallar. Se reescriben para
verificar las propiedades nuevas, que son más fuertes:

- Determinismo: misma semilla y tamaño producen mapas idénticos.
- Proporción de agua dentro del rango esperado.
- La masa de tierra principal es un único componente conectado.
- Todas las capitales caen dentro de la masa principal.
- Los yacimientos son contiguos y coherentes con el terreno.
- El tile conserva su forma exacta.

---

## Sección 2 — Guerra jugable

Solo frontend. `reclutar`, `moverEjercito` y `atacar` ya se enrutan por
`POST /api/map/:id/accion` (`MapGameService._accion`, con `atacar` tomando el rng
namespaced `combate:<semilla>:<turno>:<n>`).

### Selección y movimiento

Estado nuevo `seleccion` en `MapSession.vue`:

- Click en casilla propia con ejército, siendo tu turno → queda seleccionada.
- `MapCanvas.vue` (sección 4) recibe la lista de casillas alcanzables (adyacentes con
  distancia Manhattan 1, no agua, con movimiento restante) y las pinta resaltadas en la
  capa de superposición.
- Click en alcanzable vacía → acción `moverEjercito {desde, hasta}`.
- Click en alcanzable con ejército o ciudad enemiga → diálogo de confirmación que
  muestra atacante contra defensor con los modificadores visibles (bono de terreno,
  bono de ciudad) → acción `atacar {desde, hasta}`.
- Click fuera o tecla `Escape` → deselecciona.

### Reclutamiento

El menú que hoy se abre al clickear una ciudad propia gana una segunda sección con las
cinco unidades de `UNIDADES`, mostrando ataque, defensa, movimiento y costo.
`cavalry` y `catapult` aparecen deshabilitadas con el motivo visible ("requiere
cuartel"), igual que cualquier unidad impagable. El objetivo es que el backend nunca
devuelva un error que la interfaz podía haber anticipado.

### Diálogo reutilizable

Se introduce un componente de diálogo simple y se reemplaza con él el `window.prompt`
del nombre de ciudad, que es lo que hoy más se siente prototipo. Lo usan también la
confirmación de ataque y el menú de ciudad.

---

## Sección 3 — Feedback de ronda sin depender de la API key

### Narrador local

`backend/src/domain/mapa/narradorLocal.js`: función pura
`narrarRonda(eventos, jugadores) → string`. Sin I/O, testeable como cualquier regla.

Agrupa los eventos por tipo y los redacta en español con plantillas y variación
determinista (derivada de la ronda, no de `Math.random`), nombrando a los jugadores:
fundaciones, construcciones, reclutamientos, combates y su desenlace, ciudades
capturadas, jugadores eliminados. Si una ronda no tuvo eventos relevantes, devuelve una
línea breve de transición en vez de cadena vacía.

### Cableado

En `backend/src/server-dynamic.js`, el narrador inyectado en `MapGameService` pasa a ser
un envoltorio: intenta `narrarRondaMapa` (Gemini) y, si devuelve `null` (sin API key) o
falla, cae a `narrarRonda` local. Una sola voz por ronda. `MapGameService` ya garantiza
que un narrador que falla no rompe la partida; eso no cambia.

### Camino de lectura

Hoy la narrativa se escribe y nunca se lee. Se agrega:

- Un método de lectura en `MapGameRepo` que devuelve las últimas N rondas con narrativa.
- Un campo `narrativas` en la vista del jugador (`vistaJugador`), con `{ronda, texto}`.
- `MapRoundLog.vue`: panel lateral con el historial, con la ronda más reciente
  destacada al llegar por socket.

La narrativa es información pública de la partida: no revela nada que la niebla de
guerra deba ocultar, porque describe hechos ya ocurridos de jugadores nombrados. No
requiere filtrado por jugador.

### Cierre de partida

`MapVictory.vue`: cuando el estado pasa a terminado, cubre la pantalla con el ganador,
el tipo de victoria (dominación o último en pie) y un resumen. Hoy la partida
simplemente deja de responder a las acciones sin explicar por qué.

---

## Sección 4 — Capa visual

El mapa hoy es una grilla de `div`s de color plano. El objetivo no es un juego
comercial, pero sí que se distingan a simple vista el terreno, las ciudades y los
ejércitos, y que no parezca un dibujo.

### Por qué PixiJS y no Phaser

Toda la lógica vive en el backend: reglas puras, event sourcing, servidor autoritativo.
No hay físicas, colisiones ni bucle de juego en el cliente. Phaser es un motor completo
cuyo valor está justo en lo que este proyecto no usa, y además compite con Vue por el
control del DOM. Lo que hace falta es un renderizador que dibuje sprites a partir de un
estado y reporte clicks: eso es PixiJS.

### Arte

Sprites CC0 de Kenney: [Medieval RTS](https://kenney.nl/assets/medieval-rts) (estructuras,
unidades y tiles) y [Tower Defense Top-Down](https://kenney.nl/assets/tower-defense-top-down).
CC0 permite uso comercial sin atribución y permite redistribuir, así que los PNG se
versionan en el repo bajo `frontend/public/assets/mapa/`. Se incluye igual un
`CREDITS.md` con la fuente, por cortesía.

Mapeo de sprites: uno por cada valor de `TERRENOS` (plains, forest, mountains, desert,
water, hills), uno de ciudad con variante por nivel, y uno por cada unidad de `UNIDADES`
(warrior, archer, spearman, cavalry, catapult). El color del jugador se aplica como
tinte sobre el sprite de ciudad y unidad, para que los bandos se distingan sin necesitar
cinco juegos de arte.

### Componente

`MapCanvas.vue` reemplaza a `MapGrid.vue` y `MapTile.vue`, que se eliminan. Mantiene el
mismo contrato hacia afuera que ya usa `MapSession.vue`: recibe la vista del jugador y
emite `click-tile` con `{x, y}`. Toda la integración con Pixi queda encerrada ahí; el
resto del frontend no sabe que existe un canvas.

Capas de dibujo, de abajo hacia arriba:

1. **Terreno** — un sprite por casilla. Es estático entre turnos, así que se cachea como
   textura y solo se reconstruye cuando cambia el mapa.
2. **Territorio** — tinte suave del color del dueño sobre las casillas reclamadas.
3. **Ciudades y ejércitos** — sprites tinteados por jugador, con una barra de salud sobre
   el ejército cuando está dañado.
4. **Superposición de interacción** — casilla seleccionada, casillas alcanzables, casilla
   bajo el cursor.
5. **Niebla de guerra** — velo oscuro sobre las casillas no descubiertas, reemplazando el
   negro plano actual.

### Cámara

Zoom con la rueda del mouse acotado entre límites sensatos, paneo arrastrando sobre una
zona vacía, y encuadre inicial centrado en la capital propia. Es la razón principal para
usar canvas: con `tamanoMapa` de hasta 60 el mapa no entra en pantalla y hoy no hay forma
de recorrerlo.

### Animaciones

Deliberadamente pocas y cortas, para dar sensación de vida sin entorpecer el turno:
desplazamiento del ejército entre casillas al mover, sacudida y destello en el combate,
y aparición de la ciudad al fundarse. Se disparan comparando el estado nuevo contra el
anterior, que es lo que `MapSession` ya recibe por socket.

### Rendimiento

El peor caso es 60x60 = 3600 casillas. Pixi dibuja eso sin problema con la capa de
terreno cacheada. Si aparece un cuello de botella, la salida conocida es descartar del
dibujado lo que queda fuera de cámara.

---

## Verificación

**Backend**, tests automatizados en `backend/test/mapa/` siguiendo la convención
existente (18 archivos, ~168 casos):

- `generarMapa`: reescritura completa según las propiedades listadas en la sección 1.
- `narradorLocal`: cobertura por tipo de evento, determinismo, ronda vacía.
- Vista: el campo `narrativas` aparece y respeta el límite de rondas.
- Repo: el método de lectura de narrativas.

**Frontend**, verificación manual en navegador por task, que es la convención del
proyecto (no hay tests de frontend en ningún modo). Para el canvas eso incluye revisar
con dos navegadores en paralelo que los bandos se distingan por color, que la niebla
oculte lo que debe, y que zoom y paneo respondan en un mapa grande.

**Deuda conocida**: `docs/modo-mapa-deuda-conocida.md` documenta un problema con
`better-sqlite3` y lockfiles contradictorios que puede impedir ejecutar vitest. Si
aparece al arrancar, se destraba antes de escribir tests: sin poder correr la suite no
hay verificación posible.

**Entorno**: `npm` está roto en esta máquina. Usar `yarn` para todo
(`yarn dev`, `yarn test`, `yarn lint`, `yarn build`).

## Orden sugerido de implementación

1. Sección 1 (backend aislado, tests primero, no toca la interfaz).
2. Sección 3 (backend del narrador y la lectura, después la interfaz).
3. Sección 4 (el canvas con terreno, ciudades y ejércitos, sin interacción militar
   todavía: reemplaza la grilla manteniendo lo que hoy ya se puede hacer).
4. Sección 2 (la guerra, encima del canvas ya funcionando; se beneficia de que existan
   el diálogo reutilizable, el log para ver los resultados de combate y las capas de
   superposición donde resaltar las casillas alcanzables).

El orden importa: la sección 4 se hace antes que la 2 para no construir el resaltado de
casillas y la selección dos veces, una en divs y otra en canvas.
