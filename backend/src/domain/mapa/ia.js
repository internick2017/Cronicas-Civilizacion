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
  bonoDefensa, defensaCiudad, BONO_DEFENSA_CIUDAD, esNaval, esTransporte, CAPACIDAD_DE,
  DIFICULTADES_IA, DIFICULTAD_IA_DEFAULT
} from './constantes.js';
import { marAdyacente } from './reglas/comun.js';
import { aplicar } from './aplicar.js';
import { fundarCiudad, construir, mejorarCiudad } from './reglas/ciudades.js';
import { reclutar } from './reglas/militar.js';
import { moverEjercito } from './reglas/movimiento.js';
import { atacar } from './reglas/combate.js';
import { embarcar, desembarcar } from './reglas/transporte.js';
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

// Cuantas casillas de mar conectadas necesita ver la maquina para que valga la
// pena construir un puerto ahi.
//
// Un lago de una sola casilla es mar valido para la REGLA: un humano puede
// gastar madera y piedra en un puerto sobre un charco y sacar un buque que no
// va a ningun lado, y esta bien que pueda, porque lo ve. La maquina no ve,
// ejecuta reglas, y ya perdio turnos enteros una vez por proponer un edificio
// imposible. Este limite vive ACA, en la heuristica del bot, y no en el
// dominio: "cuerpo de agua minimo" no es un concepto del juego, es una
// precaucion de la maquina. El 6 es el tamano donde un buque puede al menos
// maniobrar; es una perilla, no una verdad medida.
const MAR_MINIMO_PARA_PUERTO = 6;

// Cuanta tierra inalcanzable tiene que haber para que valga la pena montar una
// invasion. Sin este piso, cualquier islote de dos casillas dispara la
// produccion de transportes: medido en 20 partidas, la maquina botaba 28
// transportes para hacer 3 embarques, o sea madera tirada en barcos que nunca
// zarpan. No es una regla del juego, es criterio del bot, igual que
// MAR_MINIMO_PARA_PUERTO.
const TIERRA_MINIMA_PARA_INVADIR = 8;

// Orden que prioriza aserradero/cantera primero: evita el error de balance
// que encontramos jugando (madera o piedra en cero para siempre si la
// capital no cayo en el terreno correcto). Lo usan normal y dificil.
// university va al final y solo sirve una vez investigada 'filosofia'
// (decidirConstruccion filtra por tecnologia): sin listarla, esa tecnologia no
// desbloquearia nada en la practica y seria ciencia tirada.
const ORDEN_EDIFICIOS_BUENO = ['sawmill', 'quarry', 'granary', 'market', 'port', 'library', 'barracks', 'university'];
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
    // Nunca marcha sobre el rival: toma lo que le queda al lado y se defiende.
    // Es la dificultad donde te dejan colonizar en paz.
    ofensiva: 'nunca',
    // El tope de ejercitos es, en la practica, cuantos "colonos" tiene para ir
    // reclamando tierra: el territorio se gana caminando (ver
    // reglas/movimiento.js, que reclama la casilla al pisarla), no fundando.
    // Con 0 extra la maquina no podia perseguir la victoria por dominacion
    // aunque quisiera. Sigue habiendo tope: sin el, gastaria todo en tropa.
    topeEjercitosExtra: 1,
    // Sin armada, y no por ser mala jugadora: su perfil dice `ofensiva:
    // 'nunca'` y unidadesPrioridad ['warrior']. Facil es la dificultad donde
    // te dejan colonizar en paz, y darle buques la contradice.
    topeBuques: 0,
    // Sin armada tampoco hay invasion: facil no cruza el mar.
    topeTransportes: 0,
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
    // El arquero y el legionario SI pueden tomar una ciudad de nivel bajo; el
    // guerrero y el lancero no llegan ni con la mejor tirada. Una IA que ataca
    // tiene que producir algo capaz de capturar, o marcha para nada.
    unidadesPrioridad: ['legionary', 'archer', 'spearman', 'warrior'],
    // Coloniza mientras haya mundo que tomar sin pelear; cuando se acaba, va a
    // la guerra en vez de dar vueltas por lo propio.
    ofensiva: 'sinTierraLibre',
    topeEjercitosExtra: 3,
    topeBuques: 1,
    topeTransportes: 1,
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
    unidadesPrioridad: ['cavalry', 'catapult', 'legionary', 'archer', 'spearman', 'warrior'],
    // Presiona desde el principio: coloniza y ataca a la vez.
    ofensiva: 'siempre',
    topeEjercitosExtra: 5,
    topeBuques: 2,
    topeTransportes: 1,
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

