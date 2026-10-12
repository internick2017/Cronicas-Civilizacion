import { PRODUCCION_BASE_CIUDAD, BONO_TERRENO_PRODUCCION, EDIFICIOS, PORCENTAJE_VICTORIA_DOMINACION } from '../constantes.js';
import { tileEn } from '../MapGame.js';
import { recursoApagado } from './modo.js';
import { validarTurno, evento, esSimultaneo, listosDe } from './comun.js';
import { produccionPorRasgos } from './cultura.js';
import { aplicarBonosPorcentuales } from './tecnologia.js';
import { controlTerritorial } from './dominacion.js';
import { bandosDe } from './bandos.js';
import { recuperarFronteras } from './fronteras.js';
import { estaSaqueada } from './saqueo.js';
import { crearRng } from '../rng.js';
import { aplicar } from '../aplicar.js';
import { cerrarRondaGobierno, multiplicadorProduccion } from './gobierno.js';
import { administrarSubdivisiones } from './subdivisiones.js';
import { cerrarRondaProblemas } from './problemas.js';
import { factorProduccionCiudad, perdidaFijaOro, consumoExtraComida } from './efectosProblemas.js';

export function siguienteIndiceActivo(estado, excluirIds = null) {
  const n = estado.jugadores.length;
  let idx = estado.indiceJugadorActual;
  for (let i = 0; i < n; i++) {
    idx = (idx + 1) % n;
    const jugador = estado.jugadores[idx];
    if (jugador.activo && !excluirIds?.has(jugador.id)) return idx;
  }
  return estado.indiceJugadorActual;
}

function ciudadesDe(estado, jugadorId) {
  return estado.mapa.filter(t => t.ciudad && t.dueno === jugadorId);
}

// Exportada para que la vista pueda MOSTRAR el rendimiento por turno sin
// duplicar la formula: el numero que ve el jugador sale del mismo calculo que
// despues le suma los recursos (ver visibilidad.js#vistaJugadorPublica).
function produccionBruta(estado, jugadorId) {
  const produccion = {};
  const acumular = (recurso, cantidad) => {
    if (recursoApagado(estado, recurso)) return;
    produccion[recurso] = (produccion[recurso] ?? 0) + cantidad;
  };
  // Los rasgos culturales rinden POR ciudad, igual que el terreno y los
  // edificios: valen para las ciudades que ya tenias y para las que fundes.
  const jugador = estado.jugadores.find(j => j.id === jugadorId);
  const porRasgos = produccionPorRasgos(jugador);
  for (const tile of ciudadesDe(estado, jugadorId)) {
    // Los problemas sociales activos (federal) bajan lo que rinde ESTA ciudad.
    const acumularEn = (recurso, cantidad) =>
      acumular(recurso, cantidad * factorProduccionCiudad(jugador, tile.x, tile.y, recurso));
    // Una ciudad saqueada no produce nada hasta que se le pasa el cerco (ver
    // reglas/saqueo.js). Sigue contando como ciudad: no se pierde ni deja de
    // sostener al jugador en pie.
    if (estaSaqueada(tile.ciudad, estado.turno)) continue;
    for (const [recurso, cantidad] of Object.entries(PRODUCCION_BASE_CIUDAD)) acumularEn(recurso, cantidad);
    for (const [recurso, cantidad] of Object.entries(porRasgos)) acumularEn(recurso, cantidad);
    const bono = BONO_TERRENO_PRODUCCION[tile.terreno] ?? {};
    for (const [recurso, cantidad] of Object.entries(bono)) acumularEn(recurso, cantidad);
    for (const edificio of tile.ciudad.edificios) {
      const produccionEdificio = EDIFICIOS[edificio]?.produccion ?? {};
      for (const [recurso, cantidad] of Object.entries(produccionEdificio)) acumularEn(recurso, cantidad);
    }
  }
  // Corrupcion e inmigracion restan una cantidad FIJA (no un porcentaje).
  if (perdidaFijaOro(jugador) > 0) acumular('gold', -perdidaFijaOro(jugador));
  if (consumoExtraComida(jugador) > 0) acumular('food', -consumoExtraComida(jugador));

  // Los bonos porcentuales de tecnologia (irrigacion, mineria) se aplican AL
  // FINAL, sobre el total ya sumado: un 20% de "toda tu comida" tiene que
  // contar el terreno, los edificios Y los rasgos, no solo la base.
  return aplicarBonosPorcentuales(produccion, jugador);
}

