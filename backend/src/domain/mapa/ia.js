// Jugador controlado por la maquina, para partidas de un jugador humano.
//
// No es una IA con modelo de lenguaje: son reglas heuristicas simples, del
// mismo tipo que el narrador local (ver narradorLocal.js). No hace falta mas
// para que la partida sea jugable sola: la IA no tiene que jugar OPTIMO, solo
// tiene que jugar RAZONABLE (o deliberadamente PEOR, en facil) y nunca trabar
// el turno.
//
// Diseño: en cada paso se elige UNA accion con el estado actual (los
// recursos y el mapa cambian entre pasos, igual que si un humano jugara
// click a click), se ejecuta reusando las MISMAS reglas de dominio que usa
// un jugador humano (nunca se inventa un camino paralelo que pueda violar
// una regla del juego), y se repite hasta que no hay mas nada razonable que
// hacer o se llega al tope de pasos. Al final siempre se termina el turno:
// la IA nunca puede dejar la partida esperando a que ella actue.
import { tileEn, jugadorPorId, puedePagar } from './MapGame.js';
import {
  EDIFICIOS, UNIDADES, COSTO_CIUDAD, BONO_TERRENO_PRODUCCION, TECNOLOGIAS, COSTO_MEJORA_CIUDAD,
  bonoDefensa, defensaCiudad, BONO_DEFENSA_CIUDAD,
  DIFICULTADES_IA, DIFICULTAD_IA_DEFAULT
} from './constantes.js';
import { aplicar } from './aplicar.js';
import { fundarCiudad, construir, mejorarCiudad } from './reglas/ciudades.js';
import { reclutar } from './reglas/militar.js';
import { moverEjercito } from './reglas/movimiento.js';
import { atacar } from './reglas/combate.js';
import { terminarTurno } from './reglas/turnos.js';
import { bonoDefensaPorRasgos } from './reglas/cultura.js';
import { tieneTecnologiaRequerida, tecnologiasDe } from './reglas/tecnologia.js';
import { investigar } from './reglas/tecnologia.js';
import { ReglaError } from './errores.js';

// Backstop duro: protege contra un bug futuro que deje a decidirAccion
// devolviendo algo valido para siempre (p.ej. una regla nueva que la IA
// nunca deja de poder pagar). Muy por encima de lo que un turno real usa.
// Subido de 60 a 200 cuando la IA paso a jugar por dominacion: con muchas
// ciudades y muchos ejercitos, un turno legitimo gasta facil 60 pasos solo en
// construir y mover (medido: 21 edificios + 29 movimientos + 8 reclutas + 2
// fundaciones = 60 justos), y las decisiones de MENOR prioridad (mejorar una
// ciudad, que se decide ultima) no llegaban a ejecutarse nunca. Sigue siendo un
// backstop contra un bucle infinito, no un limite de juego.
const PASOS_MAXIMOS = 200;

// Nivel a partir del cual una ciudad es MATEMATICAMENTE incapturable: su
// defensa minima (peor tirada, con cuartel, en colinas) supera al ataque maximo
// posible del juego (la mejor unidad, con metalurgia y la mejor tirada). Como
// las ciudades no tienen vida y la captura se juega en una sola tirada, pasado
// ese nivel no hay ejercito que pueda tomarla nunca.
//
// La IA se queda por debajo a proposito. No es solo eficiencia: cuando dos bots
// mejoraban sin freno, sus ciudades llegaban a nivel 13-15, nadie podia
// capturar nada, nadie podia ser eliminado y la partida no terminaba jamas
// (medido: 301 turnos sin ganador). El problema de fondo es de las REGLAS, no
// de la IA, y esta anotado para decidirlo aparte; esto solo evita que la
// maquina lo dispare en cada partida larga.
export const NIVEL_CIUDAD_INCAPTURABLE = 6;
// Si una decision falla por una ReglaError 5 veces seguidas, algo quedo mal
// modelado (p.ej. dos "candidatos" que se invalidan mutuamente) y seguir
// probando no va a arreglarlo: mejor cerrar el turno que quedar reintentando.
const FALLOS_SEGUIDOS_MAXIMOS = 5;