// Mientras quede mundo sin repartir, la dificultad normal prefiere colonizar
// antes que pelear (ver `ofensiva: 'sinTierraLibre'` en los perfiles).
function quedaTierraSinDueno(estado) {
  return estado.mapa.some((t) => t.terreno !== 'water' && !t.dueno);
}

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


// --- Brujulas -------------------------------------------------------------

const clave = (x, y) => `${x},${y}`;

/**
 * BFS multi-origen generico: arranca desde TODAS las casillas que cumplen
 * `esOrigen` a la vez y se expande hacia atras por las que cumplen `esCamino`.
 * Una sola pasada deja, para cada casilla del mapa, a cuantos pasos esta el
 * origen mas cercano; como el BFS avanza por capas, la primera vez que toca una
 * casilla ya es por el camino mas corto.
 *
 * Las dos brujulas de abajo son el mismo algoritmo con distinto objetivo, asi
 * que comparten esto en vez de duplicarlo.
 */
function distanciaHasta(estado, esOrigen, esCamino) {
  const distancia = new Map();
  const cola = [];
  for (const tile of estado.mapa) {
    if (esOrigen(tile)) {
      distancia.set(clave(tile.x, tile.y), 0);
      cola.push(tile);
    }
  }
  for (let i = 0; i < cola.length; i++) {
    const actual = cola[i];
    const d = distancia.get(clave(actual.x, actual.y));
    for (const vecino of vecinosOrtogonales(estado, actual.x, actual.y)) {
      const k = clave(vecino.x, vecino.y);
      if (distancia.has(k) || !esCamino(vecino)) continue;
      distancia.set(k, d + 1);
      cola.push(vecino);
    }
  }
  return distancia;
}

// Por donde puede caminar este jugador: todo lo que no sea agua ni este
// DEFENDIDO por otro (un ejercito o una ciudad ajena exigen atacar, no son
// camino). La tierra ajena suelta si es camino desde que la frontera se volvio
// permeable (ver reglas/movimiento.js).
const transitablePara = (jugadorId) => (t) =>
  t.terreno !== 'water' &&
  !(t.ejercito && t.ejercito.dueno !== jugadorId) &&
  !(t.ciudad && t.dueno && t.dueno !== jugadorId);

/**
 * Distancia a la casilla TOMABLE mas cercana: cualquiera que no sea mia, sea
 * tierra de nadie o territorio ajeno suelto. Antes esta brujula miraba solo la
 * tierra sin dueño, y por eso, con el mapa repartido, la maquina no veia nada
 * que ganar aunque tuviera al rival al lado.
 */
export function distanciaATierraTomable(estado, jugadorId) {
  return distanciaHasta(
    estado,
    (t) => t.terreno !== 'water' && t.dueno !== jugadorId && !t.ciudad,
    transitablePara(jugadorId),
  );
}

/**
 * Distancia a la tierra SIN DUEÑO mas cercana. Es la brujula de quien no marcha
 * sobre el rival (`ofensiva: 'nunca'`): coloniza lo vacio y no navega hacia el
 * territorio ajeno, aunque la regla del juego ya le permita pisarlo.
 */
export function distanciaATierraLibre(estado, jugadorId) {
  return distanciaHasta(
    estado,
    (t) => t.terreno !== 'water' && !t.dueno,
    transitablePara(jugadorId),
  );
}

/**
 * Distancia a la ciudad enemiga alcanzable mas cercana. Es el objetivo
 * OFENSIVO: comer casillas sueltas mueve el porcentaje, pero solo tomar
 * ciudades elimina a alguien y libera su territorio entero.
 *
 * La ciudad enemiga es origen pero NO es camino: se llega hasta la casilla de
 * al lado y desde ahi se ataca.
 */
export function distanciaACiudadEnemiga(estado, jugadorId) {
  return distanciaHasta(
    estado,
    (t) => t.ciudad && t.dueno && t.dueno !== jugadorId,
    transitablePara(jugadorId),
  );
}

/**
 * Cuantas casillas de mar CONECTADAS hay a partir de (x, y), con corte
 * temprano: no interesa el tamano exacto del oceano, solo si llega al minimo.
 * Un mapa de 60x60 puede tener 1000 casillas de agua y contarlas todas en cada
 * decision de construccion seria caro al pedo.
 */
