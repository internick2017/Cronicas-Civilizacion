import {
  GOBIERNOS, FORMAS_ESTADO, GRUPOS_DE_APOYO, APOYO_INICIAL, RESPETO, ESPERANZA_DE_VIDA_TURNOS,
  PREFERENCIAS, PESO_PREFERENCIA, PESO_APOYO, ORO_A_VOTOS, UMBRAL_APROBACION, ENFRIAMIENTO_VOTO,
  ORO_POR_PUNTO_APOYO, VARIACION_APOYO_POR_RONDA, BAJADA_APOYO_POR_RONDA, PISO_APOYO_POR_TERRITORIO,
  RECUPERACION_APOYO_SIN_PODER, BONO_PRODUCCION_GOBIERNO, PROBABILIDAD_CRISIS, UMBRAL_EXPULSION,
  UMBRAL_REGRESO_MILITAR, UMBRAL_ELECCION, BONO_PRODUCCION_REPUBLICA,
} from '../constantes.js';
import { jugadorPorId, puedePagar } from '../MapGame.js';
import { ReglaError } from '../errores.js';
import { evento } from './comun.js';
import { controlTerritorial } from './dominacion.js';
import { caidaApoyoPueblo } from './efectosProblemas.js';

// Toda lectura de los campos de gobierno pasa por estos accesores: una partida
// guardada antes de que existieran no los trae, y se cae al valor por defecto
// en vez de romper (mismo criterio que tecnologiasDe / rasgosDe).
export const gobiernoDe = (jugador) =>
  (Object.hasOwn(GOBIERNOS, jugador?.gobierno) ? jugador.gobierno : 'despotismo');

export const formaEstadoDe = (jugador) =>
  (FORMAS_ESTADO.includes(jugador?.formaEstado) ? jugador.formaEstado : 'unitario');

export const estaEnPoder = (jugador) => jugador?.enPoder !== false;

export function apoyoDe(jugador) {
  const guardado = jugador?.apoyo ?? {};
  return Object.fromEntries(GRUPOS_DE_APOYO.map(g => [g, guardado[g] ?? APOYO_INICIAL]));
}

// El respeto del gobierno se suma al LEER, no se guarda.
export function apoyoEfectivo(jugador, grupo) {
  const base = apoyoDe(jugador)[grupo] + (RESPETO[gobiernoDe(jugador)]?.[grupo] ?? 0);
  return Math.max(0, Math.min(100, base));
}

export const probabilidadSucesion = (esperanza = ESPERANZA_DE_VIDA_TURNOS) => 1 / esperanza;

const acotar = (n) => Math.max(0, Math.min(100, n));

// Las acciones de gobierno NO exigen que sea tu turno (a diferencia de las del
// mapa): quien perdio el poder no recibe turnos propios, porque los juega la
// maquina, y tiene que poder igual recuperarlo desde el boton.
function jugadorDeGobierno(estado, jugadorId) {
  if (estado.estado !== 'jugando') throw new ReglaError('PARTIDA_NO_ACTIVA', 'La partida no está activa');
  const jugador = jugadorPorId(estado, jugadorId);
  if (!jugador) throw new ReglaError('JUGADOR_DESCONOCIDO', `Jugador desconocido: ${jugadorId}`);
  return jugador;
}

// Los grupos que votan segun QUIEN decide en el gobierno actual. `jugador`
// (despotismo y monarquia) no tiene votacion: manda el propio jugador.
function gruposQueVotan(gobierno) {
  const { electorado } = GOBIERNOS[gobierno];
  if (electorado === 'jugador') return [];
  if (electorado === 'mixto') return ['pueblo', 'lideres'];
  return [electorado];
}

// Puro y determinista. Cada grupo da un porcentaje: 40% su apoyo al jugador,
// 60% si prefiere lo propuesto a lo actual ("principalmente" eso, segun el
// usuario), mas el oro ofrecido. Con dos grupos (semidirecta) se promedian.
export function resultadoVotacion(estado, jugadorId, nuevoGobierno, oro = 0) {
  const jugador = jugadorDeGobierno(estado, jugadorId);
  const actual = gobiernoDe(jugador);
  const grupos = gruposQueVotan(actual);
  if (grupos.length === 0) return { aprobada: true, porcentaje: 100 };

  const porGrupo = grupos.map((grupo) => {
    const diferencia = PREFERENCIAS[grupo][nuevoGobierno] - PREFERENCIAS[grupo][actual];
    const preferencia = acotar(50 + diferencia / 2);
    return acotar(PESO_APOYO * apoyoEfectivo(jugador, grupo) + PESO_PREFERENCIA * preferencia + oro * ORO_A_VOTOS);
  });
  const porcentaje = porGrupo.reduce((a, b) => a + b, 0) / porGrupo.length;
  return { aprobada: porcentaje >= UMBRAL_APROBACION, porcentaje };
}