// Orden que prioriza aserradero/cantera primero: evita el error de balance
// que encontramos jugando (madera o piedra en cero para siempre si la
// capital no cayo en el terreno correcto). Lo usan normal y dificil.
// university va al final y solo sirve una vez investigada 'filosofia'
// (decidirConstruccion filtra por tecnologia): sin listarla, esa tecnologia no
// desbloquearia nada en la practica y seria ciencia tirada.
const ORDEN_EDIFICIOS_BUENO = ['sawmill', 'quarry', 'granary', 'market', 'library', 'barracks', 'university'];
// Orden "de fabrica" de EDIFICIOS (sin ese criterio): lo que construiria
// alguien sin pensarlo. Es lo que separa a facil del resto.
const ORDEN_EDIFICIOS_NATURAL = Object.keys(EDIFICIOS);

// Economia primero: mas comida y mas oro es mas ejercitos y mas ciudades, que
// es lo que gana por territorio. Filosofia va ultima porque lo que desbloquea
// (la universidad) produce ciencia, y la ciencia solo compra tecnologias: es la
// que menos rinde justo cuando quedan pocas por comprar.
const ORDEN_TECNOLOGIAS_BUENO = ['irrigacion', 'mineria', 'metalurgia', 'fortificacion', 'formacionMilitar', 'filosofia'];
// El orden "de fabrica", sin ese criterio: lo que investigaria alguien que va
// tomando lo primero que ve. Mismo papel que ORDEN_EDIFICIOS_NATURAL.
const ORDEN_TECNOLOGIAS_NATURAL = Object.keys(TECNOLOGIAS);

export { DIFICULTADES_IA, DIFICULTAD_IA_DEFAULT };

// Un solo lugar donde vive QUE tan bien juega cada nivel. Ajustar la
// dificultad es tocar numeros aca, no reescribir logica.
// Se exporta para que los tests puedan afirmar sobre EL TOPE VIGENTE en vez de
// clavar un numero suelto que quede viejo al primer ajuste de balance.
export const PERFILES_DIFICULTAD = {
  facil: {
    // 3 de cada 10 pasos, la maquina directamente no hace nada ese paso
    // (como si dudara o se distrajera): juega mas lento y menos a fondo.
    probabilidadSaltear: 0.3,
    // 0 = ataca a cualquier vecino enemigo sin calcular si conviene, igual
    // que la version original. Es justo el tipo de error (arquero contra
    // lancero en altura) que un jugador nuevo tambien cometeria.
    margenAtaque: 0,
    unidadesPrioridad: ['warrior'],
    // El tope de ejercitos es, en la practica, cuantos "colonos" tiene para ir
    // reclamando tierra: el territorio se gana caminando (ver
    // reglas/movimiento.js, que reclama la casilla al pisarla), no fundando.
    // Con 0 extra la maquina no podia perseguir la victoria por dominacion
    // aunque quisiera. Sigue habiendo tope: sin el, gastaria todo en tropa.
    topeEjercitosExtra: 1,
    ordenEdificios: ORDEN_EDIFICIOS_NATURAL,
    ordenTecnologias: ORDEN_TECNOLOGIAS_NATURAL,
    // No mejora ciudades: como saltear pasos o construir en el orden de fabrica,
    // es una de las cosas que hace peor a proposito.
    mejoraCiudades: false,
    nivelMaximoCiudad: 1,
    elegirMejorFundacion: false,
    fundacionesPorTurno: 1,
  },
  normal: {
    probabilidadSaltear: 0,
    // Ataca solo si su ataque base alcanza al menos el 90% del poder
    // defensivo estimado del objetivo: filtra los enfrentamientos obviamente
    // perdidos (el caso real que motivo el cambio de combate a dano mutuo),
    // sin llegar a jugar perfecto.
    margenAtaque: 0.9,
    // legionary aparece recien con la tecnologia formacionMilitar; si no
    // estuviera en la lista, investigarla no cambiaria nada.
    unidadesPrioridad: ['legionary', 'warrior', 'spearman', 'archer'],
    topeEjercitosExtra: 3,
    ordenEdificios: ORDEN_EDIFICIOS_BUENO,
    ordenTecnologias: ORDEN_TECNOLOGIAS_BUENO,
    mejoraCiudades: true,
    nivelMaximoCiudad: 3,
    elegirMejorFundacion: false,
    fundacionesPorTurno: 1,
  },
  dificil: {
    probabilidadSaltear: 0,
    // Solo pelea cuando esta claramente arriba (10% de margen mas que
    // "parejo"): prefiere reposicionarse antes que un intercambio parejo.
    margenAtaque: 1.15,
    // Prioriza unidades de cuartel (mas fuertes) en cuanto estan disponibles.
    unidadesPrioridad: ['cavalry', 'catapult', 'legionary', 'spearman', 'archer', 'warrior'],
    topeEjercitosExtra: 5,
    ordenEdificios: ORDEN_EDIFICIOS_BUENO,
    ordenTecnologias: ORDEN_TECNOLOGIAS_BUENO,
    mejoraCiudades: true,
    // Un nivel mas que normal, pero igual por debajo del umbral donde la ciudad
    // se vuelve intomable.
    nivelMaximoCiudad: 4,
    elegirMejorFundacion: true,
    fundacionesPorTurno: 2,
  },
};