function tamanoDelMar(estado, x, y, tope) {
  const vistos = new Set([clave(x, y)]);
  const cola = [{ x, y }];
  for (let i = 0; i < cola.length && vistos.size < tope; i++) {
    for (const vecino of vecinosOrtogonales(estado, cola[i].x, cola[i].y)) {
      const k = clave(vecino.x, vecino.y);
      if (vecino.terreno !== 'water' || vistos.has(k)) continue;
      vistos.add(k);
      cola.push(vecino);
    }
  }
  return vistos.size;
}

// Si a la maquina le conviene poner un puerto en esta ciudad: tiene que tocar
// el mar Y ese mar tiene que dar para algo.
function puertoUtil(estado, x, y) {
  const mares = marAdyacente(estado, x, y);
  return mares.some((t) => tamanoDelMar(estado, t.x, t.y, MAR_MINIMO_PARA_PUERTO) >= MAR_MINIMO_PARA_PUERTO);
}

// Por donde navega este jugador: mar que no este ocupado por un buque
// enemigo. Es el espejo exacto de transitablePara, con el medio invertido.
const navegablePara = (jugadorId) => (t) =>
  t.terreno === 'water' &&
  !(t.ejercito && t.ejercito.dueno !== jugadorId);

/**
 * Distancia al buque enemigo mas cercano. Es el objetivo PREFERIDO de la
 * flota: mientras haya algo que hundir, el mar se disputa antes que la costa.
 */
export function distanciaABuqueEnemigo(estado, jugadorId) {
  return distanciaHasta(
    estado,
    (t) => t.terreno === 'water' && t.ejercito && t.ejercito.dueno !== jugadorId,
    navegablePara(jugadorId),
  );
}

/**
 * Distancia al mar pegado a una ciudad enemiga: desde ahi se la hostiga. El
 * origen es el MAR y no la ciudad, porque un buque no pisa tierra ni en el
 * BFS: si la ciudad fuera origen, la brujula prometeria un destino al que la
 * flota no puede llegar.
 *
 * Es el objetivo de RESPALDO. Sin el, una flota que ya limpio el mar se
 * quedaria flotando sin nada que hacer.
 */
export function distanciaACostaEnemiga(estado, jugadorId) {
  return distanciaHasta(
    estado,
    (t) => t.terreno === 'water' && vecinosOrtogonales(estado, t.x, t.y)
      .some((v) => v.ciudad && v.dueno && v.dueno !== jugadorId),
    navegablePara(jugadorId),
  );
}

/**
 * La tierra que vale la pena tomar y a la que NO se puede llegar caminando: el
 * disparador de toda la invasion.
 *
 * OJO con como se calcula, porque la primera version estaba mal y no invadia
 * nunca. Intentaba deducirlo de la brujula terrestre ("si no tiene distancia,
 * no hay camino"), y eso es falso: distanciaHasta SIEMBRA todos los origenes
 * con distancia 0, asi que las casillas tomables de la otra isla figuraban en
 * la brujula igual, con distancia 0, y este conjunto salia siempre vacio.
 *
 * Lo correcto es preguntar al reves: desde donde YA estoy (mis ciudades y mis
 * ejercitos), hasta donde puedo caminar. Lo tomable que quede afuera de ese
 * alcance es lo que hay que cruzar en barco.
 */
export function tierraInalcanzable(estado, jugadorId) {
  // Los origenes son de TIERRA, y el filtro `terreno !== 'water'` es lo unico
  // que hace que esto funcione: distanciaHasta siembra los origenes sin
  // mirar si son camino valido, asi que un buque propio parado en el mar se
  // convertia en origen y le regalaba distancia a la costa enemiga de al lado.
  // Resultado: el objetivo de la invasion se evaporaba JUSTO cuando el
  // transporte llegaba, que es el peor momento posible (medido: 9 casillas
  // objetivo en vez de 55).
  const alcanzable = distanciaHasta(
    estado,
    (t) => t.terreno !== 'water' &&
      ((t.ejercito && t.ejercito.dueno === jugadorId) || (t.ciudad && t.dueno === jugadorId)),
    transitablePara(jugadorId),
  );
  const fuera = new Set();
  for (const t of estado.mapa) {
    if (t.terreno === 'water' || t.dueno === jugadorId || t.ciudad) continue;
    if (!alcanzable.has(clave(t.x, t.y))) fuera.add(clave(t.x, t.y));
  }
  return fuera;
}

