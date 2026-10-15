# Crónicas de Civilización

Juego de dos modos: uno narrativo (historia colaborativa con un narrador) y uno de mapa
(estrategia por turnos sobre un tablero de casillas). Este glosario fija el vocabulario del
**modo mapa**, que es donde la ambigüedad de términos ya causó errores reales.

## Language

### El mundo

**Casilla**:
La unidad mínima del tablero. Tiene un terreno, y puede tener dueño, recurso, ciudad o ejército.
_Avoid_: celda, cuadro, tile, cuadrícula

**Terreno**:
Lo que una casilla *es* por naturaleza: llanura, bosque, colina, montaña, desierto, mar o río.
No cambia durante la partida.
_Avoid_: bioma, tipo de suelo

**Mar**:
El terreno de agua que se navega y no se camina. Nunca pertenece a nadie.
_Avoid_: agua, océano, water

**Río**:
El terreno de agua que se vadea y no se navega. Es tierra a todos los efectos salvo el nombre:
se camina, se posee y se funda encima.
_Avoid_: arroyo, afluente, curso de agua

**Costa**:
El límite entre una casilla de tierra y una de mar.
_Avoid_: orilla, litoral, borde

**Ciudad costera**:
Una ciudad con al menos una casilla de mar adyacente. El río no la vuelve costera.
_Avoid_: ciudad portuaria, ciudad de puerto

**Masa principal**:
La extensión de tierra contigua más grande del mapa. Es donde empiezan todos los jugadores.
_Avoid_: continente, isla mayor

**Tierra alcanzable**:
La tierra que algún jugador puede llegar a pisar en esa partida, y por lo tanto la única que
cuenta para decidir quién domina el mundo.
_Avoid_: tierra jugable, tierra útil

**Niebla**:
Lo que un jugador todavía no descubrió. Es por jugador, no del mundo.
_Avoid_: niebla de guerra, zona oscura, fog

### Quiénes juegan

**Civilización**:
El bando que conduce un jugador, humano o máquina.
_Avoid_: nación, imperio, facción

**Territorio**:
El conjunto de casillas con dueño. El mar nunca es territorio.
_Avoid_: dominio, posesiones, tierras

**Dominación**:
Controlar una porción suficiente de la tierra alcanzable, que es una de las formas de ganar.
_Avoid_: conquista, control total

### Las piezas

**Ciudad**:
La pieza que produce recursos, alberga edificios y sostiene la frontera a su alrededor. Perderlas
todas es quedar eliminado.
_Avoid_: asentamiento, poblado, urbe

**Capital**:
La ciudad que rinde y se defiende más. Es la primera que se funda hasta que el jugador la muda
(pagando oro); si se la capturan, pasa sola a su ciudad de mayor nivel.
_Avoid_: sede, ciudad principal

**Cabecera**:
La ciudad que encabeza una subdivisión del Estado federal, elegida entre las de su territorio. Las
demás ciudades que cubre rinden más y los problemas que resuelve esa subdivisión salen más baratos.
_Avoid_: capital de provincia, sede

**Ejército**:
La pieza militar que ocupa una casilla. Contiene exactamente una unidad, nunca varias.
_Avoid_: tropa, contingente, stack

**Unidad**:
El tipo de un ejército (guerrero, arquero, buque, y demás), con sus valores de ataque, defensa,
salud y movimiento.
_Avoid_: soldado, pieza, ficha

**Buque**:
La unidad que solo existe en el mar. No pisa tierra en ninguna circunstancia.
_Avoid_: barco, nave, navío, embarcación

**Transporte**:
El buque que carga unidades de tierra para cruzarlas por mar. Todavía no existe.
_Avoid_: transporte de tropas, barcaza, ferry

**Puerto**:
El edificio que habilita construir buques en una ciudad costera.
_Avoid_: astillero, dársena, muelle

**Astillero**:
El efecto del puerto que repara los buques detenidos en el mar contiguo. No es un edificio aparte.
_Avoid_: dique seco, reparación

### Lo que ocurre

**Reclamar**:
Volver propia una casilla al pisarla con un ejército. Es la forma en que se gana territorio.
_Avoid_: conquistar, tomar, ocupar

**Vadear**:
Cruzar un río a pie, quedando peor defendido mientras se está dentro.
_Avoid_: cruzar, atravesar

**Saqueo**:
Robarle oro a una ciudad venciéndola sin tomarla. Además, la ciudad saqueada no produce nada durante
unas rondas (`SAQUEO.rondasSinProduccion`); un nuevo saqueo renueva ese plazo, no lo acumula.
_Avoid_: pillaje, botín, raid

**Mandato**:
Las rondas entre dos elecciones de una república. Lo fija la partida y cada república puede cambiarlo.
_Avoid_: período, legislatura

**Acuñar**:
Crear oro de la nada a cambio de inflación: los costos suben un tanto por ciento que baja solo con
las rondas. Es distinto de la inflación que aparece como problema social en el Estado federal, aunque
las dos se multiplican.
_Avoid_: imprimir, emitir

**Crónica**:
El relato de lo que pasó en la ronda, que es lo que el jugador lee para enterarse de la partida.
_Avoid_: log, historial, registro, narración
