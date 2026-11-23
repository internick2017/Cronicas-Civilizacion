// Crónica final: el relato de toda la partida, armado al terminar.
//
// El estado guarda una BITACORA compacta de los hechos que marcan una partida
// (fundaciones, capturas, caidas, alianzas, golpes). No se relee el log de
// eventos porque el modo en linea (MemoriaRepo) conserva solo las ultimas
// rondas para no engordar la copia de respaldo; la bitacora viaja en el estado
// y por eso existe igual en el servidor, en el anfitrion y en una copia.

const HECHOS = new Set([
  'CiudadFundada', 'CiudadCapturada', 'CiudadSaqueada', 'JugadorEliminado',
  'AlianzaFormada', 'AlianzaRota', 'Levantamiento',
]);
const MARAVILLAS = {
  jardines_colgantes: 'los Jardines Colgantes', coloso: 'el Coloso',
  piramide: 'la Pirámide', gran_biblioteca: 'la Gran Biblioteca',
};
const MAX_BITACORA = 400;

// Anota un evento en la bitacora si es de los que cuentan. Llamada por aplicar().
export function anotar(estado, evento) {
  const esMaravilla = evento.tipo === 'EdificioConstruido' && evento.datos?.edificio in MARAVILLAS;
  if (!HECHOS.has(evento.tipo) && !esMaravilla) return;
  const d = evento.datos || {};
  const hecho = { t: evento.turno ?? estado.turno, tipo: evento.tipo, j: evento.jugadorId ?? null };
  if (esMaravilla) hecho.edificio = evento.datos.edificio;
  if (evento.tipo === 'CiudadFundada') hecho.nombre = d.nombre ?? null;
  if (evento.tipo === 'CiudadSaqueada') hecho.victima = d.victima ?? null;
  if (evento.tipo === 'JugadorEliminado') hecho.j = d.jugadorId ?? null;
  if (evento.tipo === 'AlianzaFormada') hecho.con = d.con ?? null;
  if (evento.tipo === 'Levantamiento') hecho.clase = d.tipo ?? null;
  (estado.bitacora ??= []).push(hecho);
  // Tope: en una partida larguisima se descartan las mas viejas, que ya son historia.
  if (estado.bitacora.length > MAX_BITACORA) estado.bitacora.splice(0, estado.bitacora.length - MAX_BITACORA);
}

const MOTIVO = {
  dominacion: 'dominación',
  ultimo_en_pie: 'ser el último en pie',
  limite_rondas: 'tener más territorio al llegar al límite de rondas',
  limite_rondas_economia: 'tener la mejor economía al llegar al límite de rondas',
  limite_rondas_fortificaciones: 'tener las mejores fortificaciones al llegar al límite de rondas',
  sin_humanos: 'quedar con más territorio cuando no quedó ningún jugador humano',
};

const veces = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/**
 * Devuelve la crónica como lista de capítulos { titulo, texto }, o null si la
 * partida no terminó. Solo cuenta hechos públicos: se muestra al final, cuando
 * ya no hay nada que ocultar.
 */
export function cronicaFinal(estado) {
  if (estado.estado !== 'terminado') return null;
  const nombre = (id) => estado.jugadores.find(j => j.id === id)?.nombre ?? 'Un pueblo sin nombre';
  const bit = estado.bitacora ?? [];
  const capitulos = [];

  const fundadas = bit.filter(h => h.tipo === 'CiudadFundada');
  if (fundadas.length) {
    const porJugador = new Map();
    for (const h of fundadas) porJugador.set(h.j, (porJugador.get(h.j) ?? 0) + 1);
    const partes = [...porJugador].map(([id, n]) => `${nombre(id)} levantó ${veces(n, 'ciudad', 'ciudades')}`);
    capitulos.push({ titulo: 'Los comienzos', texto: `${partes.join('; ')}.` });
  }

  const maravillas = bit.filter(h => h.tipo === 'EdificioConstruido')
    .map(h => `En la ronda ${h.t}, ${nombre(h.j)} levantó ${MARAVILLAS[h.edificio]}.`);
  if (maravillas.length) capitulos.push({ titulo: 'Las maravillas', texto: maravillas.join(' ') });

  const guerras = bit.filter(h => h.tipo === 'CiudadCapturada' || h.tipo === 'CiudadSaqueada')
    .map(h => h.tipo === 'CiudadCapturada'
      ? `En la ronda ${h.t}, ${nombre(h.j)} tomó una ciudad.`
      : `En la ronda ${h.t}, ${nombre(h.j)} saqueó un puerto de ${nombre(h.victima)}.`);
  if (guerras.length) capitulos.push({ titulo: 'Las guerras', texto: guerras.join(' ') });

  const politica = bit.filter(h => ['AlianzaFormada', 'AlianzaRota', 'Levantamiento'].includes(h.tipo))
    .map(h => {
      if (h.tipo === 'AlianzaFormada') return `En la ronda ${h.t}, ${nombre(h.j)} y ${nombre(h.con)} sellaron una alianza.`;
      if (h.tipo === 'AlianzaRota') return `En la ronda ${h.t}, ${nombre(h.j)} rompió su alianza.`;
      return h.clase === 'revolucion'
        ? `En la ronda ${h.t}, el pueblo de ${nombre(h.j)} hizo la revolución.`
        : `En la ronda ${h.t}, hubo un golpe de Estado en ${nombre(h.j)}.`;
    });
  if (politica.length) capitulos.push({ titulo: 'Pactos y sublevaciones', texto: politica.join(' ') });

  const caidas = bit.filter(h => h.tipo === 'JugadorEliminado')
    .map(h => `${nombre(h.j)} quedó sin ciudades en la ronda ${h.t}.`);
  if (caidas.length) capitulos.push({ titulo: 'Los caídos', texto: caidas.join(' ') });

  const g = estado.ganador;
  let final;
  if (g && typeof g === 'object') {
    const ids = [g.jugadorId, ...(g.aliados ?? [])].map(nombre);
    const motivo = MOTIVO[g.tipoVictoria] ?? g.tipoVictoria ?? 'una victoria decisiva';
    final = ids.length > 1
      ? `La alianza de ${ids.join(', ')} se impuso por ${motivo}.`
      : `${ids[0]} se impuso por ${motivo}.`;
  } else {
    final = 'La partida terminó sin vencedores.';
  }
  capitulos.push({ titulo: 'El desenlace', texto: `Después de ${veces(estado.turno, 'ronda', 'rondas')}: ${final}` });
  return capitulos;
}
