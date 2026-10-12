import { posicionesIniciales } from '../generarMapa.js';
import { crearRng } from '../rng.js';
import { jugadorPorId } from '../MapGame.js';
import { ReglaError } from '../errores.js';
import { evento, radio1 } from './comun.js';
import { MIN_JUGADORES } from '../constantes.js';
import { validarRaza } from './razas.js';

// esBot marca al jugador manejado por la IA (ver domain/mapa/ia.js).
// dificultadIA solo tiene sentido junto con esBot; se acepta igual para
// cualquier jugador (queda sin usar en un humano) para no tener que ramificar
// el evento segun el caso. Un jugador esBot no tiene token de sesion ni pasa
// por el endpoint HTTP: lo agrega el propio servicio al unirse el primer
// humano a una partida "contra la maquina" (ver MapGameService#_unirse).
//
// `raza` es opcional: sin ella el jugador no tiene bonos ni penalizaciones (el
// comportamiento de antes de que existieran las razas). Si viene, tiene que
// existir en RAZAS (ver reglas/razas.js).
export function unirse(estado, { id, nombre, civilizacion, raza = null, esBot = false, dificultadIA = null }) {
  if (estado.estado !== 'esperando') throw new ReglaError('PARTIDA_YA_INICIADA', 'La partida ya inició');
  if (estado.jugadores.length >= estado.config.maxJugadores) throw new ReglaError('PARTIDA_LLENA', 'La partida está llena');
  if (jugadorPorId(estado, id)) throw new ReglaError('JUGADOR_DUPLICADO', 'Ese jugador ya está en la partida');
  const razaValida = validarRaza(raza);
  return [evento('JugadorUnido', estado, null, { id, nombre, civilizacion, raza: razaValida, esBot, dificultadIA })];
}

export function iniciar(estado) {
  if (estado.estado !== 'esperando') throw new ReglaError('PARTIDA_YA_INICIADA', 'La partida ya inició');
  if (estado.jugadores.length < MIN_JUGADORES) throw new ReglaError('JUGADORES_INSUFICIENTES', `Se necesitan al menos ${MIN_JUGADORES} jugadores`);
  const rng = crearRng(`inicio:${estado.semilla}`);
  const pos = posicionesIniciales(estado.mapa, estado.config.tamanoMapa, estado.jugadores.length, rng,
    { islas: estado.config.islas === true });
  const eventos = [{ tipo: 'PartidaIniciada', turno: 1, jugadorId: null, datos: {} }];
  estado.jugadores.forEach((jug, i) => {
    const { x, y } = pos[i];
    eventos.push(
      { tipo: 'CiudadFundada', turno: 1, jugadorId: jug.id, datos: { x, y, nombre: `${jug.civilizacion} Capital` } },
      { tipo: 'TerritorioDescubierto', turno: 1, jugadorId: jug.id, datos: { tiles: radio1(x, y) } },
    );
  });
  return eventos;
}

// Donde nace quien llega con la partida empezada: la tierra libre mas alejada
// de todo lo que ya tiene dueño, para no caerle encima a nadie. Determinista
// (ante un empate gana la primera casilla del mapa).
function lugarParaNuevaCapital(estado) {
  const ocupadas = estado.mapa.filter(t => t.dueno || t.ciudad);
  let mejor = null;
  let mejorDistancia = -1;
  for (const t of estado.mapa) {
    if (t.terreno === 'water' || t.dueno || t.ciudad || t.ejercito) continue;
    let distancia = Infinity;
    for (const o of ocupadas) {
      distancia = Math.min(distancia, Math.abs(o.x - t.x) + Math.abs(o.y - t.y));
      if (distancia <= mejorDistancia) break;
    }
    if (distancia > mejorDistancia) { mejor = t; mejorDistancia = distancia; }
  }
  return mejor;
}

/**
 * Suma una maquina a una partida que ya esta en juego. A diferencia de
 * `unirse` no exige la sala de espera: entra con su capital fundada en tierra
 * libre y empieza a jugar en la ronda en curso. Arranca con lo mismo que
 * cualquiera el primer turno, asi que si la partida va avanzada llega de atras.
 *
 * El id, el nombre, la civilizacion y la raza los elige el servicio, igual que
 * con los bots que entran al crear la partida.
 */
export function sumarMaquina(estado, { id, nombre, civilizacion, raza = null, dificultadIA = null }) {
  if (estado.estado !== 'jugando') throw new ReglaError('PARTIDA_NO_ACTIVA', 'La partida no está activa');
  if (jugadorPorId(estado, id)) throw new ReglaError('JUGADOR_DUPLICADO', 'Ese jugador ya está en la partida');
  const lugar = lugarParaNuevaCapital(estado);
  if (!lugar) throw new ReglaError('SIN_LUGAR', 'No queda tierra libre para otra civilización');
  const razaValida = validarRaza(raza);
  return [
    evento('JugadorUnido', estado, null, { id, nombre, civilizacion, raza: razaValida, esBot: true, dificultadIA }),
    evento('CiudadFundada', estado, id, { x: lugar.x, y: lugar.y, nombre: `${civilizacion} Capital` }),
    evento('TerritorioDescubierto', estado, id, { tiles: radio1(lugar.x, lugar.y) }),
  ];
}
