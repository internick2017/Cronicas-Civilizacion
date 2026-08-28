import { UMBRAL_AVISO_DOMINACION } from '../constantes.js';

const clave = (x, y) => `${x},${y}`;
const VECINOS = [[0, -1], [0, 1], [-1, 0], [1, 0]];

/**
 * La tierra que cuenta para la dominacion: solo las islas donde hay al menos
 * una ciudad.
 *
 * El agua nunca se cuenta (no es de nadie, e incluirla ataria el umbral real a
 * cuanto oceano genero la semilla). Pero ademas no alcanza con mirar "toda la
 * tierra": no hay movimiento naval, asi que una isla sin ciudades es tierra que
 * NADIE va a pisar en toda la partida, y contarla puede volver la victoria
 * imposible. Medido: en una semilla el mapa salio partido en dos islas y la
 * jugable era el 55.2% del total, o sea que ni conquistando hasta la ultima
 * casilla se llegaba al 60% y la partida no podia terminar nunca.
 *
 * El criterio es "isla con al menos una ciudad", sin mirar si su dueño sigue
 * vivo, para que el denominador sea ESTABLE: si dependiera de los jugadores
 * activos, eliminar a alguien cambiaria el denominador y el porcentaje de todos
 * saltaria de golpe sin que nadie hubiera conquistado nada.
 */
export function tierraAlcanzable(estado) {
  const porClave = new Map();
  for (const t of estado.mapa) {
    if (t.terreno !== 'water') porClave.set(clave(t.x, t.y), t);
  }
  const visitadas = new Set();
  const alcanzable = [];
  for (const [k, inicio] of porClave) {
    if (visitadas.has(k)) continue;
    // Un componente conexo entero, y recien despues se decide si cuenta.
    const isla = [];
    const pila = [inicio];
    visitadas.add(k);
    while (pila.length > 0) {
      const actual = pila.pop();
      isla.push(actual);
      for (const [dx, dy] of VECINOS) {
        const kv = clave(actual.x + dx, actual.y + dy);
        const vecino = porClave.get(kv);
        if (vecino && !visitadas.has(kv)) {
          visitadas.add(kv);
          pila.push(vecino);
        }
      }
    }
    if (isla.some(t => t.ciudad)) alcanzable.push(...isla);
  }
  // Si TODAVIA no hay ninguna ciudad en el mapa (una partida que no arranco: las
  // capitales se fundan en iniciar()), no hay isla que privilegiar y se cuenta
  // toda la tierra. Sin esto el denominador seria 0 y el porcentaje quedaria
  // indefinido antes de empezar a jugar.
  return alcanzable.length > 0 ? alcanzable : [...porClave.values()];
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
