# Sistema de diseño: Crónicas de Civilización

Fuente de verdad visual del **modo mapa**. El vocabulario del juego está en [CONTEXT.md](CONTEXT.md).
El modo narrativo y el menú inicial (`ModeSelect.vue`) quedan fuera de este sistema.

## Producto

- **Qué es:** estrategia por turnos sobre un tablero de casillas, al estilo Civilization.
- **Para quién:** una familia que juega por la red de casa, sobre todo en celular y tablet.
- **Tipo:** juego web con Vue y PixiJS.
- **Lo que tiene que quedar:** el mapa es el juego. Se reconoce de un vistazo de quién es cada cosa.

## Principios

Se aplican a todos los temas y deciden los empates.

1. **El mapa manda.** Todo lo que no sea mapa compite por su espacio. Un panel nuevo tiene que justificar el alto que le quita.
2. **Los bandos se leen sin pensar.** El color dice de quién es una pieza. La forma dice qué raza es.
3. **Nada tapa un dato.** Ni una insignia, ni un panel, ni un ciudadano caminando pueden cubrir un número.
4. **Se aparece solo si hay algo que decir.** Un panel vacío no se muestra.
5. **Cada botón deshabilitado dice por qué,** con el dato concreto: "falta: 10 de oro", no "sin recursos".
6. **Pensado para el dedo.** Primero funciona en un celular, después se ordena en escritorio.

## Temas

Cada jugador elige el suyo y queda guardado en su dispositivo. No cambia reglas ni lo que ven los demás.

Los temas comparten disposición a propósito: cambian colores, letras, bordes y la paleta del mapa. Tres
disposiciones serían tres pantallas para arreglar con cada cambio.

| Tema | Dirección | Títulos | Texto | `--t-radio` |
|---|---|---|---|---|
| Sala de mando (por defecto) | Utilitaria, oscura y técnica | IBM Plex Mono | IBM Plex Sans | 0,5 |
| Mesa de campaña | Pergamino y tinta, mapa antiguo | Cinzel | EB Garamond | 0,6 |
| Juego de mesa | Juguete, colores vivos y bordes gruesos | Baloo 2 | Nunito | 2 |

Sala de mando es el tema por defecto por ser el más cercano a la apariencia original del juego.

## Color

Los valores viven en [`frontend/src/mapa/temas.css`](frontend/src/mapa/temas.css) como `R G B`, para escribir
`rgb(var(--t-tinta) / 0.1)`. Esa capa translúcida es clara en un tema oscuro y tinta sobre el pergamino,
sin reglas por tema en cada componente.

| Variable | Uso | Sala de mando | Mesa de campaña | Juego de mesa |
|---|---|---|---|---|
| `--t-fondo` | Fondo de pantalla | `#0a141c` | `#e9dcbf` | `#6fd0f2` |
| `--t-panel` | Paneles y diálogos | `#0f1f2a` | `#efe4c9` | `#ffffff` |
| `--t-control` | Campos de formulario | `#182e3c` | `#f6eedb` | `#f0f6fc` |
| `--t-texto` | Texto principal | `#d7e3ea` | `#2b2015` | `#26303f` |
| `--t-cta` | Acción principal | `#ffb627` | `#7c2d1e` | `#15803d` |
| `--t-exito` | Ganancia, elegido | `#4fd1a5` | `#2f6223` | `#15803d` |
| `--t-aviso` | Títulos de acento, avisos | `#ffb627` | `#7a5414` | `#a16207` |
| `--t-peligro` | Daño, riesgo | `#f0683a` | `#7c2d1e` | `#c81e1e` |
| `--t-info` | Información | `#33d1e0` | `#2d4a6b` | `#1d4ed8` |

La lista completa está en `temas.css`. **Un color nuevo se define en los tres temas**, o se rompe el que falte.

Reglas:

- En un componente no se escribe un color fijo: se usa una variable `--t-*`.
- El texto tiene contraste de 4,5:1 como mínimo en los tres temas. `backend/test/mapa/temas.contraste.test.js` lo mide: una pareja nueva de texto y fondo se agrega ahí.
- **Sobre un fondo de color nunca va `--t-texto`.** Sobre `--t-cta` y `--t-alerta` va `--t-sobre-cta`; sobre `--t-exito-fuerte` y `--t-peligro-fuerte` va `--t-sobre`.
- El botón principal de un diálogo usa `--t-cta`; el que no se puede deshacer, `--t-peligro-fuerte`.
- Lo apagado es el botón, no el motivo: el texto de por qué está deshabilitado va a opacidad plena.

