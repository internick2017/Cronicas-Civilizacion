# La armada hostiga, no conquista

Un buque puede atacar la costa y la costa puede atacarlo a él, pero el buque **nunca ocupa ni
captura**, porque no pisa tierra. Como las ciudades no tienen vida, vencer a una ciudad costera sin
guarnición no tenía ninguna consecuencia posible que no fuera capturarla: era una regla muerta. Se
resolvió con el **saqueo**, que le roba oro al dueño sin tomar la ciudad ni su territorio.

## Considered Options

- **Que el buque solo pueda atacar casillas con ejército.** Rechazado: dejaba inmune a la armada
  justo a la ciudad costera desguarnecida, que es el objetivo que uno esperaría que una flota
  castigue.
- **Que vencer baje el nivel de la ciudad.** Rechazado: el nivel alimenta la defensa de la ciudad y
  el costo de mejorarla, así que una ciudad hostigada se volvería cada vez más fácil de hostigar.
  Entra en espiral y no hay forma de frenarla.

## Consequences

- Los números del buque siguen a esta decisión y no al revés: pega fuerte, se muere fácil y corre
  mucho. Además el mar no da bono de defensa por terreno, así que un buque pelea siempre sin
  cobertura mientras la tropa de tierra se parapeta en montaña o bosque. Si la armada dominara la
  costa en vez de hostigarla, no habría regla que la expulsara (ver ADR 0002).
- El saqueo es un evento nuevo, y **hay que contarlo en la crónica**. Ya ocurrió una vez que lo que
  decidía la partida (la pérdida de territorio) pasara en silencio, y fue un problema real de
  experiencia de juego, no de reglas.

- **Medido al implementarlo, 20 semillas frescas de bot contra bot (`scripts/simular.js`), con y
  sin armada:** el balance no se movió (19 de 20 partidas terminan en los dos casos; 67,6 turnos
  promedio sin armada contra 63,2 con ella), y el mar se usa de verdad: 41 buques botados, y 116
  de los 716 combates fueron navales, en 10 de las 20 partidas.

  Lo que **no** funciona todavía es el saqueo: 3 saqueos en 20 partidas, y 9 de oro en total.
  La causa no es la regla sino la economía de la máquina, que gasta todo y casi nunca tiene oro
  encima: el saqueo se acota a lo que la víctima realmente tiene, así que robarle a un bot es
  robarle a alguien en cero. Contra un humano que acumula debería pesar mucho más, y eso hay que
  verificarlo jugando, no simulando. Si al jugarlo sigue siendo irrelevante, el arreglo no es
  subir el porcentaje: es que el saqueo cueste algo más que oro.
- **El puerto no se traba detrás de una tecnología**, aunque el juego ya tenga el patrón de
  desbloquear cosas así. Para tener un buque ya hacen falta dos condiciones (ciudad en la costa,
  más el puerto construido), y una tercera repetiría el error de la biblioteca, que costaba ciencia
  cuando su única fuente de ciencia era ella misma y resultó imposible de construir en toda la
  partida. El riesgo que se está evitando no es que la armada quede desbalanceada, es que no
  aparezca nunca en una partida normal.
