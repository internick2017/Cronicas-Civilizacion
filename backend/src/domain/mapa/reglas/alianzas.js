import { jugadorPorId } from '../MapGame.js';
import { RECURSOS } from '../constantes.js';
import { ReglaError } from '../errores.js';
import { evento } from './comun.js';
import { exigirMecanica, recursoApagado } from './modo.js';
import { controlTerritorial } from './dominacion.js';
import { alianzaDe, aliadosDe, sonAliados, propuestasDe } from './bandos.js';

/**
 * Alianzas: proponer, responder, romper y regalar recursos.
 *
 * Ninguna exige que sea tu turno (igual que el gobierno): contestarle a alguien
 * no puede depender de a quien le toca mover.
 */

function jugadorActivo(estado, jugadorId) {
  if (estado.estado !== 'jugando') throw new ReglaError('PARTIDA_NO_ACTIVA', 'La partida no está activa');
  exigirMecanica(estado, 'alianzas', 'alianzas');
  const jugador = jugadorPorId(estado, jugadorId);
  if (!jugador) throw new ReglaError('JUGADOR_DESCONOCIDO', `Jugador desconocido: ${jugadorId}`);
  if (!jugador.activo) throw new ReglaError('JUGADOR_INACTIVO', 'Ya no estás en la partida');
  return jugador;
}

// Quienes quedarian juntos si `a` y `b` se alian. Tira si no se puede.
function miembrosSiSeAlian(estado, a, b) {
  if (a === b) throw new ReglaError('ALIANZA_INVALIDA', 'No podés aliarte con vos mismo');
  if (sonAliados(estado, a, b)) throw new ReglaError('YA_SON_ALIADOS', 'Ya son aliados');
  const alianzaA = alianzaDe(estado, a);
  const alianzaB = alianzaDe(estado, b);
  if (alianzaA && alianzaB) {
    throw new ReglaError('ALIANZA_INVALIDA', 'Los dos ya tienen una alianza: uno tiene que salir de la suya primero');
  }
  const miembros = [...new Set([a, b, ...(alianzaA?.miembros ?? []), ...(alianzaB?.miembros ?? [])])];
  // Como los aliados ganan juntos, una alianza de TODOS seria ganar sin jugar.
  const activos = estado.jugadores.filter(j => j.activo);
  if (activos.every(j => miembros.includes(j.id))) {
    throw new ReglaError('ALIANZA_TOTAL', 'Tiene que quedar al menos un rival fuera de la alianza');
  }
  return miembros;
}

// La maquina solo se alia si una PERSONA se lo propone, nunca junto con otra
// maquina, y solo si va perdiendo: si alguien tiene mas territorio que ella.
// Determinista: misma partida, misma respuesta.
function laMaquinaAcepta(estado, bot, proponente, miembros) {
  if (proponente.esBot) return false;
  if (miembros.some(id => id !== bot.id && jugadorPorId(estado, id)?.esBot)) return false;
  const propio = controlTerritorial(estado, bot.id).tiles;
  return estado.jugadores.some(j => j.activo && j.id !== bot.id && controlTerritorial(estado, j.id).tiles > propio);
}

export function proponerAlianza(estado, jugadorId, { para }) {
  const proponente = jugadorActivo(estado, jugadorId);
  const destinatario = jugadorPorId(estado, para);
  if (!destinatario || !destinatario.activo) {
    throw new ReglaError('JUGADOR_DESCONOCIDO', 'Ese jugador no está en la partida');
  }
  const miembros = miembrosSiSeAlian(estado, jugadorId, para);
  if (propuestasDe(estado).some(p => p.de === jugadorId && p.para === para)) {
    throw new ReglaError('PROPUESTA_REPETIDA', 'Ya le propusiste una alianza: esperá su respuesta');
  }
  if (propuestasDe(estado).some(p => p.de === para && p.para === jugadorId)) {
    throw new ReglaError('PROPUESTA_REPETIDA', 'Ese jugador ya te propuso una alianza: respondele');
  }

  const eventos = [evento('AlianzaPropuesta', estado, jugadorId, { para })];
  // A la maquina nadie le toca el boton: contesta en el acto.
  if (destinatario.esBot) {
    eventos.push(laMaquinaAcepta(estado, destinatario, proponente, miembros)
      ? evento('AlianzaFormada', estado, para, { con: jugadorId })
      : evento('AlianzaRechazada', estado, para, { de: jugadorId }));
  }
  return eventos;
}

export function responderAlianza(estado, jugadorId, { de, aceptar }) {
  jugadorActivo(estado, jugadorId);
  if (!propuestasDe(estado).some(p => p.de === de && p.para === jugadorId)) {
    throw new ReglaError('SIN_PROPUESTA', 'Ese jugador no te propuso una alianza');
  }
  if (aceptar !== true) return [evento('AlianzaRechazada', estado, jugadorId, { de })];
  if (!jugadorPorId(estado, de)?.activo) throw new ReglaError('JUGADOR_INACTIVO', 'Ese jugador ya no está en la partida');
  // Se vuelve a validar: desde que se propuso pudo cambiar quien esta con quien.
  miembrosSiSeAlian(estado, jugadorId, de);
  return [evento('AlianzaFormada', estado, jugadorId, { con: de })];
}

// Romper es con aviso: queda una tregua hasta que termine esta ronda, asi que
// recien en la siguiente se pueden atacar. Sin eso, romper y atacar en el mismo
// turno seria una traicion contra la que no hay defensa posible.
export function romperAlianza(estado, jugadorId) {
  jugadorActivo(estado, jugadorId);
  const exAliados = aliadosDe(estado, jugadorId);
  if (exAliados.length === 0) throw new ReglaError('SIN_ALIANZA', 'No tenés ninguna alianza');
  return [evento('AlianzaRota', estado, jugadorId, { exAliados, hasta: estado.turno })];
}

export function regalarRecursos(estado, jugadorId, { para, recurso, cantidad }) {
  const jugador = jugadorActivo(estado, jugadorId);
  if (!sonAliados(estado, jugadorId, para)) {
    throw new ReglaError('NO_ES_ALIADO', 'Solo podés regalarle recursos a un aliado');
  }
  if (!RECURSOS.includes(recurso) || recursoApagado(estado, recurso)) {
    throw new ReglaError('RECURSO_DESCONOCIDO', `Recurso desconocido: ${recurso}`);
  }
  if (!Number.isInteger(cantidad) || cantidad <= 0) {
    throw new ReglaError('CANTIDAD_INVALIDA', 'La cantidad tiene que ser un número entero mayor que cero');
  }
  if ((jugador.recursos[recurso] ?? 0) < cantidad) {
    throw new ReglaError('RECURSOS_INSUFICIENTES', 'No tenés esa cantidad');
  }
  return [evento('RecursosRegalados', estado, jugadorId, { para, recurso, cantidad })];
}