// Lo que rinde de verdad cada ronda: la produccion bruta por el multiplicador
// del gobierno, con el DECIMAL que sobra llevado a la ronda siguiente
// (`jugador.restoProduccion`). Sin ese resto, 3 de oro x 1,1 = 3,3 se redondeaba
// a 3 todos los turnos y el bono desaparecia con valores chicos.
// Devuelve `resto` (lo que queda despues de este turno) para que viaje EN el
// evento RecursosProducidos y aplicar.js lo guarde. Puro: no toca el estado.
export function produccionConResto(estado, jugadorId) {
  const jugador = estado.jugadores.find(j => j.id === jugadorId);
  const bruta = produccionBruta(estado, jugadorId);
  const previo = jugador?.restoProduccion ?? {};
  const produccion = {};
  const resto = {};
  for (const [recurso, valor] of Object.entries(bruta)) {
    const factor = multiplicadorProduccion(jugador, recurso);
    // Un valor fraccionario (por un problema social) tambien lleva su decimal al turno siguiente.
    if (factor === 1 && Number.isInteger(valor)) { produccion[recurso] = valor; continue; }
    const exacto = valor * factor + (previo[recurso] ?? 0);
    const entero = Math.floor(exacto + 1e-9);
    produccion[recurso] = entero;
    resto[recurso] = Math.max(0, exacto - entero);
  }
  return { produccion, resto };
}

// Exportada para que la vista pueda MOSTRAR el rendimiento por turno sin
// duplicar la formula: el numero que ve el jugador sale del mismo calculo que
// despues le suma los recursos (ver visibilidad.js#vistaJugadorPublica).
export const producirParaJugador = (estado, jugadorId) => produccionConResto(estado, jugadorId).produccion;

// Exportada para que abandonar() use la MISMA evaluacion: si el que se va deja
// a un solo jugador en pie, la partida tiene que terminar igual que si lo
// hubieran eliminado peleando.
export function evaluarVictoria(estado, jugadorId, activosPostEliminacion, turnoCierre) {
  if (activosPostEliminacion.length === 0) {
    return evento('PartidaTerminada', estado, jugadorId, {
      ganador: null,
    });
  }

  // Dominacion: el calculo vive en reglas/dominacion.js y es EL MISMO que alimenta
  // la barra de progreso que ve el jugador. Si estuvieran separados, tocar uno solo
  // haria que la barra mienta sobre cuando termina la partida.
  //
  // El objetivo lo fija la partida (se elige en el lobby, en por ciento entero).
  // Una partida guardada antes de que el campo existiera cae a la constante
  // historica, igual que hacen tecnologiasDe/rasgosDe con sus campos.
  const objetivo = (estado.config.porcentajeVictoria ?? PORCENTAJE_VICTORIA_DOMINACION * 100) / 100;
  // Los aliados ganan juntos: quien compite es el BANDO (una alianza, o un
  // jugador solo), y su territorio es la suma del de sus miembros.
  const bandos = bandosDe(estado, activosPostEliminacion).map(miembros => {
    const porJugador = miembros
      .map(j => ({ id: j.id, ...controlTerritorial(estado, j.id) }))
      .sort((a, b) => b.tiles - a.tiles);
    return {
      miembros: porJugador.map(j => j.id),
      tiles: porJugador.reduce((suma, j) => suma + j.tiles, 0),
      porcentaje: porJugador.reduce((suma, j) => suma + j.porcentaje, 0),
    };
  });
  // `jugadorId` es el miembro con mas territorio; el resto viaja en `aliados`
  // (solo si los hay, para que una victoria en solitario tenga la forma de siempre).
  const victoriaDe = (bando, tipoVictoria) => evento('PartidaTerminada', estado, jugadorId, {
    ganador: {
      jugadorId: bando.miembros[0], tipoVictoria, turno: turnoCierre,
      ...(bando.miembros.length > 1 ? { aliados: bando.miembros.slice(1) } : {}),
    },
  });

  // El epsilon cubre la suma de fracciones de los aliados (0.3 + 0.3 no da 0.6 exacto).
  const dominante = bandos.find(b => b.porcentaje >= objetivo - 1e-9);
  if (dominante) return victoriaDe(dominante, 'dominacion');
  if (bandos.length === 1) return victoriaDe(bandos[0], 'ultimo_en_pie');

  // Limite de rondas: final garantizado para quien no quiere una partida
  // abierta. Gana el que mas territorio tenga; si van iguales NO se inventa un
  // ganador (mismo criterio que cuando no queda nadie activo).
  if (estado.config.limiteRondas && turnoCierre >= estado.config.limiteRondas) {
    const porTerritorio = [...bandos].sort((a, b) => b.tiles - a.tiles);
    const hayEmpate = porTerritorio.length > 1 && porTerritorio[0].tiles === porTerritorio[1].tiles;
    if (hayEmpate) return evento('PartidaTerminada', estado, jugadorId, { ganador: null });
    return victoriaDe(porTerritorio[0], 'limite_rondas');
  }

  return null;
}

