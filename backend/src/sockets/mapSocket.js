/**
 * Handlers de socket.io del modo mapa. Separados de `server-dynamic.js` (que
 * no es testeable de forma aislada: arranca DB, IA, etc.).
 *
 * El jugadorId de un jugador es visible para el resto de los jugadores de la
 * partida (vistaJugador lo expone). Sin verificar el token, cualquiera que lo
 * conociera podia unirse a la sala privada de otro jugador y ver su vista en
 * vivo (niebla, recursos, eventos). map:join exige el token de sesion emitido
 * una unica vez por MapGameService.unirse.
 *
 * `ack`, si el cliente lo pasa, recibe `true`/`false` segun si la sala se unio.
 * Es opcional: un cliente que no lo pase sigue funcionando igual, solo que sin
 * forma de saber si el join tuvo exito (asi era el comportamiento antes de este
 * cambio).
 */
export function registrarMapSocket(socket, io, mapGameService) {
  socket.on('map:join', async (id, jugadorId, token, ack) => {
    if (typeof id !== 'string' || !id || typeof jugadorId !== 'string' || !jugadorId) {
      if (typeof ack === 'function') ack(false);
      return;
    }
    try {
      await mapGameService.verificarToken(id, jugadorId, token);
    } catch {
      if (typeof ack === 'function') ack(false);
      return;
    }
    socket.join(`map:${id}:${jugadorId}`);
    if (typeof ack === 'function') ack(true);
  });

  socket.on('map:leave', (id, jugadorId) => {
    if (typeof id === 'string' && id && typeof jugadorId === 'string' && jugadorId) {
      socket.leave(`map:${id}:${jugadorId}`);
    }
  });
}
