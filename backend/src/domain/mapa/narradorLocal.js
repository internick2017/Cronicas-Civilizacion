// Narrador sin IA: convierte los eventos de una ronda en prosa breve en
// espanol. Es puro y determinista, asi que el modo mapa nunca depende de una
// clave de API ni de la red para darle devolucion al jugador.

const NOMBRE_EDIFICIO = {
  granary: 'un granero',
  market: 'un mercado',
  library: 'una biblioteca',
  barracks: 'un cuartel'
};

const NOMBRE_UNIDAD = {
  warrior: 'guerreros',
  archer: 'arqueros',
  spearman: 'lanceros',
  cavalry: 'caballeria',
  catapult: 'una catapulta'
};

const NOMBRE_VICTORIA = {
  dominacion: 'dominacion',
  ultimo_en_pie: 'ser el ultimo en pie'
};

// Variantes elegidas por un indice estable (no por azar), para que el texto
// no sea monotono pero siga siendo determinista.
const elegir = (opciones, semilla) => opciones[semilla % opciones.length];

function nombreDe(jugadores, jugadorId) {
  const jugador = jugadores.find(j => j.id === jugadorId);
  return jugador ? jugador.nombre : 'Un pueblo sin nombre';
}

export function narrarRonda(eventos, jugadores = []) {
  const frases = [];
  let indice = 0;

  for (const evento of eventos ?? []) {
    const quien = nombreDe(jugadores, evento.jugadorId);
    const datos = evento.datos || {};
    indice++;

    switch (evento.tipo) {
      case 'CiudadFundada':
        frases.push(elegir([
          `${quien} fundo ${datos.nombre} en (${datos.x}, ${datos.y}).`,
          `Los colonos de ${quien} levantaron ${datos.nombre} en (${datos.x}, ${datos.y}).`
        ], indice));
        break;

      case 'EdificioConstruido':
        frases.push(`${quien} construyo ${NOMBRE_EDIFICIO[datos.edificio] || datos.edificio}.`);
        break;

      case 'UnidadReclutada':
        // El campo real del evento es `datos.tipo` (ver reglas/militar.js:reclutar),
        // no `datos.unidad`.
        frases.push(elegir([
          `${quien} recluto ${NOMBRE_UNIDAD[datos.tipo] || datos.tipo}.`,
          `Nuevas tropas de ${quien}: ${NOMBRE_UNIDAD[datos.tipo] || datos.tipo}.`
        ], indice));
        break;

      case 'CombateResuelto':
        // jugadorId siempre es quien ataca (ver reglas/combate.js:atacar); el evento no
        // trae un campo `dano` unico sino danoAtacante/danoDefensor segun quien gano.
        frases.push(datos.ganador === 'atacante'
          ? `${quien} ataco en (${datos.hasta?.x}, ${datos.hasta?.y}) y se impuso, causando ${datos.danoDefensor} de dano.`
          : `${quien} ataco en (${datos.hasta?.x}, ${datos.hasta?.y}) pero fue rechazado, sufriendo ${datos.danoAtacante} de dano.`);
        break;

      case 'UnidadDestruida':
        // El evento solo trae {x, y}: no identifica al dueno de la unidad destruida
        // (ver aplicar.js), asi que no podemos nombrar al bando derrotado.
        frases.push(`Una unidad cayo en combate en (${datos.x}, ${datos.y}).`);
        break;

      case 'CiudadCapturada':
        // El evento solo trae {x, y}: no incluye `nombre` de la ciudad ni el dueno
        // anterior (ver reglas/combate.js:atacar), a diferencia de lo que asumia el brief.
        frases.push(`${quien} tomo una ciudad en (${datos.x}, ${datos.y}). La ciudad cambio de manos.`);
        break;

      case 'JugadorEliminado': {
        // El jugadorId del evento es quien cerro el turno, no el eliminado; el eliminado
        // viaja en datos.jugadorId (ver reglas/turnos.js:terminarTurno).
        const eliminado = nombreDe(jugadores, datos.jugadorId);
        frases.push(`${eliminado} quedo sin ciudades y desaparecio del mapa.`);
        break;
      }

      case 'PartidaTerminada': {
        // datos.ganador es un objeto { jugadorId, tipoVictoria, turno } o null
        // (ver reglas/turnos.js:evaluarVictoria), no un id de jugador plano con un
        // `motivo` aparte como asumia el brief.
        const ganador = datos.ganador;
        frases.push(ganador
          ? `La partida termino: ${nombreDe(jugadores, ganador.jugadorId)} se impuso por ${NOMBRE_VICTORIA[ganador.tipoVictoria] || ganador.tipoVictoria}.`
          : 'La partida termino sin vencedores.');
        break;
      }

      default:
        break; // eventos de contabilidad interna: no se narran
    }
  }

  if (frases.length === 0) {
    return 'La ronda paso sin sobresaltos. Los pueblos siguieron con lo suyo.';
  }
  return frases.join(' ');
}