/**
 * Una casilla donde un transporte PUEDE bajar tropa de verdad: hay que
 * invadirla, no la ocupa nadie, y no es una ciudad enemiga.
 *
 * La usan la brujula de invasion Y la decision de desembarcar, y comparten esta
 * funcion a proposito. La primera version tenia dos criterios distintos (la
 * brujula miraba solo "es inalcanzable", la regla ademas exigia la casilla
 * libre) y el resultado fue un transporte anclado para siempre frente a una
 * playa defendida: su brujula le decia "llegaste" y la regla le decia "aca no".
 * Es exactamente el tipo de desacuerdo que un criterio compartido no permite.
 */
const esOrillaDeDesembarco = (jugadorId, inalcanzables) => (t) =>
  inalcanzables.has(clave(t.x, t.y)) &&
  !t.ejercito &&
  !(t.ciudad && t.dueno !== jugadorId);

/**
 * Distancia por MAR hasta una orilla donde se pueda desembarcar. Es la brujula
 * del transporte cargado.
 */
export function distanciaAInvasion(estado, jugadorId, inalcanzables) {
  const sirve = esOrillaDeDesembarco(jugadorId, inalcanzables);
  return distanciaHasta(
    estado,
    (t) => t.terreno === 'water' && vecinosOrtogonales(estado, t.x, t.y).some(sirve),
    navegablePara(jugadorId),
  );
}

/**
 * Distancia por TIERRA hasta un transporte propio con lugar: es como la tropa
 * encuentra el barco. Se eligio que la tropa camine hasta el barco y no al
 * reves porque el barco ya nace pegado al puerto, que es adonde la tropa sabe
 * volver; hacer que el barco vaya a buscar tropa exigiria una brujula mas y
 * coordinar dos unidades que se mueven a la vez.
 */
