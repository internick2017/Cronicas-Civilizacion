import { producirParaJugador } from './turnos.js';
import { controlTerritorial } from './dominacion.js';
import { mecanicaActiva } from './modo.js';

// Cuanto pesa cada jugador en la partida. Es solo LECTURA: no cambia ninguna regla.
//
//   economia        = lo que produce por ronda, sumando todos los recursos
//   infraestructura = edificios construidos + nivel de cada ciudad
//   fortificaciones = nivel de cada ciudad + cuarteles (lo que las hace dificiles de tomar)
//   territorio      = casillas de tierra que controla
//   poder           = economia + infraestructura + territorio
//   eficiencia      = (economia + infraestructura) / territorio
//
// La eficiencia NO es el poder: dividir por el territorio premia al pais chico (2 casillas
// con algo de economia le ganaria a un imperio), asi que va aparte como segunda columna.
const redondear1 = (n) => Math.round(n * 10) / 10;

export function poderDe(estado, jugadorId) {
  const ciudades = estado.mapa.filter(t => t.ciudad && t.dueno === jugadorId);
  const economia = Object.values(producirParaJugador(estado, jugadorId)).reduce((s, n) => s + n, 0);
  const edificios = ciudades.reduce((s, t) => s + t.ciudad.edificios.length, 0);
  const niveles = ciudades.reduce((s, t) => s + (t.ciudad.nivel ?? 1), 0);
  const cuarteles = ciudades.filter(t => t.ciudad.edificios.includes('barracks')).length;
  const { tiles: territorio } = controlTerritorial(estado, jugadorId);
  const infraestructura = edificios + niveles;
  return {
    id: jugadorId,
    economia,
    infraestructura,
    fortificaciones: niveles + cuarteles,
    territorio,
    poder: economia + infraestructura + territorio,
    eficiencia: territorio > 0 ? redondear1((economia + infraestructura) / territorio) : 0,
  };
}

// La tabla que ve `jugadorId`. Con niebla de guerra mostrar la economia y el territorio de
// los rivales delataria lo que no ha descubierto (misma razon que dominacion.js), asi que
// solo ve la suya.
export function clasificacionPara(estado, jugadorId) {
  const ids = mecanicaActiva(estado, 'niebla')
    ? [jugadorId]
    : estado.jugadores.map(j => j.id);
  return ids.map(id => poderDe(estado, id)).sort((a, b) => b.poder - a.poder);
}
