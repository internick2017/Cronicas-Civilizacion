import { jugadorPorId } from '../MapGame.js';
import { ReglaError } from '../errores.js';

function vistaTile(tile, jugadorId) {
  if (!tile.descubiertoPor.includes(jugadorId)) {
    return { x: tile.x, y: tile.y, descubierto: false };
  }
  const { descubiertoPor: _descubiertoPor, ...resto } = structuredClone(tile);
  return { ...resto, descubierto: true };
}

function vistaJugadorPublica(jugador, jugadorId) {
  const { id, nombre, civilizacion, activo } = jugador;
  if (jugador.id === jugadorId) {
    return { id, nombre, civilizacion, activo, recursos: { ...jugador.recursos } };
  }
  return { id, nombre, civilizacion, activo };
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
    semilla: estado.semilla,
    turno: estado.turno,
    indiceJugadorActual: estado.indiceJugadorActual,
    config: { ...estado.config },
    ganador: estado.ganador,
    jugadores: estado.jugadores.map(j => vistaJugadorPublica(j, jugadorId)),
    mapa: estado.mapa.map(t => vistaTile(t, jugadorId)),
  };
}