function perfilDe(estado, jugadorId) {
  const jugador = jugadorPorId(estado, jugadorId);
  const dificultad = DIFICULTADES_IA.includes(jugador?.dificultadIA)
    ? jugador.dificultadIA
    : DIFICULTAD_IA_DEFAULT;
  return PERFILES_DIFICULTAD[dificultad];
}

const VECINOS_ORTOGONALES = [[0, -1], [0, 1], [-1, 0], [1, 0]];

function ciudadesDe(estado, jugadorId) {
  return estado.mapa.filter((t) => t.ciudad && t.dueno === jugadorId);
}

function ejercitosDe(estado, jugadorId) {
  return estado.mapa.filter((t) => t.ejercito && t.ejercito.dueno === jugadorId);
}

function vecinosOrtogonales(estado, x, y) {
  return VECINOS_ORTOGONALES
    .map(([dx, dy]) => tileEn(estado, x + dx, y + dy))
    .filter(Boolean);
}

function elegir(rng, opciones) {
  return opciones[Math.floor(rng() * opciones.length)];
}

// Estimacion del poder defensivo de un tile enemigo, con la MISMA formula que
// reglas/combate.js pero SIN el dado (tirada() es aleatorio en el momento del
// combate real; la IA decide ANTES de tirar, asi que solo puede trabajar con
// lo que ya se sabe). No es exacta: es una guia para no atacar a ciegas.
function poderDefensivoEstimado(estado, objetivo) {
  const base = objetivo.ejercito
    ? UNIDADES[objetivo.ejercito.tipo].defensa
    : defensaCiudad(objetivo.ciudad.nivel);
  const ciudadPropia = Boolean(objetivo.ciudad);
  const defensor = estado.jugadores.find((j) => j.id === objetivo.dueno);
  const bonoCiudad = ciudadPropia ? BONO_DEFENSA_CIUDAD * bonoDefensaPorRasgos(defensor) : 1;
  return base * bonoDefensa(objetivo.terreno) * bonoCiudad;
}


// --- Brujula hacia la tierra libre ----------------------------------------

const clave = (x, y) => `${x},${y}`;

/**
 * Mapa de "a cuantos pasos esta la tierra sin dueño mas cercana", por casilla.
 *
 * Es un BFS MULTI-ORIGEN: en vez de buscar un camino por ejercito (N busquedas
 * por turno), arranca desde TODAS las casillas libres a la vez y se expande
 * hacia atras. Una sola pasada deja la respuesta para todo el mapa, y como el
 * BFS avanza por capas, la primera vez que toca una casilla ya es por el camino
 * mas corto.
 *
 * Solo se camina por casillas transitables: el agua y el territorio ajeno no
 * son camino (para pasar por territorio ajeno habria que atacar, que es otra
 * decision). Una casilla que no aparece en el Map es una a la que no se puede
 * llegar sin pelear.
 */