// Si ya no queda ningun humano activo y la partida sigue (solo puede pasar con
// varios bots), se termina: gana el bot con mas territorio, o nadie si empatan.
// No vive en evaluarVictoria porque una partida SOLO de bots es legitima en las
// simulaciones y en los tests de la IA: quien decide cerrar es el servicio.
export function terminarSinHumanos(estado) {
  if (estado.estado !== 'jugando') return [];
  const activos = estado.jugadores.filter(j => j.activo);
  if (activos.length === 0 || activos.some(j => !j.esBot)) return [];
  const porTerritorio = activos
    .map(j => ({ id: j.id, tiles: controlTerritorial(estado, j.id).tiles }))
    .sort((a, b) => b.tiles - a.tiles);
  const hayEmpate = porTerritorio.length > 1 && porTerritorio[0].tiles === porTerritorio[1].tiles;
  return [evento('PartidaTerminada', estado, null, {
    ganador: hayEmpate ? null : { jugadorId: porTerritorio[0].id, tipoVictoria: 'sin_humanos', turno: estado.turno },
  })];
}

// terminarTurno calcula sobre el estado y devuelve eventos sin aplicarlos, pero
// la recuperacion tiene que verse reflejada YA para que evaluarVictoria mida el
// mapa correcto. Se aplica solo este evento, con la misma logica que aplicar.js.
function aplicarRecuperacion(estado, ev) {
  for (const { x, y } of ev.datos.tiles) {
    const t = tileEn(estado, x, y);
    if (t) t.dueno = ev.jugadorId;
  }
}

const todosListos = (estado, listos) =>
  estado.jugadores.every(j => !j.activo || listos.includes(j.id));

// Turno simultaneo: si todos los que siguen en la partida ya terminaron y nadie
// puede tocar "Terminar" (pasa cuando ABANDONA justo el unico que faltaba), la
// ronda se cierra sola. Recibe el estado con el abandono ya aplicado.
export function cerrarRondaSiTodosListos(estado, jugadorId) {
  if (!esSimultaneo(estado) || estado.estado !== 'jugando') return [];
  if (!estado.jugadores.some(j => j.activo) || !todosListos(estado, listosDe(estado))) return [];
  return cerrarRonda(estado, jugadorId);
}

export function terminarTurno(estado, jugadorId) {
  validarTurno(estado, jugadorId);
  return cerrarRonda(estado, jugadorId, { terminaJugador: true });
}

