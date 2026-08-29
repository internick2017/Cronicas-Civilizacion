# El mar y el río son terrenos distintos

Hasta ahora `water` era un solo terreno que cubría dos cosas que no se parecen: el océano, que
rodea el mapa, y los ríos de una casilla de ancho que el generador talla tierra adentro. Con la
llegada de las unidades navales esa unión se vuelve insostenible, porque un buque que puede entrar
a cualquier `water` navega hasta el centro de un continente por un arroyo. Se parte en dos
terrenos: **mar**, que se navega y no se camina, y **río**, que se camina (vadeándolo, con
penalidad de defensa) y no se navega.

## Considered Options

- **Un campo `navegable` sobre la casilla de agua.** Rechazado: en cuanto el río se vadea deja de
  ser agua en todo salvo el nombre, y "agua que se camina" es una contradicción que iba a
  reaparecer en cada regla.
- **Deducir "es mar" por conectividad al océano, sin dato guardado.** Rechazado: mete lógica de
  dominio en quien la consulta, y la respuesta depende del recorrido en vez de ser un hecho de la
  casilla.

## Consequences

- Los ocho lugares que preguntan `terreno !== 'water'` (fundar, mover, dominación, `masaPrincipal`
  y cinco brújulas de la IA) pasan a tratar el río como tierra **sin tocarlos**, porque
  `'river' !== 'water'` es verdadero. Eso es el motivo principal de haber elegido un terreno nuevo
  en vez de una bandera: la semántica correcta cae sola en todos ellos.
- **Cambia el balance y hay que medirlo de nuevo.** El río entra al denominador de la dominación,
  del que hoy está excluido por ser agua, y deja de partir el continente en dos, así que la
  conectividad del mapa aumenta. Los números medidos hasta hoy (difícil gana en 31 a 43 turnos,
  20 de 20 partidas terminan) dejan de ser comparables hasta volver a correrlos con semillas
  frescas.

  Primera medición concreta, al implementarlo: contra un humano totalmente pasivo, las partidas
  que la máquina cierra antes de la ronda 8 pasaron de **3 de 200 a 6 de 200**. Es el efecto
  esperado (mapa más conectado, la máquina llega antes), y de paso destapó que el test
  `mapGameService.contraIA` afirmaba algo que nunca fue cierto: que la partida no puede terminar
  en 8 rondas. Fallaba 1 de cada 60 corridas desde antes de esta épica.

- **Se descubrió, al separarlos, que el río casi no existía.** `trazarRios` gastaba sus intentos
  en vez de reintentarlos, y como el nacimiento exige terreno alto (cuantil 0.77), 8 de cada 10
  sorteos se perdían. Medido sobre 40 semillas por tamaño: en tamaño 30 solo 20 de 40 mapas tenían
  algún río, con 2 casillas de río de promedio sobre 900. Se corrigió con el mismo patrón de
  "mínimo garantizado con reintentos" que `sembrarRecursos` ya usaba en el mismo archivo. Después
  del arreglo: 40 de 40 semillas con río, entre el 1% y el 2% del mapa.
- Las partidas ya guardadas conservan sus ríos como mar y se terminan con las reglas viejas. No hay
  migración: reconstruir qué casillas eran río exigiría rehacer el trazado hacia atrás sin la
  elevación original, que no se guarda.
