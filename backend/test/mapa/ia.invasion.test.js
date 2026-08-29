import { describe, it, expect } from 'vitest';
import { crearEstado, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { jugarTurnoIA, tierraInalcanzable, distanciaAInvasion } from '../../src/domain/mapa/ia.js';
import { crearRng } from '../../src/domain/mapa/rng.js';

// La maquina cruzando el mar. Estos tests existen por dos bugs concretos que
// costaron caro y que no se ven leyendo el codigo: los dos hacian que la IA
// construyera transportes y no invadiera NUNCA.

const ANCHO = 12;
const RICO = { food: 500, gold: 500, wood: 500, stone: 500, science: 200, culture: 200 };

/**
 * Mapa 12x12 partido en dos por dos columnas de mar (x=5 y x=6). El bot vive a
 * la izquierda con capital costera, el rival a la derecha. Es el mapa mas chico
 * donde una invasion es la UNICA forma de tocar al otro.
 */
function partido() {
  const e = crearEstado({ nombre: 'T', semilla: 'split' });
  aplicar(e, unirse(e, { id: 'bot', nombre: 'M', civilizacion: 'A', esBot: true, dificultadIA: 'normal' }));
  aplicar(e, unirse(e, { id: 'riv', nombre: 'R', civilizacion: 'B', esBot: true, dificultadIA: 'normal' }));
  aplicar(e, iniciar(e));
  e.config.tamanoMapa = ANCHO;
  e.mapa = [];
  for (let y = 0; y < ANCHO; y++) {
    for (let x = 0; x < ANCHO; x++) {
      // Cada uno ve SOLO su isla. No es decoracion: `decidirFundacion` exige
      // que la casilla este descubierta, y con el mapa entero descubierto la
      // maquina fundaba ciudades del otro lado del mar sin cruzar nunca, lo que
      // volvia el escenario inutil para probar invasiones.
      const mia = x < 5 ? 'bot' : x > 6 ? 'riv' : null;
      e.mapa.push({
        x, y, terreno: (x === 5 || x === 6) ? 'water' : 'plains',
        recurso: null, dueno: null, ciudad: null, ejercito: null,
        descubiertoPor: mia ? [mia] : [],
      });
    }
  }
  const ciudad = (n) => ({ nombre: n, nivel: 1, poblacion: 500, edificios: [] });
  tileEn(e, 4, 5).ciudad = ciudad('B1'); tileEn(e, 4, 5).dueno = 'bot';
  tileEn(e, 7, 5).ciudad = ciudad('R1'); tileEn(e, 7, 5).dueno = 'riv';
  for (const j of e.jugadores) j.recursos = { ...RICO };
  return e;
}

describe('que cuenta como tierra inalcanzable', () => {
  it('la otra orilla sigue siendo inalcanzable aunque tengas un barco al lado', () => {
    // ESTE es el bug que hacia que la maquina no invadiera nunca. El calculo
    // arranca un BFS por tierra desde "lo mio", y distanciaHasta siembra los
    // origenes SIN mirar si son camino valido. Con un buque propio flotando
    // pegado a la costa enemiga, esa casilla de mar entraba como origen y le
    // regalaba distancia a la orilla de enfrente: el objetivo de la invasion
    // se evaporaba justo cuando el transporte llegaba.
    const e = partido();
    const sinBarco = tierraInalcanzable(e, 'bot').size;
    expect(sinBarco).toBeGreaterThan(0);

    tileEn(e, 6, 5).ejercito = { tipo: 'warship', dueno: 'bot', salud: 70, movimientoRestante: 4, bonoMovimiento: 0 };
    expect(tierraInalcanzable(e, 'bot').size).toBe(sinBarco);
  });

  it('lo que se alcanza caminando NO cuenta como invasion', () => {
    const e = partido();
    const inalcanzables = tierraInalcanzable(e, 'bot');
    // Todo lo de la izquierda se camina desde la capital del bot.
    expect(inalcanzables.has('0,0')).toBe(false);
    expect(inalcanzables.has('4,4')).toBe(false);
    // Lo de la derecha, no.
    expect(inalcanzables.has('8,5')).toBe(true);
  });
});

describe('la brujula de invasion', () => {
  it('no apunta a una playa ocupada: el criterio es el mismo que el de desembarcar', () => {
    // El otro bug: la brujula decia "llegaste" mirando solo si la casilla era
    // inalcanzable, y la regla de desembarcar ademas exigia la casilla libre.
    // Con esa discrepancia el transporte quedaba anclado frente a una playa
    // defendida, sin bajar y sin buscar otra.
    const e = partido();
    // Se tapa TODA la orilla enemiga con tropa: no queda donde bajar.
    for (let y = 0; y < ANCHO; y++) {
      tileEn(e, 7, y).ejercito = { tipo: 'spearman', dueno: 'riv', salud: 90, movimientoRestante: 2, bonoMovimiento: 0 };
    }
    const inalcanzables = tierraInalcanzable(e, 'bot');
    const brujula = distanciaAInvasion(e, 'bot', inalcanzables);
    // El mar pegado a esa orilla ya no es objetivo, porque no se puede bajar.
    expect(brujula.get('6,5')).toBeUndefined();
  });
});

describe('la maquina invade de verdad', () => {
  it('con el mapa partido en dos, construye transporte, embarca y desembarca', () => {
    const e = partido();
    const rng = crearRng('invasion');
    const cuenta = {};
    for (let t = 0; t < 120 && e.estado === 'jugando'; t++) {
      const actual = e.jugadores[e.indiceJugadorActual];
      for (const ev of jugarTurnoIA(e, actual.id, rng)) {
        cuenta[ev.tipo] = (cuenta[ev.tipo] ?? 0) + 1;
      }
      // Se repone la economia cada tanto para que el cuello de botella sea la
      // DECISION de invadir y no la falta de madera.
      if (t % 5 === 0) for (const j of e.jugadores) j.recursos = { ...RICO };
    }

    expect(cuenta.TropaEmbarcada ?? 0).toBeGreaterThan(0);
    expect(cuenta.TropaDesembarcada ?? 0).toBeGreaterThan(0);
  });
});