function validarOro(jugador, oro) {
  if (!Number.isInteger(oro) || oro < 0) throw new ReglaError('ORO_INVALIDO', 'El oro debe ser un entero positivo');
  if (!puedePagar(jugador, { gold: oro })) throw new ReglaError('RECURSOS_INSUFICIENTES', 'Recursos insuficientes');
}

export function proponerGobierno(estado, jugadorId, { gobierno, oro = 0 }) {
  // `oro` se reasigna mas abajo; viene por destructuring, que lo permite.
  const jugador = jugadorDeGobierno(estado, jugadorId);
  if (!estaEnPoder(jugador)) throw new ReglaError('SIN_PODER', 'No tenés el poder para proponer un cambio');
  // hasOwn y no `in`: `in` aceptaria 'toString' o 'constructor' como gobierno.
  if (!Object.hasOwn(GOBIERNOS, gobierno)) throw new ReglaError('GOBIERNO_INVALIDO', 'Gobierno inválido');
  if (gobierno === gobiernoDe(jugador)) throw new ReglaError('GOBIERNO_IGUAL', 'Ya tenés ese gobierno');
  if ((jugador.cambioBloqueadoHasta ?? 0) > estado.turno) {
    throw new ReglaError('EN_ENFRIAMIENTO', `No podés volver a proponer hasta el turno ${jugador.cambioBloqueadoHasta}`);
  }
  // Todas las validaciones van ANTES de emitir: un rechazo nunca gasta oro.
  validarOro(jugador, oro);

  // Donde nadie vota (despotismo, monarquia) no hay votos que comprar: el oro
  // ofrecido no se gasta.
  if (gruposQueVotan(gobiernoDe(jugador)).length === 0) oro = 0;

  const eventos = [];
  if (oro > 0) eventos.push(evento('RecursosGastados', estado, jugadorId, { costo: { gold: oro } }));
  const { aprobada } = resultadoVotacion(estado, jugadorId, gobierno, oro);
  eventos.push(aprobada
    ? evento('GobiernoCambiado', estado, jugadorId, { gobierno })
    : evento('VotacionFallida', estado, jugadorId, { gobierno, hastaTurno: estado.turno + ENFRIAMIENTO_VOTO }));
  return eventos;
}

export function cambiarFormaEstado(estado, jugadorId, { formaEstado }) {
  const jugador = jugadorDeGobierno(estado, jugadorId);
  if (!estaEnPoder(jugador)) throw new ReglaError('SIN_PODER', 'No tenés el poder para cambiar la forma de Estado');
  if (!FORMAS_ESTADO.includes(formaEstado)) throw new ReglaError('FORMA_ESTADO_INVALIDA', 'Forma de Estado inválida');
  return [evento('FormaEstadoCambiada', estado, jugadorId, { formaEstado })];
}

// "Conquistar votos": no se paga una votacion, se gana apoyo dando ventajas.
export function darVentajas(estado, jugadorId, { grupo, oro }) {
  const jugador = jugadorDeGobierno(estado, jugadorId);
  if (!GRUPOS_DE_APOYO.includes(grupo)) throw new ReglaError('GRUPO_INVALIDO', 'Grupo inválido');
  if (!Number.isInteger(oro) || oro < ORO_POR_PUNTO_APOYO) {
    throw new ReglaError('ORO_INVALIDO', `El mínimo son ${ORO_POR_PUNTO_APOYO} de oro`);
  }
  validarOro(jugador, oro);
  const apoyo = apoyoDe(jugador);
  apoyo[grupo] = acotar(apoyo[grupo] + Math.floor(oro / ORO_POR_PUNTO_APOYO));
  return [
    evento('RecursosGastados', estado, jugadorId, { costo: { gold: oro } }),
    evento('ApoyoActualizado', estado, jugadorId, { apoyo }),
  ];
}

const esRepublica = (jugador) => gobiernoDe(jugador).startsWith('republica_');

// Cuanto multiplica el gobierno la produccion de UN recurso. Las republicas
// gobiernan con lideres elegidos que "pueden mejorar el pais" (palabras del
// usuario): +10% a todo. Monarquia y estratocracia suman el suyo (constantes.js).
// turnos.js lo aplica AL FINAL, sobre el total ya sumado.
export function multiplicadorProduccion(jugador, recurso) {
  const gobierno = gobiernoDe(jugador);
  const republica = esRepublica(jugador) ? BONO_PRODUCCION_REPUBLICA : 0;
  return 1 + republica + (BONO_PRODUCCION_GOBIERNO[gobierno]?.[recurso] ?? 0);
}

// Quien tiene que sostenerte en el cargo: el grupo del electorado de tu
// gobierno (el promedio de pueblo y lideres en la semidirecta).
function apoyoDelElectorado(jugador) {
  const grupos = gruposQueVotan(gobiernoDe(jugador));
  if (grupos.length === 0) return 100;
  return grupos.reduce((suma, g) => suma + apoyoEfectivo(jugador, g), 0) / grupos.length;
}