export function distanciaAEmbarque(estado, jugadorId) {
  const conLugar = (t) =>
    t.ejercito && t.ejercito.dueno === jugadorId && esTransporte(t.ejercito.tipo) &&
    (t.ejercito.carga?.length ?? 0) < CAPACIDAD_DE(t.ejercito.tipo);
  return distanciaHasta(
    estado,
    (t) => t.terreno !== 'water' && vecinosOrtogonales(estado, t.x, t.y).some(conLugar),
    transitablePara(jugadorId),
  );
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
    // El filtro de COSTA es del mismo tipo que el de tecnologia de arriba, y
    // por la misma razon exacta: `construir` rechaza el puerto en una ciudad
    // sin mar al lado, y como esta es la PRIMERA decision del turno, proponerlo
    // en una ciudad de tierra adentro se repetiria hasta agotar el tope de
    // fallos y dejaria a la maquina sin fundar, mover ni reclutar ese turno.
    // Es literalmente el bug de la universidad otra vez, con otro edificio.
    //
    // `puertoUtil` es mas estricto que la regla a proposito (exige ademas un
    // mar de tamano razonable): un puerto sobre un charco es legal y es plata
    // tirada. Ver MAR_MINIMO_PARA_PUERTO.
    const faltantes = perfil.ordenEdificios.filter((tipo) =>
      !tile.ciudad.edificios.includes(tipo) &&
      tieneTecnologiaRequerida(jugador, EDIFICIOS[tipo].requiereTecnologia) &&
      (!EDIFICIOS[tipo].requiereCosta || puertoUtil(estado, tile.x, tile.y)));
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
  // Solo la tropa de TIERRA cuenta contra este tope. Si los buques contaran,
  // cada barco seria un colono menos, y como el territorio se gana caminando
  // (ver reglas/movimiento.js), una maquina con armada se estaria suicidando
  // en la carrera por la dominacion. Los buques tienen su propio tope, chico,
  // en decidirReclutamientoNaval.
  const terrestres = ejercitosDe(estado, jugadorId).filter((t) => !esNaval(t.ejercito.tipo));
  if (terrestres.length >= ciudades.length + perfil.topeEjercitosExtra) return null;

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

/**
 * Botar un buque. Es una decision aparte de decidirReclutamiento y no una
 * entrada mas en `unidadesPrioridad`, porque su tope es independiente del de
 * tierra (ver el comentario alli).
 *
 * Las dos condiciones que pide `reclutar` (puerto construido, y una casilla de
 * mar libre donde botarlo) se comprueban ACA antes de proponer nada: una
 * decision que la regla va a rechazar gasta uno de los cinco fallos seguidos
 * que la maquina se permite antes de cerrar el turno.
 */
function decidirReclutamientoNaval(estado, jugadorId, perfil) {
  if (!perfil.topeBuques) return null;

  // Cuenta BUQUES DE GUERRA, no "todo lo naval": mientras conto lo naval, un
  // transporte vivo le comia el unico lugar de buque que tiene la dificultad
  // normal, y la maquina navegaba sin escolta. Medido: 1 buque en 20 partidas
  // de islas. Cada casco tiene su tope porque cumplen trabajos distintos.
  const buques = ejercitosDe(estado, jugadorId)
    .filter((t) => esNaval(t.ejercito.tipo) && !esTransporte(t.ejercito.tipo));
  if (buques.length >= perfil.topeBuques) return null;

  const jugador = jugadorPorId(estado, jugadorId);
  if (!puedePagar(jugador, UNIDADES.warship.costo)) return null;

  const puerto = ciudadesDe(estado, jugadorId).find((t) =>
    t.ciudad.edificios.includes('port') &&
    marAdyacente(estado, t.x, t.y).some((m) => !m.ejercito));
  if (!puerto) return null;

  return { tipo: 'reclutar', x: puerto.x, y: puerto.y, unidad: 'warship' };
}

/**
 * Botar un transporte, y SOLO si hay algo que invadir: un transporte sin
 * destino es madera tirada. Por eso depende de la brujula, no del tope a secas.
 */
function decidirTransporte(estado, jugadorId, perfil, brujulas) {
  if (!perfil.topeTransportes) return null;
  if (!brujulas.inalcanzables || brujulas.inalcanzables.size === 0) return null;

  const flota = ejercitosDe(estado, jugadorId).filter((t) => esTransporte(t.ejercito.tipo));
  if (flota.length >= perfil.topeTransportes) return null;

  const jugador = jugadorPorId(estado, jugadorId);
  if (!puedePagar(jugador, UNIDADES.transport.costo)) return null;

  const puerto = ciudadesDe(estado, jugadorId).find((t) =>
    t.ciudad.edificios.includes('port') &&
    marAdyacente(estado, t.x, t.y).some((m) => !m.ejercito));
  if (!puerto) return null;

  return { tipo: 'reclutar', x: puerto.x, y: puerto.y, unidad: 'transport' };
}

/**
 * Bajar tropa en la orilla enemiga. Va ANTES que embarcar en el orden del
 * turno: terminar una invasion vale mas que empezar otra.
 */
function decidirDesembarco(estado, jugadorId, brujulas) {
  if (!brujulas.inalcanzables || brujulas.inalcanzables.size === 0) return null;
  for (const tile of ejercitosDe(estado, jugadorId)) {
    const barco = tile.ejercito;
    if (!esTransporte(barco.tipo) || !(barco.carga?.length > 0)) continue;
    if (barco.carga[barco.carga.length - 1].movimientoRestante <= 0) continue;
    // La orilla que justifica la travesia (mismo criterio que la brujula).
    const orilla = vecinosOrtogonales(estado, tile.x, tile.y)
      .find(esOrillaDeDesembarco(jugadorId, brujulas.inalcanzables));
    if (orilla) {
      return { tipo: 'desembarcar', desde: { x: tile.x, y: tile.y }, hasta: { x: orilla.x, y: orilla.y } };
    }
  }
  return null;
}

/**
 * Subir tropa al transporte, pero SOLO si esa tropa no tiene nada que hacer por
 * tierra. Sin esa condicion la maquina embarcaria a sus colonos mientras todavia
 * le queda continente por tomar, que es tirar la partida: el territorio se gana
 * caminando.
 */
function decidirEmbarque(estado, jugadorId, brujulas) {
  if (!brujulas.inalcanzables || brujulas.inalcanzables.size === 0) return null;
  for (const tile of ejercitosDe(estado, jugadorId)) {
    const tropa = tile.ejercito;
    if (esNaval(tropa.tipo) || tropa.movimientoRestante <= 0) continue;
    // Si su brujula terrestre todavia le ofrece algo, que siga caminando.
    if (brujulas.tomable.has(clave(tile.x, tile.y))) continue;
    const barco = vecinosOrtogonales(estado, tile.x, tile.y).find((t) =>
      t.ejercito && t.ejercito.dueno === jugadorId && esTransporte(t.ejercito.tipo) &&
      (t.ejercito.carga?.length ?? 0) < CAPACIDAD_DE(t.ejercito.tipo));
    if (barco) {
      return { tipo: 'embarcar', desde: { x: tile.x, y: tile.y }, hasta: { x: barco.x, y: barco.y } };
    }
  }
  return null;
}

// De un grupo de casillas empatadas, la que deja mas cerca del objetivo. Si el
// objetivo preferido no es alcanzable desde ninguna (p.ej. no hay ninguna ciudad
// enemiga a la que llegar), cae a la brujula de respaldo; si tampoco, sortea,
// que era el comportamiento anterior: la brujula solo agrega criterio donde no
// habia ninguno.
function masCercaSegun(candidatas, brujulaPreferida, brujulaRespaldo, rng) {
  for (const brujula of [brujulaPreferida, brujulaRespaldo]) {
    if (!brujula) continue;
    const distancias = candidatas.map((t) => brujula.get(clave(t.x, t.y)) ?? Infinity);
    const menor = Math.min(...distancias);
    if (menor !== Infinity) {
      return elegir(rng, candidatas.filter((t, i) => distancias[i] === menor));
    }
  }
  return elegir(rng, candidatas);
}

function decidirMilitar(estado, jugadorId, rng, perfil, brujulas) {
  const ejercitos = ejercitosDe(estado, jugadorId);
  for (const [indice, origen] of ejercitos.entries()) {
    if (origen.ejercito.movimientoRestante <= 0) continue;
    // Un buque juega el MISMO bucle que la tropa de tierra (elegir objetivo,
    // decidir si conviene atacar, si no moverse hacia algo), con dos
    // diferencias: por donde puede pasar, y hacia donde apunta su brujula.
    const naval = esNaval(origen.ejercito.tipo);
    const transporte = esTransporte(origen.ejercito.tipo);
    const cargado = transporte && (origen.ejercito.carga?.length ?? 0) > 0;
    // Un transporte VACIO no se mueve: espera junto al puerto a que la tropa
    // llegue caminando. Si vagara por el mar, la tropa que lo busca nunca lo
    // alcanzaria, porque su brujula de embarque apunta a donde el barco esta
    // ahora, no a donde va a estar.
    if (transporte && !cargado) continue;
    const vecinos = vecinosOrtogonales(estado, origen.x, origen.y);

    // Contra QUE pelear cuando hay mas de una opcion al lado. Antes se tomaba el
    // primer vecino enemigo en orden fijo (arriba, abajo, izquierda, derecha),
    // asi que con un soldado enemigo arriba y una ciudad indefensa abajo, la
    // maquina peleaba contra el soldado. Medido en una partida trabada: de 1450
    // combates, solo 19 fueron contra una ciudad, mientras 30 de las 35 ciudades
    // del mapa estaban SIN guarnicion, o sea listas para tomar.
    //
    // Matar un ejercito en campo abierto no cambia el mapa. Tomar una ciudad da
    // la ciudad, su anillo entero (ver reglas/combate.js) y, si era la ultima
    // del rival, lo elimina y libera todo su territorio.
    const prioridadObjetivo = (t) => {
      const ciudadEnemiga = t.ciudad && t.dueno !== jugadorId;
      const ejercitoEnemigo = t.ejercito && t.ejercito.dueno !== jugadorId;
      if (ciudadEnemiga && !ejercitoEnemigo) return 3; // se captura de una
      if (ciudadEnemiga) return 2;                     // primero la guarnicion
      if (ejercitoEnemigo) return 1;                   // no mueve el mapa
      return 0;
    };
    // El transporte no pelea (ataque 0): su unico trabajo es llegar y bajar
    // tropa, y `atacar` lo rechazaria de todos modos.
    const objetivos = transporte ? [] : vecinos.filter((t) => prioridadObjetivo(t) > 0);
    const objetivo = objetivos.length
      ? objetivos.reduce((mejor, t) => (prioridadObjetivo(t) > prioridadObjetivo(mejor) ? t : mejor))
      : undefined;
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

    // Mismo criterio que reglas/movimiento.js, no una copia de la regla vieja:
    // solo lo DEFENDIDO (ejercito o ciudad ajena) hay que atacarlo; la tierra
    // ajena suelta se toma entrando. Mientras esta lista siguio filtrando toda
    // casilla con dueño ajeno, la maquina no podia cruzar la frontera aunque la
    // regla ya se lo permitiera: caminaba solo por lo suyo.
    const transitables = vecinos.filter((t) =>
      (naval ? t.terreno === 'water' : t.terreno !== 'water') &&
      !(t.ejercito && t.ejercito.dueno !== jugadorId) &&
      !(t.ciudad && t.dueno && t.dueno !== jugadorId) &&
      !(t.ejercito && t.ejercito.dueno === jugadorId));
    if (transitables.length === 0) continue;

    // A donde caminar. La victoria por dominacion se mide en casillas
    // CONTROLADAS, y desde que la frontera es permeable hay DOS formas de ganar
    // una: pisar tierra de nadie, o pisarle una al rival. Quitarsela al rival
    // vale mas (el porcentaje se mueve el doble: uno sube y el otro baja);
    // despues la tierra libre; explorar suma un poco (abre mapa); pisar lo
    // propio no suma nada y es el ultimo recurso.
    // Cuanto vale la casilla ajena depende de la agresividad del perfil. Para
    // una IA ofensiva vale MAS que la tierra libre (el porcentaje se mueve el
    // doble: uno sube y el otro baja). Para una que no marcha sobre nadie
    // (facil) vale MENOS: si la tiene al lado la toma, pero prefiere colonizar.
    // Sin esta distincion, darle valor a la casilla enemiga volvia agresivas a
    // las tres dificultades y la escala facil < normal < dificil se rompia.
    const valorAjena = perfil.ofensiva === 'nunca' ? 1 : 3;
    // En el mar no hay dueño ni territorio que ganar (ver docs/adr/0002), asi
    // que para un buque TODAS las casillas valen lo mismo y quien decide es la
    // brujula, entera. Si se le dejara el puntaje terrestre, el bono por
    // casilla sin descubrir ganaria siempre y la flota se iria a explorar en
    // vez de ir a donde esta el enemigo.
    const puntajeDestino = (t) =>
      naval ? 0 : (t.dueno === jugadorId ? 0 : t.dueno ? valorAjena : 2) +
      (t.descubiertoPor.includes(jugadorId) ? 0 : 1);
    const mejorPuntaje = Math.max(...transitables.map(puntajeDestino));
    const mejores = transitables.filter((t) => puntajeDestino(t) === mejorPuntaje);
    // Desempate por brujula. Sin esto, cuando todos los vecinos empatan (el caso
    // normal: un ejercito enterrado en el medio del territorio propio, donde todo
    // vale 0) la eleccion era al azar, y los ejercitos deambulaban por lo suyo
    // hasta tropezarse con la frontera de casualidad. Medido: 11 de 12 ejercitos
    // rodeados de casillas propias con 109 casillas libres alcanzables.
    // Cual de las dos brujulas manda lo decide la agresividad del perfil: la
    // ofensiva apunta a la ciudad enemiga (tomarla es lo unico que elimina a
    // alguien y libera su territorio entero), la otra a la casilla mas cercana
    // que se pueda tomar.
    // Quien marcha sobre la ciudad enemiga y quien sigue tomando tierra. La
    // dificultad que presiona DESDE EL PRINCIPIO manda solo la mitad de su
    // fuerza (los de indice par): mandarlos a todos la volvia mas lenta que
    // normal contra un rival pasivo, porque abandonaba la colonizacion para
    // marchar sobre una capital que no la amenazaba (medido: ganaba en el turno
    // 56-64 contra 31-41 de normal). La que solo ataca cuando se le acabo la
    // tierra libre va con todo: ya no le queda nada que colonizar.
    const marchaSobreCiudad = brujulas.ofensiva &&
      (perfil.ofensiva === 'sinTierraLibre' || indice % 2 === 0);
    // La flota busca primero al buque enemigo y, si no hay ninguno, va a
    // castigar la costa. Sin esa segunda mitad una flota sin rival se queda
    // flotando sin hacer nada, que es el bug ya medido una vez con los
    // ejercitos de tierra (11 de 12 rodeados de casillas propias).
    // Un transporte cargado va a la orilla que hay que invadir. Una tropa a la
    // que la brujula terrestre ya no le ofrece nada (tipico: se quedo sin
    // continente) camina hacia el transporte para cruzar.
    const sinObjetivoTerrestre = !brujulas.tomable.has(clave(origen.x, origen.y));
    const preferida = naval
      ? (cargado ? brujulas.invasion : brujulas.buqueEnemigo)
      : (sinObjetivoTerrestre && brujulas.embarque
        ? brujulas.embarque
        : (marchaSobreCiudad ? brujulas.ofensiva : brujulas.tomable));
    const respaldo = naval ? brujulas.costaEnemiga : brujulas.tomable;
    const destino = mejores.length === 1
      ? mejores[0]
      : masCercaSegun(mejores, preferida, respaldo, rng);
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

function decidirAccion(estado, jugadorId, rng, perfil, fundacionesEsteTurno, brujulas) {
  // Fundar va ANTES que reclutar: mientras fue lo ultimo, cualquier edificio o
  // unidad pagable se comia los recursos primero y la maquina casi nunca
  // llegaba a una segunda ciudad. Una ciudad nueva reclama casilla, produce, y
  // sube el tope de ejercitos (que es el que limita cuanto puede reclamar).
  return decidirInvestigacion(estado, jugadorId, perfil) ??
    decidirConstruccion(estado, jugadorId, perfil) ??
    decidirFundacion(estado, jugadorId, rng, perfil, fundacionesEsteTurno) ??
    decidirReclutamiento(estado, jugadorId, perfil) ??
    decidirReclutamientoNaval(estado, jugadorId, perfil) ??
    decidirTransporte(estado, jugadorId, perfil, brujulas) ??
    decidirDesembarco(estado, jugadorId, brujulas) ??
    decidirEmbarque(estado, jugadorId, brujulas) ??
    decidirMilitar(estado, jugadorId, rng, perfil, brujulas) ??
    decidirMejoraCiudad(estado, jugadorId, perfil) ??
    null;
}

const EJECUTORES = {
  construir: (estado, jugadorId, a) => construir(estado, jugadorId, a),
  reclutar: (estado, jugadorId, a) => reclutar(estado, jugadorId, a),
  moverEjercito: (estado, jugadorId, a) => moverEjercito(estado, jugadorId, a),
  atacar: (estado, jugadorId, a, rng) => atacar(estado, jugadorId, a, rng),
  embarcar: (estado, jugadorId, a) => embarcar(estado, jugadorId, a),
  desembarcar: (estado, jugadorId, a) => desembarcar(estado, jugadorId, a),
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

    // Las brujulas se recalculan en CADA paso, no una vez por turno: el propio
    // ejercito que acaba de reclamar una casilla cambia el mapa de distancias
    // para el siguiente. Son BFS sobre el mapa entero, baratos al lado de lo que
    // cuesta equivocarse de rumbo.
    // Una IA que no marcha sobre el rival navega solo hacia la tierra libre; el
    // resto, hacia cualquier casilla que pueda tomar (libre o ajena).
    const tomable = perfil.ofensiva === 'nunca'
      ? distanciaATierraLibre(estado, jugadorId)
      : distanciaATierraTomable(estado, jugadorId);
    const enModoOfensivo = perfil.ofensiva === 'siempre' ||
      (perfil.ofensiva === 'sinTierraLibre' && !quedaTierraSinDueno(estado));
    // La brujula ofensiva se calcula solo si hace falta: es un BFS de mas.
    // Las brujulas navales solo se calculan si esta maquina TIENE flota: son
    // dos BFS mas por paso, y la enorme mayoria de las partidas se juegan sin
    // un solo buque. `masCercaSegun` ya ignora una brujula nula.
    const tieneFlota = estado.mapa.some(
      (t) => t.ejercito && t.ejercito.dueno === jugadorId && esNaval(t.ejercito.tipo));
    // Tierra que vale la pena y a la que no se llega caminando: es lo que
    // justifica una invasion. Sale de la brujula terrestre que ya se calculo,
    // asi que no cuesta un BFS extra; las de invasion si, y por eso solo se
    // calculan cuando esa tierra existe.
    const inalcanzables = perfil.topeTransportes ? tierraInalcanzable(estado, jugadorId) : new Set();
    const hayQueCruzar = inalcanzables.size >= TIERRA_MINIMA_PARA_INVADIR;
    const brujulas = {
      tomable,
      ofensiva: enModoOfensivo ? distanciaACiudadEnemiga(estado, jugadorId) : null,
      buqueEnemigo: tieneFlota ? distanciaABuqueEnemigo(estado, jugadorId) : null,
      costaEnemiga: tieneFlota ? distanciaACostaEnemiga(estado, jugadorId) : null,
      // Vacio cuando no vale la pena cruzar: asi decidirTransporte,
      // decidirEmbarque y decidirDesembarco se apagan todos con una sola
      // condicion, en vez de repetir el umbral en cada uno.
      inalcanzables: hayQueCruzar ? inalcanzables : new Set(),
      invasion: hayQueCruzar ? distanciaAInvasion(estado, jugadorId, inalcanzables) : null,
      embarque: hayQueCruzar ? distanciaAEmbarque(estado, jugadorId) : null,
    };
    const decision = decidirAccion(estado, jugadorId, rng, perfil, fundacionesEsteTurno, brujulas);
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