export function distanciaATierraLibre(estado, jugadorId) {
  const distancia = new Map();
  const cola = [];
  for (const tile of estado.mapa) {
    if (tile.terreno !== 'water' && !tile.dueno) {
      distancia.set(clave(tile.x, tile.y), 0);
      cola.push(tile);
    }
  }
  for (let i = 0; i < cola.length; i++) {
    const actual = cola[i];
    const d = distancia.get(clave(actual.x, actual.y));
    for (const vecino of vecinosOrtogonales(estado, actual.x, actual.y)) {
      if (vecino.terreno === 'water') continue;
      // Ajena: no es camino. La propia si, que es justo el caso que importa
      // (los ejercitos se entierran en su propio territorio).
      if (vecino.dueno && vecino.dueno !== jugadorId) continue;
      const k = clave(vecino.x, vecino.y);
      if (distancia.has(k)) continue;
      distancia.set(k, d + 1);
      cola.push(vecino);
    }
  }
  return distancia;
}

// --- Decisiones, una por dominio de juego ---------------------------------

function decidirConstruccion(estado, jugadorId, perfil) {
  const jugador = jugadorPorId(estado, jugadorId);
  for (const tile of ciudadesDe(estado, jugadorId)) {
    // Se descartan los edificios que exigen una tecnologia que el jugador no
    // tiene, con la MISMA funcion que usa construir(): la IA todavia no
    // investiga tecnologias, asi que proponer la universidad (que exige
    // filosofia) era proponer algo que la regla iba a rechazar siempre. Como
    // decidirConstruccion es la PRIMERA decision del turno, esa propuesta
    // imposible se repetia hasta agotar el tope de fallos seguidos y el bot
    // terminaba el turno sin fundar, mover ni reclutar. Se quedaba inmovil para
    // siempre con recursos de sobra (medido: 2 ciudades en 200 turnos y 3382 de
    // oro sin gastar). Solo le pasaba a facil: es la unica que construye en el
    // orden "de fabrica", el unico que incluye un edificio con tecnologia.
    const faltantes = perfil.ordenEdificios.filter((tipo) =>
      !tile.ciudad.edificios.includes(tipo) &&
      tieneTecnologiaRequerida(jugador, EDIFICIOS[tipo].requiereTecnologia));
    for (const tipo of faltantes) {
      if (puedePagar(jugador, EDIFICIOS[tipo].costo)) {
        return { tipo: 'construir', x: tile.x, y: tile.y, edificio: tipo };
      }
    }
  }
  return null;
}

// El tope de ejercitos (ciudades + un extra segun dificultad) evita que la IA
// gaste TODO en soldados y nunca construya ni funde.
// Investigar se decide PRIMERO y no le saca nada a nadie: las tecnologias se
// pagan solo con ciencia, y la unica otra decision que gasta ciencia (mejorar
// una ciudad) se decide ultima justamente para no competir con esta.
function decidirInvestigacion(estado, jugadorId, perfil) {
  const jugador = jugadorPorId(estado, jugadorId);
  const yaTiene = tecnologiasDe(jugador);
  for (const tecnologia of perfil.ordenTecnologias) {
    if (yaTiene.includes(tecnologia)) continue;
    if (puedePagar(jugador, TECNOLOGIAS[tecnologia].costo)) {
      return { tipo: 'investigar', tecnologia };
    }
  }
  return null;
}