// `terminaJugador`: el jugador esta terminando SU turno (administra sus
// subdivisiones y, en simultaneo, queda anotado como listo). En false solo se
// cierra una ronda que ya tenia a todos listos.
function cerrarRonda(estado, jugadorId, { terminaJugador = false } = {}) {
  const simultaneo = esSimultaneo(estado);
  const eventos = [];
  // Secuencial: el indice "tentativo" decide si la ronda cierra (secuencia normal, solo
  // salteando jugadores ya inactivos). Las eliminaciones que ocurren EN este mismo cierre
  // todavia no se aplicaron, asi que no pueden afectar esa decision.
  // Simultaneo: no hay orden; la ronda cierra cuando termina el ultimo que faltaba.
  const nuevoIndiceTentativo = simultaneo ? estado.indiceJugadorActual : siguienteIndiceActivo(estado);
  const cierraRonda = simultaneo
    ? todosListos(estado, terminaJugador ? [...listosDe(estado), jugadorId] : listosDe(estado))
    : nuevoIndiceTentativo === 0;
  const turnoCierre = estado.turno;
  const nuevoTurno = cierraRonda ? estado.turno + 1 : estado.turno;

  let nuevoIndice = nuevoIndiceTentativo;

  // La administracion del Estado federal se calcula UNA vez, al principio: la usan los
  // eventos finales y tambien el calculo de los problemas del cierre de ronda.
  const eventosAdmin = terminaJugador ? administrarSubdivisiones(estado, jugadorId) : [];

  if (cierraRonda) {
    const activos = estado.jugadores.filter(j => j.activo);

    const eventosProduccion = [];
    for (const jugador of activos) {
      const { produccion, resto } = produccionConResto(estado, jugador.id);
      const ev = evento('RecursosProducidos', estado, jugadorId, {
        jugadorId: jugador.id,
        produccion,
        // Solo si hay decimales que llevar: para el despotismo el evento no cambia.
        ...(Object.keys(resto).length > 0 ? { resto } : {}),
      });
      eventos.push(ev);
      eventosProduccion.push(ev);
    }

    const eliminados = [];
    for (const jugador of activos) {
      if (ciudadesDe(estado, jugador.id).length === 0) {
        eventos.push(evento('JugadorEliminado', estado, jugadorId, { jugadorId: jugador.id }));
        eliminados.push(jugador.id);
      }
    }

    // La frontera se recupera ANTES de RondaCompletada y, sobre todo, antes de
    // evaluar la victoria: si no, el porcentaje que decide la partida seria el
    // de un instante que ya no existe.
    const recuperados = recuperarFronteras(estado);
    for (const ev of recuperados) {
      eventos.push(ev);
      aplicarRecuperacion(estado, ev);
    }

    // Semilla determinista: misma partida + mismo turno = mismo resultado.
    eventos.push(...cerrarRondaGobierno(estado, crearRng(`gobierno:${estado.semilla}:${estado.turno}`)));
    // Problemas sociales de los Estados federales: por ronda cerrada, idempotente.
    // Se calcula sobre el estado COMO VA A QUEDAR: con lo que gasta la administracion de este
    // mismo turno y con la produccion ya sumada. Si no, el oro con el que se decide si alcanza
    // para resolver un problema es el de ANTES de esos gastos y el oro podia quedar negativo.
    const estadoDelCierre = structuredClone(estado);
    aplicar(estadoDelCierre, [...eventosAdmin, ...eventosProduccion]);
    eventos.push(...cerrarRondaProblemas(estadoDelCierre, crearRng(`problemas:${estado.semilla}:${estado.turno}`)));

    eventos.push(evento('RondaCompletada', estado, jugadorId, {}));

    const activosPostEliminacion = activos.filter(j => !eliminados.includes(j.id));

    // El jugador seleccionado por el avance "tentativo" pudo haber sido eliminado en este
    // mismo cierre (p.ej. el jugador del indice 0). Si es asi, buscamos el proximo jugador
    // que siga activo DESPUES de aplicar las eliminaciones, para no dejar el turno en manos
    // de alguien inactivo (lo que dejaria la partida trabada: nadie podria volver a jugar).
    if (eliminados.length > 0 && !simultaneo) {
      nuevoIndice = siguienteIndiceActivo(estado, new Set(eliminados));
    }

    const eventoVictoria = evaluarVictoria(estado, jugadorId, activosPostEliminacion, turnoCierre);
    if (eventoVictoria) eventos.push(eventoVictoria);
  }

  // El Estado federal administra sus subdivisiones al terminar el turno del
  // propio jugador (asi las reglas de ciudades, que exigen turno, pasan). Va
  // antes de TurnoAvanzado. La produccion de la ronda se calculo sobre el
  // estado SIN estos edificios: rinden desde la ronda siguiente.
  eventos.unshift(...eventosAdmin);

  // En simultaneo el turno solo avanza al cerrar la ronda: mientras falte alguien,
  // terminar es nada mas que quedar anotado como listo.
  if (!simultaneo || cierraRonda) {
    eventos.unshift(evento('TurnoAvanzado', estado, jugadorId, { indiceJugadorActual: nuevoIndice, turno: nuevoTurno }));
  }
  if (simultaneo && terminaJugador) eventos.unshift(evento('JugadorListo', estado, jugadorId, {}));

  return eventos;
}