// A los lideres (o, en la estratocracia, a los militares) les molesta que
// los trates mal: si te ven raro, te expulsan.
const grupoQueExpulsa = (jugador) => (gobiernoDe(jugador) === 'estratocracia' ? 'militares' : 'lideres');

// Cuanto mas desprotegido el grupo mas flojo, mas probable la crisis.
const probabilidadDeCrisis = (jugador) =>
  PROBABILIDAD_CRISIS * (1 - Math.min(...GRUPOS_DE_APOYO.map(g => apoyoEfectivo(jugador, g))) / 100);

// Una pasada por ronda para cada jugador HUMANO activo (los bots quedan fuera:
// no tienen gobierno que perder). Puro: el azar viene por parametro. Devuelve
// eventos; terminarTurno los empuja antes de RondaCompletada.
export function cerrarRondaGobierno(estado, rng) {
  const eventos = [];
  // Quien no tiene ciudades se elimina en este mismo cierre (ver terminarTurno):
  // no cuenta para el promedio ni recibe cambios de gobierno.
  const activos = estado.jugadores.filter(j => j.activo && estado.mapa.some(t => t.ciudad && t.dueno === j.id));
  const territorio = (j) => controlTerritorial(estado, j.id).porcentaje;

  for (const jugador of activos) {
    if (jugador.esBot) continue;

    // 1. El apoyo sube o baja segun si vas mejor o peor que los demas. Sube
    // rapido y baja despacio (con piso), y quien no manda recupera un poco
    // hacia el punto de partida: sin esto el que va perdiendo se hunde sin
    // vuelta. Sin rivales con quien compararse no hay nada que ganar ni perder.
    const otros = activos.filter(j => j.id !== jugador.id);
    const promedio = otros.length > 0 ? otros.reduce((s, j) => s + territorio(j), 0) / otros.length : 0;
    const propio = territorio(jugador);
    const apoyoAntes = apoyoDe(jugador);
    const apoyo = { ...apoyoAntes };
    for (const g of GRUPOS_DE_APOYO) {
      if (otros.length > 0 && propio > promedio) apoyo[g] = acotar(apoyo[g] + VARIACION_APOYO_POR_RONDA);
      else if (otros.length > 0 && propio < promedio) {
        // Nunca baja de PISO por territorio, pero si ya estaba mas abajo no lo sube.
        apoyo[g] = Math.max(apoyo[g] - BAJADA_APOYO_POR_RONDA, Math.min(apoyo[g], PISO_APOYO_POR_TERRITORIO));
      }
      if (!estaEnPoder(jugador) && apoyo[g] < APOYO_INICIAL) {
        apoyo[g] = Math.min(APOYO_INICIAL, apoyo[g] + RECUPERACION_APOYO_SIN_PODER);
      }
    }
    // Un problema de pobreza activo (Estado federal) erosiona el apoyo del pueblo.
    apoyo.pueblo = acotar(apoyo.pueblo - caidaApoyoPueblo(jugador));
    if (GRUPOS_DE_APOYO.some(g => apoyo[g] !== apoyoAntes[g])) {
      eventos.push(evento('ApoyoActualizado', estado, jugador.id, { apoyo }));
    }
    // El resto de la pasada decide con el apoyo ya actualizado, aunque el
    // evento todavia no se haya aplicado.
    const j = { ...jugador, apoyo };
    const gobierno = gobiernoDe(j);
    const haceElecciones = esRepublica(j) && estado.turno % (estado.config.rondasEntreElecciones ?? 8) === 0;

    if (estaEnPoder(j)) {
      if (gobierno === 'despotismo') continue; // el despota no se pierde
      let motivo = null;
      if (apoyoEfectivo(j, grupoQueExpulsa(j)) < UMBRAL_EXPULSION) motivo = 'expulsion';
      else if (haceElecciones && apoyoDelElectorado(j) < UMBRAL_ELECCION) motivo = 'eleccion';
      else if (gobierno === 'monarquia' && rng() < probabilidadSucesion()) motivo = 'sucesion';
      else if (rng() < probabilidadDeCrisis(j)) motivo = 'crisis';
      if (motivo) eventos.push(evento('PoderPerdido', estado, jugador.id, { motivo }));
    } else {
      let motivo = null;
      if (gobierno === 'despotismo') motivo = 'regreso';
      else if (gobierno === 'monarquia') motivo = rng() < probabilidadSucesion() ? 'sucesion' : null;
      else if (gobierno === 'estratocracia') motivo = apoyoEfectivo(j, 'militares') >= UMBRAL_REGRESO_MILITAR ? 'apoyo' : null;
      else if (haceElecciones) motivo = apoyoDelElectorado(j) >= UMBRAL_ELECCION ? 'eleccion' : null;
      if (motivo) eventos.push(evento('PoderRecuperado', estado, jugador.id, { motivo }));
    }
  }
  return eventos;
}