// Mejorar una ciudad es lo ULTIMO que decide: cuesta oro ademas de ciencia, y
// ese oro es el mismo con el que recluta. Subir de nivel solo mejora la defensa
// de esa ciudad; expandirse gana la partida. Asi que se hace con lo que sobra.
// Se elige la ciudad de menor nivel: el costo escala con el nivel, asi que es
// tambien la mejora mas barata disponible.
function decidirMejoraCiudad(estado, jugadorId, perfil) {
  if (!perfil.mejoraCiudades) return null;
  const jugador = jugadorPorId(estado, jugadorId);
  const ciudades = [...ciudadesDe(estado, jugadorId)]
    .filter((t) => t.ciudad.nivel < Math.min(perfil.nivelMaximoCiudad, NIVEL_CIUDAD_INCAPTURABLE))
    .sort((a, b) => a.ciudad.nivel - b.ciudad.nivel);
  for (const tile of ciudades) {
    if (puedePagar(jugador, COSTO_MEJORA_CIUDAD(tile.ciudad.nivel))) {
      return { tipo: 'mejorarCiudad', x: tile.x, y: tile.y };
    }
  }
  return null;
}

function decidirReclutamiento(estado, jugadorId, perfil) {
  const jugador = jugadorPorId(estado, jugadorId);
  const ciudades = ciudadesDe(estado, jugadorId);
  if (ejercitosDe(estado, jugadorId).length >= ciudades.length + perfil.topeEjercitosExtra) return null;

  const libres = ciudades.filter((tile) => !tile.ejercito);
  if (libres.length === 0) return null;

  // El bucle recorre PRIMERO la prioridad de unidad y despues las ciudades, no
  // al reves: mirando una sola ciudad (la primera libre), en cuanto la maquina
  // tenia mas de una ciudad esa solia ser una nueva sin cuartel, y descartaba
  // caballeria/catapulta aunque tuviera la capital libre al lado. Elegir la
  // MEJOR unidad que alguna ciudad pueda producir es lo que el perfil promete.
  for (const tipo of perfil.unidadesPrioridad) {
    const definicion = UNIDADES[tipo];
    if (!puedePagar(jugador, definicion.costo)) continue;
    const ciudad = libres.find((tile) =>
      !definicion.requiereBarracks || tile.ciudad.edificios.includes('barracks'));
    if (ciudad) {
      return { tipo: 'reclutar', x: ciudad.x, y: ciudad.y, unidad: tipo };
    }
  }
  return null;
}

// De un grupo de casillas empatadas, la que deja mas cerca de tierra libre. Si
// varias empatan tambien en eso (o ninguna es alcanzable) se sortea, que era el
// comportamiento anterior: la brujula solo agrega criterio donde no habia.
function masCercaDeTierraLibre(candidatas, brujula, rng) {
  const distancias = candidatas.map((t) => brujula.get(clave(t.x, t.y)) ?? Infinity);
  const menor = Math.min(...distancias);
  if (menor === Infinity) return elegir(rng, candidatas);
  return elegir(rng, candidatas.filter((t, i) => distancias[i] === menor));
}

function decidirMilitar(estado, jugadorId, rng, perfil, brujula) {
  for (const origen of ejercitosDe(estado, jugadorId)) {
    if (origen.ejercito.movimientoRestante <= 0) continue;
    const vecinos = vecinosOrtogonales(estado, origen.x, origen.y);

    const objetivo = vecinos.find((t) =>
      (t.ejercito && t.ejercito.dueno !== jugadorId) || (t.ciudad && t.dueno !== jugadorId));
    if (objetivo) {
      const ataquePropio = UNIDADES[origen.ejercito.tipo].ataque;
      // margenAtaque=0 (facil) hace que esto siempre de verdadero: cualquier
      // poder defensivo es >= 0 * cualquier cosa, asi que ataca sin pensar.
      const conviene = ataquePropio >= perfil.margenAtaque * poderDefensivoEstimado(estado, objetivo);
      if (conviene) {
        return { tipo: 'atacar', desde: { x: origen.x, y: origen.y }, hasta: { x: objetivo.x, y: objetivo.y } };
      }
      // Si no conviene, NO ataca: cae al movimiento normal de abajo (se
      // reposiciona/explora en vez de tirarse a un combate que va a perder).
    }

    const transitables = vecinos.filter((t) =>
      t.terreno !== 'water' &&
      !(t.dueno && t.dueno !== jugadorId) &&
      !(t.ejercito && t.ejercito.dueno === jugadorId));
    if (transitables.length === 0) continue;

    // A donde caminar. La victoria por dominacion se mide en casillas
    // CONTROLADAS y el unico modo de ganar una es pisar tierra sin dueño, asi
    // que reclamar pesa mas que explorar; explorar sigue valiendo (abre mapa y
    // encuentra al rival) y pisar lo propio es el ultimo recurso: no suma nada.
    const puntajeDestino = (t) =>
      (t.dueno ? 0 : 2) + (t.descubiertoPor.includes(jugadorId) ? 0 : 1);
    const mejorPuntaje = Math.max(...transitables.map(puntajeDestino));
    const mejores = transitables.filter((t) => puntajeDestino(t) === mejorPuntaje);
    // Desempate por brujula. Sin esto, cuando todos los vecinos empatan (el caso
    // normal: un ejercito enterrado en el medio del territorio propio, donde todo
    // vale 0) la eleccion era al azar, y los ejercitos deambulaban por lo suyo
    // hasta tropezarse con la frontera de casualidad. Medido: 11 de 12 ejercitos
    // rodeados de casillas propias con 109 casillas libres alcanzables.
    const destino = mejores.length === 1 ? mejores[0] : masCercaDeTierraLibre(mejores, brujula, rng);
    return { tipo: 'moverEjercito', desde: { x: origen.x, y: origen.y }, hasta: { x: destino.x, y: destino.y } };
  }
  return null;
}

