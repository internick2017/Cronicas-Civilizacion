// Narrador sin IA: convierte los eventos de una ronda en prosa breve en
// espanol. Es puro y determinista, asi que el modo mapa nunca depende de una
// clave de API ni de la red para darle devolucion al jugador.

const NOMBRE_EDIFICIO = {
  granary: 'un granero',
  market: 'un mercado',
  library: 'una biblioteca',
  barracks: 'un cuartel',
  sawmill: 'un aserradero',
  quarry: 'una cantera',
  university: 'una universidad',
  port: 'un puerto'
};

const NOMBRE_RASGO = {
  gastronomia: 'una cocina propia',
  idioma: 'una lengua propia',
  teatro: 'el teatro',
  arte: 'el arte'
};

const NOMBRE_TECNOLOGIA = {
  metalurgia: 'la metalurgia',
  fortificacion: 'la fortificación',
  irrigacion: 'la irrigación',
  mineria: 'la minería',
  formacionMilitar: 'una nueva formación militar',
  filosofia: 'la filosofía'
};

const NOMBRE_UNIDAD = {
  warrior: 'guerreros',
  archer: 'arqueros',
  spearman: 'lanceros',
  cavalry: 'caballeria',
  legionary: 'legionarios',
  catapult: 'una catapulta',
  warship: 'un buque de guerra'
};

const NOMBRE_VICTORIA = {
  dominacion: 'dominacion',
  ultimo_en_pie: 'ser el ultimo en pie'
};

// --- Saneamiento de datos ---------------------------------------------------
// Criterio ante datos faltantes o invalidos: NUNCA interpolar un valor crudo
// del evento directamente en el texto. Todo campo que va a texto pasa primero
// por uno de estos helpers, que devuelven el valor solo si tiene una forma
// util (string no vacio / numero finito) y si no, `null`. Cada frase decide,
// campo por campo, una alternativa generica pero verdadera para el `null`
// (nunca "undefined", "null" ni "[object Object]", y nunca cadena vacia como
// resultado final). Esto es preferible a saltear el evento entero: el jugador
// se entera de que algo paso, aunque sea con menos detalle.
function textoSeguro(valor) {
  return typeof valor === 'string' && valor.trim().length > 0 ? valor : null;
}

function numeroSeguro(valor) {
  return typeof valor === 'number' && Number.isFinite(valor) ? valor : null;
}

// Devuelve " en (x, y)" solo si ambas coordenadas son numeros validos; si no,
// cadena vacia, para que la frase pueda omitir la ubicacion con naturalidad.
function coordenadas(x, y) {
  const nx = numeroSeguro(x);
  const ny = numeroSeguro(y);
  return nx !== null && ny !== null ? ` en (${nx}, ${ny})` : '';
}

// Variantes elegidas por un indice estable (no por azar), para que el texto
// no sea monotono pero siga siendo determinista.
const elegir = (opciones, semilla) => opciones[semilla % opciones.length];

// Exportada para que el prompt de la IA (ver narracionRonda.js) nombre a los
// jugadores EXACTAMENTE igual que el narrador local, en vez de tener su propia
// version que se puede desincronizar.
export function nombreDe(jugadores, jugadorId) {
  const jugador = jugadores.find(j => j.id === jugadorId);
  return jugador ? jugador.nombre : 'Un pueblo sin nombre';
}

/**
 * Cuenta los cambios de territorio de la ronda, agrupados por quien gano y a
 * quien se los saco.
 *
 * Se agrega en vez de enumerar porque un ejercito reclama UNA casilla por paso:
 * en una partida larga se midieron 8.193 reclamos. Narrarlos de a uno
 * inundaria la cronica y la volveria ilegible, que es tan malo como el silencio
 * que habia antes.
 *
 * Exportada para que el prompt de la IA use exactamente el mismo resumen (ver
 * narracionRonda.js) y las dos voces cuenten lo mismo.
 *
 * @returns {Array<{jugadorId: string, duenoAnterior: string|null, casillas: number}>}
 */
export function resumirTerritorio(eventos) {
  const porClave = new Map();
  for (const evento of eventos ?? []) {
    const datos = evento.datos || {};
    let casillas = 0;
    if (evento.tipo === 'TerritorioReclamado') casillas = 1;
    else if (evento.tipo === 'TerritorioAnexado') casillas = (datos.tiles ?? []).length;
    else continue;
    if (casillas === 0) continue;

    // Un evento viejo, guardado antes de que existiera el campo, no dice de
    // quien era la casilla: se cuenta como tierra sin dueño en vez de romper.
    const duenoAnterior = datos.duenoAnterior ?? null;
    const clave = `${evento.jugadorId}|${duenoAnterior ?? ''}`;
    const acumulado = porClave.get(clave) ?? { jugadorId: evento.jugadorId, duenoAnterior, casillas: 0 };
    acumulado.casillas += casillas;
    porClave.set(clave, acumulado);
  }
  return [...porClave.values()];
}

