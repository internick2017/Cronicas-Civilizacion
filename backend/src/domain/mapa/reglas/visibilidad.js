import { jugadorPorId } from '../MapGame.js';
import { ReglaError } from '../errores.js';
import { producirParaJugador } from './turnos.js';
import { controlDelBando, rivalesDominantes } from './dominacion.js';
import { alianzasDe, aliadosDe, propuestasDe, treguasDe } from './bandos.js';
import { DIFICULTAD_IA_DEFAULT, GRUPOS_DE_APOYO, saludDeCiudad, saludMaximaCiudad } from '../constantes.js';
import { subdivisionesDe, nivelDe, cabeceraDe } from './subdivisiones.js';
import { problemasParaLaVista, senalesDe } from './problemas.js';
import { multiplicadorCostos } from './efectosProblemas.js';
import { reglasDelModo } from './modo.js';
import {
  gobiernoDe, formaEstadoDe, estaEnPoder, apoyoEfectivo, impuestosDe, mandatoDe, nombreGobiernoDe,
} from './gobierno.js';
import { capitalDe } from './capital.js';
import { cargosDe } from './cargos.js';
import { monedaDe, inflacionAcunadaDe, acunadoEnRonda } from './moneda.js';

// `videntes`: el jugador y sus aliados, que comparten lo que descubren.
// `capitales`: claves "x,y" de la capital de cada jugador. Viajan marcadas EN la
// ciudad y no como coordenadas sueltas, asi la capital de un rival solo se ve si
// esa casilla ya esta descubierta.
function vistaTile(tile, videntes, capitales) {
  if (!videntes.some(id => tile.descubiertoPor.includes(id))) {
    return { x: tile.x, y: tile.y, descubierto: false };
  }
  const { descubiertoPor: _descubiertoPor, ...resto } = structuredClone(tile);
  // La interfaz muestra "70/100": el maximo sale de aca, no se recalcula en el cliente.
  if (resto.ciudad) {
    resto.ciudad.salud = saludDeCiudad(resto.ciudad);
    resto.ciudad.saludMax = saludMaximaCiudad(resto.ciudad.nivel);
    resto.ciudad.capital = capitales.has(`${tile.x},${tile.y}`);
  }
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
  // Con aliados, el progreso es el del bando: es el numero que decide la partida.
  const { tiles, porcentaje } = controlDelBando(estado, jugadorId);
  return { tiles, porcentaje: porcentajeRedondeado(porcentaje) };
}