// Suma los numeros de BONO_TERRENO_PRODUCCION de un terreno, sin importar el
// recurso: sirve solo para COMPARAR candidatas entre si (agua/desierto dan
// menos que bosque/colinas), no como un valor con significado propio.
function puntajeTerreno(tile) {
  return Object.values(BONO_TERRENO_PRODUCCION[tile.terreno] ?? {}).reduce((a, b) => a + b, 0);
}

// El tope por turno existe porque fundar pasó a decidirse ANTES que reclutar:
// sin el, con recursos de sobra la maquina encadenaba una fundacion tras otra
// en un mismo turno (10 ciudades en el turno 1, medido) y llegaba al resto de
// las decisiones con los bolsillos vacios, sin reclutar ni una unidad. Expandir
// sostenido es la estrategia; vaciarse de golpe es un pozo.
function decidirFundacion(estado, jugadorId, rng, perfil, fundacionesEsteTurno) {
  if (fundacionesEsteTurno >= perfil.fundacionesPorTurno) return null;
  const jugador = jugadorPorId(estado, jugadorId);
  if (!puedePagar(jugador, COSTO_CIUDAD)) return null;

  // fundarCiudad (ver reglas/ciudades.js) rechaza CUALQUIER tile con dueño,
  // incluso el propio: solo se puede fundar en tierra sin reclamar. Filtrar
  // por "es mia" (t.dueno === jugadorId) es el error que tenia esta funcion
  // antes: nunca hay una casilla asi que pase la regla real, asi que la IA
  // jamas lograba fundar una segunda ciudad.
  const candidatas = estado.mapa.filter((t) =>
    !t.dueno && !t.ciudad && t.terreno !== 'water' && t.descubiertoPor.includes(jugadorId));
  if (candidatas.length === 0) return null;

  let elegida;
  if (perfil.elegirMejorFundacion) {
    const mejorPuntaje = Math.max(...candidatas.map(puntajeTerreno));
    elegida = elegir(rng, candidatas.filter((t) => puntajeTerreno(t) === mejorPuntaje));
  } else {
    elegida = elegir(rng, candidatas);
  }

  const numero = ciudadesDe(estado, jugadorId).length + 1;
  return { tipo: 'fundarCiudad', x: elegida.x, y: elegida.y, nombre: `${jugador.civilizacion} ${numero}` };
}

