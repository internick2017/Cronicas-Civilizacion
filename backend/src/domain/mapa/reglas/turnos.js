import { PRODUCCION_BASE_CIUDAD, BONO_TERRENO_PRODUCCION, EDIFICIOS, PORCENTAJE_VICTORIA_DOMINACION } from '../constantes.js';
import { validarTurno, evento } from './comun.js';
import { produccionPorRasgos } from './cultura.js';
import { aplicarBonosPorcentuales } from './tecnologia.js';

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
export function producirParaJugador(estado, jugadorId) {
  const produccion = {};
  const acumular = (recurso, cantidad) => {
    produccion[recurso] = (produccion[recurso] ?? 0) + cantidad;
  };
  // Los rasgos culturales rinden POR ciudad, igual que el terreno y los
  // edificios: valen para las ciudades que ya tenias y para las que fundes.
  const porRasgos = produccionPorRasgos(estado.jugadores.find(j => j.id === jugadorId));
  for (const tile of ciudadesDe(estado, jugadorId)) {
    for (const [recurso, cantidad] of Object.entries(PRODUCCION_BASE_CIUDAD)) acumular(recurso, cantidad);
    for (const [recurso, cantidad] of Object.entries(porRasgos)) acumular(recurso, cantidad);
    const bono = BONO_TERRENO_PRODUCCION[tile.terreno] ?? {};
    for (const [recurso, cantidad] of Object.entries(bono)) acumular(recurso, cantidad);
    for (const edificio of tile.ciudad.edificios) {
      const produccionEdificio = EDIFICIOS[edificio]?.produccion ?? {};
      for (const [recurso, cantidad] of Object.entries(produccionEdificio)) acumular(recurso, cantidad);
    }
  }
  // Los bonos porcentuales de tecnologia (irrigacion, mineria) se aplican AL
  // FINAL, sobre el total ya sumado: un 20% de "toda tu comida" tiene que
  // contar el terreno, los edificios Y los rasgos, no solo la base.
  return aplicarBonosPorcentuales(produccion, estado.jugadores.find(j => j.id === jugadorId));
}

// Exportada para que abandonar() use la MISMA evaluacion: si el que se va deja
// a un solo jugador en pie, la partida tiene que terminar igual que si lo
// hubieran eliminado peleando.
export function evaluarVictoria(estado, jugadorId, activosPostEliminacion, turnoCierre) {
  if (activosPostEliminacion.length === 0) {
    return evento('PartidaTerminada', estado, jugadorId, {
      ganador: null,
    });
  }

  // Dominacion: se mide sobre tiles de tierra unicamente (agua nunca es propiedad de nadie,
  // asi que incluirla haria que el umbral real dependa de cuanta agua generó la semilla).
  const tilesDeTierra = estado.mapa.filter(t => t.terreno !== 'water');
  const totalTierra = tilesDeTierra.length;
  for (const jugador of activosPostEliminacion) {
    const propios = tilesDeTierra.filter(t => t.dueno === jugador.id).length;
    if (totalTierra > 0 && propios / totalTierra >= PORCENTAJE_VICTORIA_DOMINACION) {
      return evento('PartidaTerminada', estado, jugadorId, {
        ganador: { jugadorId: jugador.id, tipoVictoria: 'dominacion', turno: turnoCierre },
      });
    }
  }
  if (activosPostEliminacion.length === 1) {
    const [unico] = activosPostEliminacion;
    return evento('PartidaTerminada', estado, jugadorId, {
      ganador: { jugadorId: unico.id, tipoVictoria: 'ultimo_en_pie', turno: turnoCierre },
    });
  }
  return null;
}

export function terminarTurno(estado, jugadorId) {
  validarTurno(estado, jugadorId);

  const eventos = [];
  // El indice "tentativo" decide si la ronda cierra (secuencia normal, solo salteando
  // jugadores ya inactivos). Las eliminaciones que ocurren EN este mismo cierre todavia
  // no se aplicaron, asi que no pueden afectar esa decision.
  const nuevoIndiceTentativo = siguienteIndiceActivo(estado);
  const cierraRonda = nuevoIndiceTentativo === 0;
  const turnoCierre = estado.turno;
  const nuevoTurno = cierraRonda ? estado.turno + 1 : estado.turno;

  let nuevoIndice = nuevoIndiceTentativo;

  if (cierraRonda) {
    const activos = estado.jugadores.filter(j => j.activo);

    for (const jugador of activos) {
      eventos.push(evento('RecursosProducidos', estado, jugadorId, {
        jugadorId: jugador.id,
        produccion: producirParaJugador(estado, jugador.id),
      }));
    }

    const eliminados = [];
    for (const jugador of activos) {
      if (ciudadesDe(estado, jugador.id).length === 0) {
        eventos.push(evento('JugadorEliminado', estado, jugadorId, { jugadorId: jugador.id }));
        eliminados.push(jugador.id);
      }
    }

    eventos.push(evento('RondaCompletada', estado, jugadorId, {}));

    const activosPostEliminacion = activos.filter(j => !eliminados.includes(j.id));

    // El jugador seleccionado por el avance "tentativo" pudo haber sido eliminado en este
    // mismo cierre (p.ej. el jugador del indice 0). Si es asi, buscamos el proximo jugador
    // que siga activo DESPUES de aplicar las eliminaciones, para no dejar el turno en manos
    // de alguien inactivo (lo que dejaria la partida trabada: nadie podria volver a jugar).
    if (eliminados.length > 0) {
      nuevoIndice = siguienteIndiceActivo(estado, new Set(eliminados));
    }

    const eventoVictoria = evaluarVictoria(estado, jugadorId, activosPostEliminacion, turnoCierre);
    if (eventoVictoria) eventos.push(eventoVictoria);
  }

  eventos.unshift(evento('TurnoAvanzado', estado, jugadorId, { indiceJugadorActual: nuevoIndice, turno: nuevoTurno }));

  return eventos;
}