const casillasDe = (n) => `${n} ${n === 1 ? 'casilla' : 'casillas'}`;

export function narrarRonda(eventos, jugadores = []) {
  const frases = [];
  const cierre = []; // lo que anuncia el fin de la partida: siempre lo ultimo
  let indice = 0;

  for (const evento of eventos ?? []) {
    const quien = nombreDe(jugadores, evento.jugadorId);
    const datos = evento.datos || {};
    indice++;

    switch (evento.tipo) {
      case 'CiudadFundada': {
        const nombreCiudad = textoSeguro(datos.nombre) ?? 'una nueva ciudad';
        const loc = coordenadas(datos.x, datos.y);
        frases.push(elegir([
          `${quien} fundo ${nombreCiudad}${loc}.`,
          `Los colonos de ${quien} levantaron ${nombreCiudad}${loc}.`
        ], indice));
        break;
      }

      case 'EdificioConstruido': {
        const edificio = NOMBRE_EDIFICIO[datos.edificio] ?? textoSeguro(datos.edificio) ?? 'una construccion';
        frases.push(`${quien} construyo ${edificio}.`);
        break;
      }

      case 'RasgoAdoptado': {
        const rasgo = NOMBRE_RASGO[datos.rasgo] ?? textoSeguro(datos.rasgo) ?? 'una nueva costumbre';
        frases.push(`${quien} hizo florecer ${rasgo} entre su gente.`);
        break;
      }

      case 'TecnologiaInvestigada': {
        const tecnologia = NOMBRE_TECNOLOGIA[datos.tecnologia] ?? textoSeguro(datos.tecnologia) ?? 'un nuevo saber';
        frases.push(`${quien} dominó ${tecnologia}.`);
        break;
      }

      case 'CiudadMejorada': {
        frases.push(`${quien} amplió una de sus ciudades.`);
        break;
      }

      case 'UnidadReclutada': {
        // El campo real del evento es `datos.tipo` (ver reglas/militar.js:reclutar),
        // no `datos.unidad`.
        const unidad = NOMBRE_UNIDAD[datos.tipo] ?? textoSeguro(datos.tipo) ?? 'nuevas tropas';
        frases.push(elegir([
          `${quien} recluto ${unidad}.`,
          `Nuevas tropas de ${quien}: ${unidad}.`
        ], indice));
        break;
      }

      case 'CombateResuelto': {
        // jugadorId siempre es quien ataca (ver reglas/combate.js:atacar); el evento no
        // trae un campo `dano` unico sino danoAtacante/danoDefensor segun quien gano.
        const loc = coordenadas(datos.hasta?.x, datos.hasta?.y) || ' en un frente de batalla';
        const danoDefensor = numeroSeguro(datos.danoDefensor);
        const danoAtacante = numeroSeguro(datos.danoAtacante);

        // `datos.naval` lo pone reglas/combate.js cuando alguno de los dos
        // bandos es un buque. Los eventos viejos no lo traen y caen al relato
        // terrestre de siempre, que es el correcto para ellos.
        const enElMar = datos.naval === true;

        if (datos.ganador === 'atacante') {
          if (enElMar) {
            frases.push(danoDefensor !== null
              ? `La flota de ${quien} se impuso${loc}, causando ${danoDefensor} de dano.`
              : `La flota de ${quien} se impuso${loc}.`);
          } else {
            frases.push(danoDefensor !== null
              ? `${quien} ataco${loc} y se impuso, causando ${danoDefensor} de dano.`
              : `${quien} ataco${loc} y se impuso.`);
          }
        } else if (datos.ganador === 'defensor') {
          if (enElMar) {
            frases.push(danoAtacante !== null
              ? `La flota de ${quien} fue repelida${loc}, sufriendo ${danoAtacante} de dano.`
              : `La flota de ${quien} fue repelida${loc}.`);
          } else {
            frases.push(danoAtacante !== null
              ? `${quien} ataco${loc} pero fue rechazado, sufriendo ${danoAtacante} de dano.`
              : `${quien} ataco${loc} pero fue rechazado.`);
          }
        } else {
          // `ganador` ausente o con un valor inesperado: se narra el hecho sin afirmar
          // un desenlace que no esta confirmado por el evento.
          frases.push(`${quien} protagonizo un combate${loc}.`);
        }
        break;
      }

      case 'UnidadDestruida': {
        // El evento solo trae {x, y}: no identifica al dueno de la unidad destruida
        // (ver aplicar.js), asi que no podemos nombrar al bando derrotado.
        // Un buque no "cae": se hunde. El evento trae `naval` justamente
        // porque aca no hay forma de mirar el terreno.
        if (datos.naval === true) {
          const enMar = coordenadas(datos.x, datos.y) || ' en alta mar';
          frases.push(`Un buque se fue a pique${enMar}.`);
          break;
        }
        const loc = coordenadas(datos.x, datos.y) || ' en el campo de batalla';
        frases.push(`Una unidad cayo en combate${loc}.`);
        break;
      }

      // Un buque vencio a una ciudad costera y se llevo su oro sin poder
      // tomarla: no pisa tierra (ver docs/adr/0003). Se narra SIEMPRE, aunque
      // el botin sea cero, porque perder oro sin perder la ciudad es
      // exactamente el tipo de cosa que decide una partida en silencio si la
      // cronica no la cuenta.
      case 'CiudadSaqueada': {
        const loc = coordenadas(datos.x, datos.y) || ' en la costa';
        const victima = nombreDe(jugadores, datos.victima);
        const oro = numeroSeguro(datos.oro);
        frases.push(oro
          ? `La flota de ${quien} asalto un puerto de ${victima}${loc} y se llevo ${oro} de oro.`
          : `La flota de ${quien} asalto un puerto de ${victima}${loc}, pero no habia nada que saquear.`);
        break;
      }

      case 'CiudadCapturada': {
        // El evento solo trae {x, y}: no incluye `nombre` de la ciudad ni el dueno
        // anterior (ver reglas/combate.js:atacar), a diferencia de lo que asumia el brief.
        const loc = coordenadas(datos.x, datos.y);
        frases.push(`${quien} tomo una ciudad${loc}. La ciudad cambio de manos.`);
        break;
      }

      case 'JugadorEliminado': {
        // El jugadorId del evento es quien cerro el turno, no el eliminado; el eliminado
        // viaja en datos.jugadorId (ver reglas/turnos.js:terminarTurno). nombreDe ya
        // degrada con elegancia si el id falta o no matchea ningun jugador conocido.
        const eliminado = nombreDe(jugadores, datos.jugadorId);
        frases.push(`${eliminado} quedo sin ciudades y desaparecio del mapa.`);
        break;
      }

      case 'PartidaTerminada': {
        // datos.ganador es un objeto { jugadorId, tipoVictoria, turno } o null
        // (ver reglas/turnos.js:evaluarVictoria), no un id de jugador plano con un
        // `motivo` aparte como asumia el brief.
        const ganador = datos.ganador;
        if (ganador && typeof ganador === 'object') {
          const ganadorNombre = nombreDe(jugadores, ganador.jugadorId);
          const motivo = NOMBRE_VICTORIA[ganador.tipoVictoria] ?? textoSeguro(ganador.tipoVictoria) ?? 'una victoria decisiva';
          // El anuncio del final se guarda aparte y se agrega al final de todo:
          // visto jugando, la cronica decia "La partida termino..." y despues
          // seguia contando casillas, porque el territorio se narra al cierre.
          cierre.push(`La partida termino: ${ganadorNombre} se impuso por ${motivo}.`);
        } else {
          cierre.push('La partida termino sin vencedores.');
        }
        break;
      }

      default:
        break; // eventos de contabilidad interna: no se narran
    }
  }

  // El territorio se narra al final y agregado, no evento por evento: son
  // muchisimos y lo que importa es el saldo de la ronda, no cada paso.
  for (const cambio of resumirTerritorio(eventos)) {
    const quienGano = nombreDe(jugadores, cambio.jugadorId);
    if (cambio.duenoAnterior) {
      frases.push(`${quienGano} le arrebato ${casillasDe(cambio.casillas)} a ${nombreDe(jugadores, cambio.duenoAnterior)}.`);
    } else {
      frases.push(`${quienGano} se extendio sobre ${casillasDe(cambio.casillas)} sin dueño.`);
    }
  }

  frases.push(...cierre);

  if (frases.length === 0) {
    return 'La ronda paso sin sobresaltos. Los pueblos siguieron con lo suyo.';
  }
  return frases.join(' ');
}