function decidirAccion(estado, jugadorId, rng, perfil, fundacionesEsteTurno, brujula) {
  // Fundar va ANTES que reclutar: mientras fue lo ultimo, cualquier edificio o
  // unidad pagable se comia los recursos primero y la maquina casi nunca
  // llegaba a una segunda ciudad. Una ciudad nueva reclama casilla, produce, y
  // sube el tope de ejercitos (que es el que limita cuanto puede reclamar).
  return decidirInvestigacion(estado, jugadorId, perfil) ??
    decidirConstruccion(estado, jugadorId, perfil) ??
    decidirFundacion(estado, jugadorId, rng, perfil, fundacionesEsteTurno) ??
    decidirReclutamiento(estado, jugadorId, perfil) ??
    decidirMilitar(estado, jugadorId, rng, perfil, brujula) ??
    decidirMejoraCiudad(estado, jugadorId, perfil) ??
    null;
}

const EJECUTORES = {
  construir: (estado, jugadorId, a) => construir(estado, jugadorId, a),
  reclutar: (estado, jugadorId, a) => reclutar(estado, jugadorId, a),
  moverEjercito: (estado, jugadorId, a) => moverEjercito(estado, jugadorId, a),
  atacar: (estado, jugadorId, a, rng) => atacar(estado, jugadorId, a, rng),
  fundarCiudad: (estado, jugadorId, a) => fundarCiudad(estado, jugadorId, a),
  investigar: (estado, jugadorId, a) => investigar(estado, jugadorId, a),
  mejorarCiudad: (estado, jugadorId, a) => mejorarCiudad(estado, jugadorId, a),
};

/**
 * Juega el turno completo de un jugador-bot: MUTA `estado` (aplica cada
 * evento a medida que decide, igual que MapGameService hace por cada accion
 * humana) y devuelve la lista plana de eventos generados, terminando siempre
 * con terminarTurno.
 *
 * La dificultad se lee del propio jugador (`jugador.dificultadIA`, fijada al
 * unirse — ver reglas/partida.js), no se pasa como parametro: asi cualquier
 * lugar que ya tenga `estado` y un `jugadorId` puede llamar a esto sin tener
 * que acordarse de propagar la dificultad por separado.
 */
export function jugarTurnoIA(estado, jugadorId, rng) {
  const perfil = perfilDe(estado, jugadorId);
  const eventos = [];
  let fallosSeguidos = 0;
  let fundacionesEsteTurno = 0;

  for (let paso = 0; paso < PASOS_MAXIMOS; paso++) {
    // El "se distrae" tiene que vivir ACA, no adentro de decidirAccion: si
    // viviera ahi, un salteo aleatorio en un paso cualquiera se confundiria
    // con "no hay mas nada que hacer" y cortaria el turno entero de un tiro
    // (rompiendo el for con `break`, no con `continue`). Con el chequeo aca,
    // un paso salteado simplemente pasa al siguiente: la maquina juega mas
    // lento/distraido, no un turno vacio por mala suerte en el primer paso.
    if (perfil.probabilidadSaltear > 0 && rng() < perfil.probabilidadSaltear) continue;

    // La brujula se recalcula en CADA paso, no una vez por turno: el propio
    // ejercito que acaba de reclamar una casilla cambia el mapa de distancias
    // para el siguiente. Es un BFS sobre el mapa entero, barato al lado de lo
    // que cuesta equivocarse de rumbo.
    const brujula = distanciaATierraLibre(estado, jugadorId);
    const decision = decidirAccion(estado, jugadorId, rng, perfil, fundacionesEsteTurno, brujula);
    if (!decision) break;

    try {
      const evs = EJECUTORES[decision.tipo](estado, jugadorId, decision, rng);
      aplicar(estado, evs);
      eventos.push(...evs);
      if (decision.tipo === 'fundarCiudad') fundacionesEsteTurno++;
      fallosSeguidos = 0;
    } catch (err) {
      // Una ReglaError significa que la decision ya no era valida (el estado
      // pudo cambiar entre elegirla y ejecutarla): se descarta ese paso, no
      // se rompe el turno. Cualquier OTRO error es un bug real y se propaga.
      if (!(err instanceof ReglaError)) throw err;
      fallosSeguidos++;
      if (fallosSeguidos >= FALLOS_SEGUIDOS_MAXIMOS) break;
    }
  }

  const cierre = terminarTurno(estado, jugadorId);
  aplicar(estado, cierre);
  eventos.push(...cierre);
  return eventos;
}
