import { UMBRAL_AVISO_DOMINACION } from '../constantes.js';

const clave = (x, y) => `${x},${y}`;
const VECINOS = [[0, -1], [0, 1], [-1, 0], [1, 0]];

/**
 * La tierra que cuenta para la dominacion: TODA la tierra del mapa.
 *
 * El agua nunca se cuenta (no es de nadie, e incluirla ataria el umbral real a
 * cuanto oceano genero la semilla).
 *
 * Esto era mas complicado hasta que existio el transporte. Antes se contaban
 * solo las islas con al menos una ciudad, con este argumento: "no hay
 * movimiento naval, asi que una isla sin ciudades es tierra que NADIE va a
 * pisar en toda la partida, y contarla puede volver la victoria imposible"
 * (medido en su momento: una semilla partida en dos islas donde la jugable era
 * el 55.2% del total, o sea que ni conquistando hasta la ultima casilla se
 * llegaba al 60%).
 *
 * Ese argumento se cayo entero: con transportes, cualquier isla es alcanzable,
 * asi que excluirla seria regalar territorio que si se puede conquistar. La
 * complejidad desaparecio con la razon que la justificaba.
 *
 * Consecuencia de balance, anotada a proposito: el denominador CRECE en los
 * mapas que tienen islas, asi que llegar al 60% pasa a costar mas que antes.
 */
export function tierraAlcanzable(estado) {
  return estado.mapa.filter(t => t.terreno !== 'water');
}

// Cuanto del mundo controla un jugador. Exportada para que la vista pueda
// MOSTRAR el progreso hacia la victoria sin duplicar la formula: el numero que
// ve el jugador sale del mismo calculo que despues decide la partida (ver
// reglas/turnos.js#evaluarVictoria). Mismo patron que producirParaJugador.
export function controlTerritorial(estado, jugadorId) {
  const tierra = tierraAlcanzable(estado);
  const propios = tierra.filter(t => t.dueno === jugadorId).length;
  return {
    tiles: propios,
    totalTierra: tierra.length,
    porcentaje: tierra.length > 0 ? propios / tierra.length : 0,
  };
}

// Rivales que ya controlan una porcion alarmante del mundo. Devuelve el CUANTO,
// nunca el DONDE: publicar sus tiles filtraria el mapa que el jugador todavia no
// exploro, que es justamente lo que la niebla existe para evitar. Saber que
// alguien se esta volviendo enorme es tension; saber donde estan sus casillas es
// hacer trampa.
export function rivalesDominantes(estado, jugadorId) {
  return estado.jugadores
    .filter(j => j.id !== jugadorId && j.activo)
    .map(j => ({
      id: j.id,
      nombre: j.nombre,
      civilizacion: j.civilizacion,
      porcentaje: controlTerritorial(estado, j.id).porcentaje,
    }))
    .filter(j => j.porcentaje >= UMBRAL_AVISO_DOMINACION);
}
