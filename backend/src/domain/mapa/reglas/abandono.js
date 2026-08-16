import { jugadorPorId } from '../MapGame.js';
import { ReglaError } from '../errores.js';
import { evento } from './comun.js';
import { siguienteIndiceActivo, evaluarVictoria } from './turnos.js';

/**
 * Abandonar la partida.
 *
 * No alcanza con que el jugador cierre la pantalla: si se va sin avisar y era
 * su turno, los demas quedan esperando para siempre a alguien que no vuelve.
 * Por eso el abandono es una accion del dominio y no algo solo del frontend.
 *
 * A diferencia del resto de las acciones NO exige que sea tu turno: irse tiene
 * que poder hacerse en cualquier momento.
 */
export function abandonar(estado, jugadorId) {
  if (estado.estado !== 'jugando') {
    throw new ReglaError('PARTIDA_NO_ACTIVA', 'La partida no está activa');
  }

  const jugador = jugadorPorId(estado, jugadorId);
  if (!jugador) throw new ReglaError('JUGADOR_DESCONOCIDO', `Jugador desconocido: ${jugadorId}`);
  if (!jugador.activo) throw new ReglaError('JUGADOR_INACTIVO', 'Ya no estás en la partida');

  const eventos = [evento('JugadorEliminado', estado, jugadorId, { jugadorId })];

  const activosRestantes = estado.jugadores.filter(j => j.activo && j.id !== jugadorId);
  const eraSuTurno = estado.jugadores[estado.indiceJugadorActual]?.id === jugadorId;

  // Si se va justo cuando le tocaba, hay que pasarle el turno a otro o la
  // partida queda trabada con el turno en manos de alguien que ya no juega.
  if (eraSuTurno && activosRestantes.length > 0) {
    eventos.push(evento('TurnoAvanzado', estado, jugadorId, {
      indiceJugadorActual: siguienteIndiceActivo(estado, new Set([jugadorId])),
      turno: estado.turno,
    }));
  }

  const victoria = evaluarVictoria(estado, jugadorId, activosRestantes, estado.turno);
  if (victoria) eventos.push(victoria);

  return eventos;
}
