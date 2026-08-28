import { evento, radio1 } from './comun.js';
import { tileEn } from '../MapGame.js';

/**
 * Presion de frontera: al cerrar la ronda, cada casilla que un rival te tomo
 * pegada a una de tus ciudades, y que NO esta ocupando con un ejercito, vuelve
 * a vos.
 *
 * Por que existe: desde que la frontera se volvio permeable, cada casilla propia
 * sin un ejercito encima es tomable gratis. Jugando una partida real el
 * territorio propio bajo del 30% al 18% en cinco turnos SIN perder una sola
 * ciudad: con 3 ejercitos no se pueden custodiar 22 casillas, asi que perder
 * terreno no dependia de jugar mal sino de no poder estar en todos lados.
 *
 * La alternativa era volver intransitable el territorio cercano a una ciudad,
 * pero eso reintroduce los muros que hacian la guerra imposible. Esto no bloquea
 * a nadie: el rival puede entrar y pelear igual, pero para QUEDARSE con tu
 * tierra tiene que sostenerla, no le alcanza con pasarle por encima.
 *
 * Tres limites deliberados:
 * - Solo vuelve lo que tiene dueño RIVAL. La tierra de nadie no se absorbe: eso
 *   seria expansion gratis por tener ciudades, no defensa.
 * - Nunca vuelve una casilla con CIUDAD: las ciudades se toman peleando.
 * - Una casilla pegada a ciudades de los dos bandos queda como esta, para que no
 *   cambie de manos todas las rondas.
 */
export function recuperarFronteras(estado) {
  const porJugador = new Map();

  for (const tile of estado.mapa) {
    if (!tile.ciudad || !tile.dueno) continue;
    const dueñoCiudad = tile.dueno;

    for (const { x, y } of radio1(tile.x, tile.y)) {
      const vecino = tileEn(estado, x, y);
      if (!vecino || vecino === tile) continue;
      if (!vecino.dueno || vecino.dueno === dueñoCiudad) continue; // libre o ya mia
      if (vecino.ciudad) continue;                                  // se toma peleando
      // Se sostiene si su dueño tiene tropa ENCIMA o AL LADO: una fuerza
      // concentrada mantiene el terreno que toma, un merodeador suelto no. Sin
      // esto la regla castigaba igual a una invasion de verdad que a una
      // correria, y la dificultad que ataca en serio quedaba MAS lenta que la
      // que solo coloniza (medido: dificil 37-49 turnos contra normal 33-43).
      const sostenidaPorTropa = [{ x, y }, ...radio1(x, y)].some(({ x: tx, y: ty }) => {
        const t = tileEn(estado, tx, ty);
        return t && t.ejercito && t.ejercito.dueno === vecino.dueno;
      });
      if (sostenidaPorTropa) continue;

      // Disputada: si el actual dueño tambien tiene una ciudad al lado, nadie la
      // mueve. Se mira contra el mapa, no contra lo ya acumulado, para que el
      // resultado no dependa del orden en que se recorren las casillas.
      const sostenidaPorSuDueño = radio1(x, y).some(({ x: cx, y: cy }) => {
        const c = tileEn(estado, cx, cy);
        return c && c.ciudad && c.dueno === vecino.dueno;
      });
      if (sostenidaPorSuDueño) continue;

      const tiles = porJugador.get(dueñoCiudad) ?? [];
      if (!tiles.some(t => t.x === x && t.y === y)) tiles.push({ x, y });
      porJugador.set(dueñoCiudad, tiles);
    }
  }

  return [...porJugador.entries()].map(([jugadorId, tiles]) =>
    evento('TerritorioRecuperado', estado, jugadorId, { tiles }));
}
