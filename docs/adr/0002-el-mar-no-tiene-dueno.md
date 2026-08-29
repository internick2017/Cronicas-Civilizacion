# El mar no tiene dueño

El territorio en este juego se gana caminándolo: mover un ejército a una casilla la vuelve propia.
Al agregar buques, la pregunta obvia es si navegar el mar lo reclama igual. Se decidió que **no**:
el mar nunca pertenece a nadie, ni cuenta para la victoria por dominación. Es campo de batalla, no
botín.

## Consequences

- El umbral de victoria sigue midiéndose solo sobre tierra, así que no depende de cuánto océano le
  tocó generar a la semilla. Si el mar contara, el 60% real variaría de partida en partida sin que
  nadie lo hubiera decidido, y todo el balance ya medido dejaría de valer de golpe.
- Mover un buque **no** emite el evento de reclamar territorio, aunque el resto del movimiento sea
  idéntico al de una unidad de tierra. Es la única excepción a "pisar es tomar" y hay que
  sostenerla explícitamente, porque el código que reclama se dispara cuando el dueño de la casilla
  destino no es el que se mueve, y el dueño del mar siempre es nadie.
- La regla que devuelve a una ciudad las casillas de su frontera no puede recuperar mar. Un buque
  hostigando una costa no puede ser expulsado por esa vía: hay que hundirlo.
