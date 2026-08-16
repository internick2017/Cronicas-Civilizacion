import { jugadorPorId } from '../MapGame.js';
import { ReglaError } from '../errores.js';
import { producirParaJugador } from './turnos.js';

function vistaTile(tile, jugadorId) {
  if (!tile.descubiertoPor.includes(jugadorId)) {
    return { x: tile.x, y: tile.y, descubierto: false };
  }
  const { descubiertoPor: _descubiertoPor, ...resto } = structuredClone(tile);
  return { ...resto, descubierto: true };
}

function vistaJugadorPublica(jugador, jugadorId, estado) {
  const { id, nombre, civilizacion, activo, esBot } = jugador;
  if (jugador.id === jugadorId) {
    return {
      id, nombre, civilizacion, activo, esBot: Boolean(esBot),
      recursos: { ...jugador.recursos },
      rasgos: [...(jugador.rasgos ?? [])],
      // Cuanto va a rendir cada recurso al cerrar el turno. Sin esto el
      // jugador no puede planificar: no hay forma de saber si juntar para una
      // ciudad le lleva dos turnos o quince. Es informacion privada, va junto
      // a los recursos y por el mismo motivo.
      produccion: producirParaJugador(estado, jugador.id),
    };
  }
  // esBot no es informacion sensible (a diferencia de recursos/rasgos): se
  // muestra siempre para que el frontend pueda marcar "🤖" al rival.
  return { id, nombre, civilizacion, activo, esBot: Boolean(esBot) };
}

export function vistaJugador(estado, jugadorId) {
  if (!jugadorPorId(estado, jugadorId)) {
    throw new ReglaError('JUGADOR_DESCONOCIDO', `Jugador desconocido: ${jugadorId}`);
  }
  return {
    id: estado.id,
    nombre: estado.nombre,
    estado: estado.estado,
    versionEsquema: estado.versionEsquema,
    turno: estado.turno,
    indiceJugadorActual: estado.indiceJugadorActual,
    config: structuredClone(estado.config),
    ganador: estado.ganador,
    jugadores: estado.jugadores.map(j => vistaJugadorPublica(j, jugadorId, estado)),
    mapa: estado.mapa.map(t => vistaTile(t, jugadorId)),
  };
}
