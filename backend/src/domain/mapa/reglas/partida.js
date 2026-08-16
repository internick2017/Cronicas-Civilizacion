import { posicionesIniciales } from '../generarMapa.js';
import { crearRng } from '../rng.js';
import { jugadorPorId } from '../MapGame.js';
import { ReglaError } from '../errores.js';
import { evento, radio1 } from './comun.js';
import { MIN_JUGADORES } from '../constantes.js';

// esBot marca al jugador manejado por la IA (ver domain/mapa/ia.js). Un
// jugador asi no tiene token de sesion ni pasa por el endpoint HTTP: lo agrega
// el propio servicio al crear una partida "contra la maquina" (ver
// MapGameService#crearPartida).
export function unirse(estado, { id, nombre, civilizacion, esBot = false }) {
  if (estado.estado !== 'esperando') throw new ReglaError('PARTIDA_YA_INICIADA', 'La partida ya inició');
  if (estado.jugadores.length >= estado.config.maxJugadores) throw new ReglaError('PARTIDA_LLENA', 'La partida está llena');
  if (jugadorPorId(estado, id)) throw new ReglaError('JUGADOR_DUPLICADO', 'Ese jugador ya está en la partida');
  return [evento('JugadorUnido', estado, null, { id, nombre, civilizacion, esBot })];
}

export function iniciar(estado) {
  if (estado.estado !== 'esperando') throw new ReglaError('PARTIDA_YA_INICIADA', 'La partida ya inició');
  if (estado.jugadores.length < MIN_JUGADORES) throw new ReglaError('JUGADORES_INSUFICIENTES', `Se necesitan al menos ${MIN_JUGADORES} jugadores`);
  const rng = crearRng(`inicio:${estado.semilla}`);
  const pos = posicionesIniciales(estado.mapa, estado.config.tamanoMapa, estado.jugadores.length, rng);
  const eventos = [{ tipo: 'PartidaIniciada', turno: 1, jugadorId: null, datos: {} }];
  estado.jugadores.forEach((jug, i) => {
    const { x, y } = pos[i];
    eventos.push(
      { tipo: 'CiudadFundada', turno: 1, jugadorId: jug.id, datos: { x, y, nombre: `${jug.civilizacion} Capital` } },
      { tipo: 'TerritorioDescubierto', turno: 1, jugadorId: jug.id, datos: { tiles: radio1(x, y) } },
    );
  });
  return eventos;
}
