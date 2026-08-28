import { UMBRAL_AVISO_DOMINACION } from '../constantes.js';

// El territorio se mide SIEMPRE sobre tierra: el agua no es propiedad de nadie,
// asi que incluirla haria que el umbral real dependa de cuanto oceano genero la
// semilla (una partida con mucho mar seria mucho mas facil de dominar).
function tilesDeTierra(estado) {
  return estado.mapa.filter(t => t.terreno !== 'water');
}

// Cuanto del mundo controla un jugador. Exportada para que la vista pueda
// MOSTRAR el progreso hacia la victoria sin duplicar la formula: el numero que
// ve el jugador sale del mismo calculo que despues decide la partida (ver
// reglas/turnos.js#evaluarVictoria). Mismo patron que producirParaJugador.
export function controlTerritorial(estado, jugadorId) {
  const tierra = tilesDeTierra(estado);
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
