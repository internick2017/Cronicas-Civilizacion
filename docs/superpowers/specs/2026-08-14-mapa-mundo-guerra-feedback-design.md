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

## Objetivo

Que el modo mapa sea un juego completo y con vida **sin depender de credenciales de
Gemini**: mundo legible, guerra jugable, y devolución al jugador en cada ronda y al
final de la partida.

## Fuera de alcance

- Capa visual avanzada (iconos de terreno, zoom/pan, animaciones). Queda anotada en el
  backlog como iteración siguiente, y se beneficia de hacerse después de esta.
- Unidades navales. El mapa sigue siendo intransitable por agua.
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
- `MapGrid.vue` recibe la lista de casillas alcanzables (adyacentes con distancia
  Manhattan 1, no agua, con movimiento restante) y `MapTile.vue` las pinta con halo.
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

## Verificación

**Backend**, tests automatizados en `backend/test/mapa/` siguiendo la convención
existente (18 archivos, ~168 casos):

- `generarMapa`: reescritura completa según las propiedades listadas en la sección 1.
- `narradorLocal`: cobertura por tipo de evento, determinismo, ronda vacía.
- Vista: el campo `narrativas` aparece y respeta el límite de rondas.
- Repo: el método de lectura de narrativas.

**Frontend**, verificación manual en navegador por task, que es la convención del
proyecto (no hay tests de frontend en ningún modo).

**Deuda conocida**: `docs/modo-mapa-deuda-conocida.md` documenta un problema con
`better-sqlite3` y lockfiles contradictorios que puede impedir ejecutar vitest. Si
aparece al arrancar, se destraba antes de escribir tests: sin poder correr la suite no
hay verificación posible.

**Entorno**: `npm` está roto en esta máquina. Usar `yarn` para todo
(`yarn dev`, `yarn test`, `yarn lint`, `yarn build`).

## Orden sugerido de implementación

1. Sección 1 (backend aislado, tests primero, no toca la interfaz).
2. Sección 3 (backend del narrador y la lectura, después la interfaz).
3. Sección 2 (la más grande de interfaz; se beneficia de que ya exista el diálogo
   reutilizable y el log para ver los resultados de combate).
