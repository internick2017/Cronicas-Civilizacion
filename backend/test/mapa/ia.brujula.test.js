import { describe, it, expect } from 'vitest';
import { crearEstado, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { terminarTurno } from '../../src/domain/mapa/reglas/turnos.js';
import { controlTerritorial } from '../../src/domain/mapa/reglas/dominacion.js';
import { jugarTurnoIA, distanciaATierraLibre } from '../../src/domain/mapa/ia.js';
import { crearRng } from '../../src/domain/mapa/rng.js';
import { EDIFICIOS } from '../../src/domain/mapa/constantes.js';

// Mapa de una franja larga (20x1, mas una isla para el humano): las 8 casillas
// de la izquierda son del bot y las 12 de la derecha son tierra de nadie, asi
// que "hacia donde caminar" tiene UNA sola respuesta correcta y el bot esta
// lejos del 60% (con una franja corta ganaba por dominacion en la ronda 1 y la
// partida terminaba antes de que el ejercito llegara a caminar).
const ANCHO = 20;
const PRIMERA_LIBRE = 8;

function franja(dificultadIA = 'normal') {
  const e = crearEstado({ nombre: 'T', semilla: 'brujula' });
  aplicar(e, unirse(e, { id: 'bot', nombre: 'M', civilizacion: 'A', esBot: true, dificultadIA }));
  aplicar(e, unirse(e, { id: 'h1', nombre: 'H', civilizacion: 'B' }));
  aplicar(e, iniciar(e));
  e.config.tamanoMapa = ANCHO;
  const tile = (x, y, extra) => ({ x, y, terreno: 'plains', recurso: null, dueno: null, ciudad: null, ejercito: null, descubiertoPor: ['bot'], ...extra });
  e.mapa = [];
  for (let x = 0; x < ANCHO; x++) {
    e.mapa.push(x < PRIMERA_LIBRE ? tile(x, 0, { dueno: 'bot' }) : tile(x, 0));
  }
  // Segunda fila de agua con una isla para el humano: sin una ciudad propia lo
  // eliminan al cerrar la primera ronda y la partida termina por ultimo_en_pie.
  // El agua no es camino, asi que no altera la brujula.
  for (let x = 0; x < ANCHO; x++) {
    e.mapa.push(x === ANCHO - 1
      ? tile(x, 1, { dueno: 'h1', ciudad: { nombre: 'H', nivel: 1, poblacion: 500, edificios: [] } })
      : tile(x, 1, { terreno: 'water' }));
  }
  // Ciudad del bot en la punta izquierda (sin ella se lo elimina al cerrar ronda).
  e.mapa[0].ciudad = { nombre: 'C', nivel: 1, poblacion: 500, edificios: [] };
  e.jugadores.find(j => j.id === 'bot').recursos = { food: 0, gold: 0, wood: 0, stone: 0, science: 0, culture: 0 };
  return e;
}

describe('brujula hacia la tierra libre', () => {
  it('mide la distancia a la casilla libre mas cercana, no en linea recta sino caminando', () => {
    const e = franja();
    const dist = distanciaATierraLibre(e, 'bot');
    // La primera casilla libre esta a distancia 0 de si misma; cada paso hacia
    // la izquierda, sobre territorio propio, suma 1.
    expect(dist.get(`${PRIMERA_LIBRE},0`)).toBe(0);
    expect(dist.get(`${PRIMERA_LIBRE - 1},0`)).toBe(1);
    expect(dist.get('0,0')).toBe(PRIMERA_LIBRE);
  });

  // Desde que la frontera es permeable, el territorio ajeno SUELTO si es camino
  // (se toma entrando). Lo que sigue sin serlo es lo defendido: una ciudad
  // ajena hay que atacarla, no se la atraviesa.
  it('no incluye ciudades ajenas ni agua como camino, pero si la tierra ajena suelta', () => {
    const e = franja();
    e.mapa[4].dueno = 'h1';
    e.mapa[4].ciudad = { nombre: 'Muro', nivel: 1, poblacion: 500, edificios: [] };
    const dist = distanciaATierraLibre(e, 'bot');
    expect(dist.get('5,0')).toBe(3);        // del lado libre, sigue llegando
    expect(dist.has('3,0')).toBe(false);    // del otro lado de la ciudad, inalcanzable

    // La misma casilla, sin ciudad: deja de ser un muro.
    e.mapa[4].ciudad = null;
    expect(distanciaATierraLibre(e, 'bot').has('3,0')).toBe(true);
  });

  it('un ejercito rodeado de casillas propias camina HACIA la frontera, no al azar', () => {
    const e = franja();
    // Ejercito en el medio: a su izquierda y derecha todo es propio; la unica
    // diferencia es que por la derecha se llega antes a la tierra libre.
    aplicar(e, [{ tipo: 'UnidadReclutada', turno: e.turno, jugadorId: 'bot', datos: { x: 0, y: 0, tipo: 'warrior' } }]);
    const ejercito = e.mapa.find(t => t.ejercito);
    expect(ejercito.x).toBe(0);

    jugarTurnoIA(e, 'bot', crearRng('camina'));

    const despues = e.mapa.find(t => t.ejercito && t.ejercito.dueno === 'bot');
    // Con movimiento 2 y sin nada que lo distraiga, tiene que haberse acercado.
    expect(despues.x).toBeGreaterThan(0);
  });

  it('reclama la punta libre en pocas rondas en vez de deambular', () => {
    const e = franja();
    aplicar(e, [{ tipo: 'UnidadReclutada', turno: e.turno, jugadorId: 'bot', datos: { x: 0, y: 0, tipo: 'warrior' } }]);
    for (let i = 0; i < 12 && e.estado === 'jugando'; i++) {
      const actual = e.jugadores[e.indiceJugadorActual].id;
      if (actual === 'bot') jugarTurnoIA(e, 'bot', crearRng(`r-${i}`));
      else aplicar(e, terminarTurno(e, actual));
    }
    expect(tileEn(e, PRIMERA_LIBRE, 0).dueno).toBe('bot');
  });

  // Regresion de un turno ENTERO perdido: la IA no investiga tecnologias, pero
  // decidirConstruccion proponia igual el edificio que exige una (university
  // exige filosofia). construir lanzaba REQUIERE_TECNOLOGIA una y otra vez y el
  // turno se cortaba por el tope de fallos seguidos ANTES de fundar o mover, asi
  // que el bot se quedaba inmovil para siempre con recursos de sobra.
  // Solo le pasa a FACIL: es la unica que construye en el orden "de fabrica"
  // (Object.keys(EDIFICIOS)), el unico que incluye el edificio con tecnologia.
  it('no se traba proponiendo un edificio que requiere una tecnologia que no tiene', () => {
    const e = franja('facil');
    const capital = e.mapa.find(t => t.ciudad && t.dueno === 'bot');
    // Todos los edificios menos el que exige tecnologia: la unica decision de
    // construccion que queda es la imposible.
    capital.ciudad.edificios = Object.entries(EDIFICIOS)
      .filter(([, def]) => !def.requiereTecnologia)
      .map(([tipo]) => tipo);
    const jugador = e.jugadores.find(j => j.id === 'bot');
    jugador.recursos = { food: 5000, gold: 5000, wood: 5000, stone: 5000, science: 0, culture: 0 };
    jugador.tecnologias = [];

    const eventos = jugarTurnoIA(e, 'bot', crearRng('trabado'));

    // Con recursos de sobra y tierra libre al alcance, un turno que solo avanza
    // el turno es un turno perdido.
    expect(eventos.filter(ev => ev.tipo !== 'TurnoAvanzado').length).toBeGreaterThan(0);
  });

  // Antes esto comparaba CASILLAS a mitad de partida, y dejo de servir cuando
  // la IA aprendio a marchar sobre el rival: una ofensiva pasa turnos caminando
  // hacia una ciudad en vez de reclamando tierra, asi que puede tener menos
  // casillas en el turno 40 y aun asi ganar mucho antes. Lo que mide si juega
  // mejor es EN CUANTOS TURNOS GANA.
  it('la facil gana mas lento que la dificil (la escala de dificultad se sostiene)', () => {
    const turnosParaGanar = (dificultad) => {
      const e = crearEstado({ nombre: 'S', semilla: 'escala-1' });
      aplicar(e, unirse(e, { id: 'bot', nombre: 'M', civilizacion: 'A', esBot: true, dificultadIA: dificultad }));
      aplicar(e, unirse(e, { id: 'h1', nombre: 'H', civilizacion: 'B' }));
      aplicar(e, iniciar(e));
      for (let i = 0; i < 400 && e.estado === 'jugando'; i++) {
        const actual = e.jugadores[e.indiceJugadorActual].id;
        if (actual === 'bot') jugarTurnoIA(e, 'bot', crearRng(`escala-${i}`));
        else aplicar(e, terminarTurno(e, actual));
      }
      return e.estado === 'terminado' ? e.turno : Infinity;
    };

    const facil = turnosParaGanar('facil');
    const dificil = turnosParaGanar('dificil');

    expect(dificil).toBeLessThan(Infinity);   // la dificil gana
    expect(facil).toBeGreaterThan(dificil);   // y lo hace antes que la facil
  });
});
