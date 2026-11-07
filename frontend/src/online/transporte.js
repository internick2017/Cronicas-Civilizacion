// Por donde viajan las llamadas del modo mapa. Sin transporte activo, useMapApi y
// useMapSocket hablan con el servidor (HTTP + socket.io) como siempre. Con uno activo
// (modo online entre amigos), todo va por WebRTC al navegador del anfitrion.
//
// Un transporte tiene: llamar(metodo, args), seguir(gameId, jugadorId, token, handlers),
// dejar(), cerrar() y codigo (el de la sala).
let activo = null

export const transporteActivo = () => activo

export function usarTransporte(t) {
  if (activo && activo !== t) activo.cerrar?.()
  activo = t
}
