import { PRODUCCION_BASE_CIUDAD, BONO_TERRENO_PRODUCCION, EDIFICIOS, PORCENTAJE_VICTORIA_DOMINACION } from '../constantes.js';
import { validarTurno, evento } from './comun.js';

function siguienteIndiceActivo(estado) {
  const n = estado.jugadores.length;
  let idx = estado.indiceJugadorActual;
  for (let i = 0; i < n; i++) {
    idx = (idx + 1) % n;
    if (estado.jugadores[idx].activo) return idx;
  }
  return estado.indiceJugadorActual;
}

function ciudadesDe(estado, jugadorId) {
  return estado.mapa.filter(t => t.ciudad && t.dueno === jugadorId);
}

function producirParaJugador(estado, jugadorId) {
  const produccion = {};
  const acumular = (recurso, cantidad) => {
    produccion[recurso] = (produccion[recurso] ?? 0) + cantidad;
  };
  for (const tile of ciudadesDe(estado, jugadorId)) {
    for (const [recurso, cantidad] of Object.entries(PRODUCCION_BASE_CIUDAD)) acumular(recurso, cantidad);
    const bono = BONO_TERRENO_PRODUCCION[tile.terreno] ?? {};
    for (const [recurso, cantidad] of Object.entries(bono)) acumular(recurso, cantidad);
    for (const edificio of tile.ciudad.edificios) {
      const produccionEdificio = EDIFICIOS[edificio]?.produccion ?? {};
      for (const [recurso, cantidad] of Object.entries(produccionEdificio)) acumular(recurso, cantidad);
    }
  }
  return produccion;
}

function evaluarVictoria(estado, jugadorId, activosPostEliminacion, turnoCierre) {
  const totalTiles = estado.mapa.length;
  for (const jugador of activosPostEliminacion) {
    const propios = estado.mapa.filter(t => t.dueno === jugador.id).length;
    if (totalTiles > 0 && propios / totalTiles >= PORCENTAJE_VICTORIA_DOMINACION) {
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
  const nuevoIndice = siguienteIndiceActivo(estado);
  const cierraRonda = nuevoIndice === 0;
  const turnoCierre = estado.turno;
  const nuevoTurno = cierraRonda ? estado.turno + 1 : estado.turno;

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
    const eventoVictoria = evaluarVictoria(estado, jugadorId, activosPostEliminacion, turnoCierre);
    if (eventoVictoria) eventos.push(eventoVictoria);
  }

  eventos.unshift(evento('TurnoAvanzado', estado, jugadorId, { indiceJugadorActual: nuevoIndice, turno: nuevoTurno }));

  return eventos;
}
