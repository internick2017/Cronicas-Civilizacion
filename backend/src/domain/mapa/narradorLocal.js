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

        if (datos.ganador === 'atacante') {
          frases.push(danoDefensor !== null
            ? `${quien} ataco${loc} y se impuso, causando ${danoDefensor} de dano.`
            : `${quien} ataco${loc} y se impuso.`);
        } else if (datos.ganador === 'defensor') {
          frases.push(danoAtacante !== null
            ? `${quien} ataco${loc} pero fue rechazado, sufriendo ${danoAtacante} de dano.`
            : `${quien} ataco${loc} pero fue rechazado.`);
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
        const loc = coordenadas(datos.x, datos.y) || ' en el campo de batalla';
        frases.push(`Una unidad cayo en combate${loc}.`);
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
          frases.push(`La partida termino: ${ganadorNombre} se impuso por ${motivo}.`);
        } else {
          frases.push('La partida termino sin vencedores.');
        }
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
