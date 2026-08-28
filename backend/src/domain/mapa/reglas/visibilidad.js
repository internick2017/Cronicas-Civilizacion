import { jugadorPorId } from '../MapGame.js';
import { ReglaError } from '../errores.js';
import { producirParaJugador } from './turnos.js';
import { controlTerritorial, rivalesDominantes } from './dominacion.js';
import { DIFICULTAD_IA_DEFAULT } from '../constantes.js';

function vistaTile(tile, jugadorId) {
  if (!tile.descubiertoPor.includes(jugadorId)) {
    return { x: tile.x, y: tile.y, descubierto: false };
  }
  const { descubiertoPor: _descubiertoPor, ...resto } = structuredClone(tile);
  return { ...resto, descubierto: true };
}

// El porcentaje se redondea a puntos ENTEROS antes de salir del backend, y el
// total de casillas de tierra no sale.
//
// Por que: visto jugando, con 6 casillas descubiertas de 196 la vista informaba
// totalTierra 74, o sea cuanto mundo jugable hay antes de explorar nada. Quitar
// el total no alcanzaba: con `tiles` y un porcentaje exacto el total se despeja
// dividiendo (1 casilla y 0.0135 dan 74). Redondeado, lo unico deducible es un
// rango amplio.
//
// Hacia ABAJO y no al mas cercano: si redondeara hacia arriba, la barra podria
// mostrar el objetivo cumplido en una ronda en la que todavia no ganaste.
// `tiles` si se manda: son TUS casillas, ya las ves en el mapa.
function porcentajeRedondeado(porcentaje) {
  return Math.floor(porcentaje * 100) / 100;
}

function dominacionParaLaVista(estado, jugadorId) {
  const { tiles, porcentaje } = controlTerritorial(estado, jugadorId);
  return { tiles, porcentaje: porcentajeRedondeado(porcentaje) };
}

function vistaJugadorPublica(jugador, jugadorId, estado) {
  const { id, nombre, civilizacion, activo, esBot } = jugador;
  if (jugador.id === jugadorId) {
    return {
      id, nombre, civilizacion, activo, esBot: Boolean(esBot),
      recursos: { ...jugador.recursos },
      rasgos: [...(jugador.rasgos ?? [])],
      tecnologias: [...(jugador.tecnologias ?? [])],
      // Cuanto va a rendir cada recurso al cerrar el turno. Sin esto el
      // jugador no puede planificar: no hay forma de saber si juntar para una
      // ciudad le lleva dos turnos o quince. Es informacion privada, va junto
      // a los recursos y por el mismo motivo.
      produccion: producirParaJugador(estado, jugador.id),
      // Progreso hacia la victoria por dominacion. Es informacion privada por el
      // mismo motivo que los recursos: el porcentaje ajeno dejaria deducir cuanto
      // mapa oculto tiene tomado el rival.
      dominacion: dominacionParaLaVista(estado, jugador.id),
    };
  }
  // esBot y dificultadIA no son informacion sensible (a diferencia de
  // recursos/rasgos): se muestran siempre para que el frontend pueda marcar
  // "🤖" al rival y con que dificultad esta jugando.
  return {
    id, nombre, civilizacion, activo, esBot: Boolean(esBot),
    ...(esBot ? { dificultadIA: jugador.dificultadIA ?? DIFICULTAD_IA_DEFAULT } : {}),
  };
}

export function vistaJugador(estado, jugadorId) {
  if (!jugadorPorId(estado, jugadorId)) {
    throw new ReglaError('JUGADOR_DESCONOCIDO', `Jugador desconocido: ${jugadorId}`);
  }
  return {
    id: estado.id,
    nombre: estado.nombre,
    estado: estado.estado,
    versionEsquema: estado.versionEsquema,
    turno: estado.turno,
    indiceJugadorActual: estado.indiceJugadorActual,
    config: structuredClone(estado.config),
    ganador: estado.ganador,
    jugadores: estado.jugadores.map(j => vistaJugadorPublica(j, jugadorId, estado)),
    mapa: estado.mapa.map(t => vistaTile(t, jugadorId)),
    // Aviso de rivales que se acercan a la victoria territorial: solo el cuanto,
    // nunca el donde (ver reglas/dominacion.js#rivalesDominantes).
    dominacionRivales: rivalesDominantes(estado, jugadorId)
      .map(r => ({ ...r, porcentaje: porcentajeRedondeado(r.porcentaje) })),
  };
}