### Colores del mapa

PixiJS no lee CSS: la paleta del mapa vive en [`frontend/src/mapa/temas.js`](frontend/src/mapa/temas.js).
Cada tema define fondo, niebla, costa, ribera y tinte de terreno.

- El tinte multiplica el sprite, así que solo puede oscurecer.
- **Mar, río y montaña se tienen que distinguir en todos los temas.** La forma pesa más que el color: por eso el río gira el sprite.
- **Lo no descubierto no puede parecer agua.** En Juego de mesa, un azul pálido se leía como mar.
- **Los colores de bando no cambian con el tema y no llevan azul ni turquesa** (`COLORES_JUGADOR` en `sprites.js`): un jugador azul pintaba su territorio del color del mar.

## Tipografía

Las letras cargan desde Google Fonts en `index.html`. Sin internet, cada tema cae a una alternativa del sistema.

| Nivel | Tamaño | Uso |
|---|---|---|
| Título de pantalla | `2rem` | "Modo mapa" |
| Título de panel | `1rem` | Crónica, Mis ciudades |
| Texto | `0.85rem` | Paneles, botones, listas |
| Detalle | `0.75rem` | Motivos, bonos, etiquetas. Es el mínimo: 12 px |

Los títulos usan `--t-letra-titulo` y el resto `--t-letra`. No se fijan fuentes en un componente.

## Espaciado

- **Base:** 4 px.
- **Densidad:** compacta, porque cada píxel de panel se lo saca al mapa.
- **Escala para código nuevo:** `0.25rem`, `0.5rem`, `0.75rem`, `1rem`, `1.5rem`.

## Disposición

- **Corte de celular:** `max-width: 640px`.
- **Área táctil:** 44 px de alto como mínimo en todo lo que se toca. En celular y tablet también de ancho.
- **Partida:** ocupa la pantalla exacta y no hace scroll; el mapa se queda con el alto que sobra.
- **Escritorio:** panel en dos columnas, fila de botones arriba del mapa.
- **Celular:** panel compacto arriba, fila de iconos abajo al alcance del pulgar, y los jugadores plegados.
- **Paneles flotantes:** van dentro de `.lienzo`, sobre el mapa. Nunca sobre los botones.
- **Radios:** se escriben `calc(var(--t-radio) * 6px)`, con 6, 8 o 12 px como base.

## Movimiento

Mínimo y funcional. Un juego por turnos no necesita coreografía, y estas PC y celulares no sobran.

- Barras de progreso: transición de `0.4s`.
- En el mapa: destello al recibir daño y ciudadanos caminando, que solo se dibujan con zoom.

## Deuda conocida

- Los componentes viejos todavía usan tamaños sueltos (`0.8rem`, `0.72rem`, `0.78rem`). No agregar más.
- Un `.tamano-numero` del lobby mide menos de 44 px.
- `border-radius` y letras de los temas no se aplican al menú inicial.

## Decisiones

| Fecha | Decisión | Por qué |
|---|---|---|
| 2026-10-30 | Tres temas elegibles en vez de uno | Nick quiso tener las tres direcciones de la exploración y que elija cada jugador |
| 2026-10-30 | Los temas comparten disposición | Evita mantener tres pantallas; se puede sumar una disposición propia más adelante |
| 2026-10-30 | Sala de mando por defecto | Es la más cercana a como se veía el juego |
| 2026-10-30 | Variables `R G B` en vez de colores completos | Una sola regla translúcida sirve en temas claros y oscuros |
| 2026-10-30 | Celular con iconos sin texto | Entran todos en una fila de 44 px y el mapa conserva el alto |
| 2026-10-30 | Una insignia por casilla | La guarnición es del dueño de la ciudad; dos insignias tapaban la vida del ejército |
| 2026-08-28 | Colores de bando sin azul ni turquesa | El territorio de un jugador se confundía con el mar |
