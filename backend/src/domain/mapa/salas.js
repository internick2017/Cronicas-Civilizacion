// Una sala de espera que nadie toca hace un dia esta abandonada: alguien creo
// la partida y nunca la inicio. No se ofrece mas en el lobby (antes quedaban
// ahi para siempre y la lista se llenaba de partidas muertas). No se borra
// nada: quien tenga el codigo todavia puede entrar.
const HORAS_SALA_VIGENTE = 24;

// SQLite guarda CURRENT_TIMESTAMP como 'YYYY-MM-DD HH:MM:SS' en UTC, sin zona;
// Postgres devuelve un Date.
function aFecha(valor) {
  if (valor instanceof Date) return valor;
  if (typeof valor !== 'string') return null;
  const fecha = new Date(valor.includes('T') ? valor : `${valor.replace(' ', 'T')}Z`);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

export function esSalaAbandonada({ estado, actualizado }, ahora = new Date()) {
  if (estado !== 'esperando') return false;
  const fecha = aFecha(actualizado);
  // Sin fecha legible no se esconde nada: mejor una sala de mas que una de menos.
  if (!fecha) return false;
  return ahora.getTime() - fecha.getTime() > HORAS_SALA_VIGENTE * 60 * 60 * 1000;
}