function vistaJugadorPublica(jugador, jugadorId, estado) {
  const { id, nombre, civilizacion, activo, esBot } = jugador;
  // La raza no es informacion sensible (como la civilizacion): se muestra a todos.
  const raza = jugador.raza ?? null;
  if (jugador.id === jugadorId) {
    return {
      id, nombre, civilizacion, raza, activo, esBot: Boolean(esBot),
      cargos: cargosDe(jugador),
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
      gobierno: gobiernoDe(jugador),
      nombreGobierno: nombreGobiernoDe(jugador),
      formaEstado: formaEstadoDe(jugador),
      enPoder: estaEnPoder(jugador),
      impuestos: impuestosDe(jugador),
      mandato: mandatoDe(estado, jugador),
      // Apoyo EFECTIVO (con el respeto del gobierno ya sumado): es lo que
      // cuenta en una votacion. Privado, como los recursos.
      apoyo: Object.fromEntries(GRUPOS_DE_APOYO.map(g => [g, apoyoEfectivo(jugador, g)])),
      cambioBloqueadoHasta: jugador.cambioBloqueadoHasta ?? 0,
      // Problemas sociales: privados, igual que el apoyo. Los medidores crudos no salen.
      problemas: problemasParaLaVista(estado, jugador),
      // La interfaz muestra los precios reales: la inflacion los sube.
      multiplicadorCostos: multiplicadorCostos(jugador),
      senales: senalesDe(estado, jugador),
      // Cada una con su nivel (derivado del tipo) para que la interfaz arme el arbol.
      // La cabecera sale ya validada: una guardada que dejo de valer se ve como ninguna.
      subdivisiones: subdivisionesDe(jugador)
        .map(s => ({ ...s, nivel: nivelDe(s), cabecera: cabeceraDe(estado, jugador, s) })),
      capital: capitalDe(estado, jugador),
      moneda: monedaDe(jugador),
      // Puntos porcentuales que ya estan dentro de multiplicadorCostos.
      inflacionAcunada: inflacionAcunadaDe(jugador),
      acunadoEstaRonda: acunadoEnRonda(jugador, estado.turno),
    };
  }
  // esBot y dificultadIA no son informacion sensible (a diferencia de
  // recursos/rasgos): se muestran siempre para que el frontend pueda marcar
  // "🤖" al rival y con que dificultad esta jugando.
  return {
    id, nombre, civilizacion, raza, activo, esBot: Boolean(esBot),
    cargos: cargosDe(jugador),
    gobierno: gobiernoDe(jugador),
    nombreGobierno: nombreGobiernoDe(jugador),
    formaEstado: formaEstadoDe(jugador),
    enPoder: estaEnPoder(jugador),
    // El nombre de la moneda es una etiqueta, como el del pais: lo ven todos.
    moneda: monedaDe(jugador),
    ...(esBot ? { dificultadIA: jugador.dificultadIA ?? DIFICULTAD_IA_DEFAULT } : {}),
  };
}

export function vistaJugador(estado, jugadorId) {
  if (!jugadorPorId(estado, jugadorId)) {
    throw new ReglaError('JUGADOR_DESCONOCIDO', `Jugador desconocido: ${jugadorId}`);
  }
  const videntes = [jugadorId, ...aliadosDe(estado, jugadorId)];
  const capitales = new Set(estado.jugadores
    .map(j => capitalDe(estado, j)).filter(Boolean).map(c => `${c.x},${c.y}`));
  return {
    id: estado.id,
    nombre: estado.nombre,
    estado: estado.estado,
    versionEsquema: estado.versionEsquema,
    turno: estado.turno,
    indiceJugadorActual: estado.indiceJugadorActual,
    // Turno simultaneo: quienes ya terminaron esta ronda. Es publico, igual que
    // de quien es el turno en una partida secuencial.
    listos: [...(estado.listos ?? [])],
    config: structuredClone(estado.config),
    // Que existe en este modo (tecnologias, rasgos, mejoras, recursos): la interfaz pregunta por esto, no por el nombre del modo.
    reglas: reglasDelModo(estado),
    ganador: estado.ganador,
    jugadores: estado.jugadores.map(j => vistaJugadorPublica(j, jugadorId, estado)),
    mapa: estado.mapa.map(t => vistaTile(t, videntes, capitales)),
    // Quien esta aliado con quien es publico: hay que saber contra quien se juega.
    alianzas: alianzasDe(estado).map(a => ({ miembros: [...a.miembros] })),
    // Las propuestas solo las ven quien propone y quien tiene que responder.
    propuestasAlianza: propuestasDe(estado)
      .filter(p => p.de === jugadorId || p.para === jugadorId)
      .map(p => ({ de: p.de, para: p.para })),
    treguas: treguasDe(estado)
      .filter(t => t.hasta >= estado.turno && (t.a === jugadorId || t.b === jugadorId))
      .map(t => ({ con: t.a === jugadorId ? t.b : t.a, hasta: t.hasta })),
    // Aviso de rivales que se acercan a la victoria territorial: solo el cuanto,
    // nunca el donde (ver reglas/dominacion.js#rivalesDominantes).
    dominacionRivales: rivalesDominantes(estado, jugadorId)
      .map(r => ({ ...r, porcentaje: porcentajeRedondeado(r.porcentaje) })),
  };
}
