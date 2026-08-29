import { describe, it, expect } from 'vitest';
import { crearEstado, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import {
  jugarTurnoIA, PERFILES_DIFICULTAD, distanciaABuqueEnemigo, distanciaACostaEnemiga,
} from '../../src/domain/mapa/ia.js';
import { crearRng } from '../../src/domain/mapa/rng.js';

// La maquina y el mar. Lo que hay que sostener acá es de dos tipos: que la IA
// USE la armada (o la partida en solitario se vuelve un botin gratis), y que no
// se AHOGUE con ella (proponer un puerto imposible le vacia el turno, que es un
// bug que ya paso con la universidad).

const ANCHO = 10;
const RICO = { food: 999, gold: 999, wood: 999, stone: 999, science: 999, culture: 999 };

const tile = (x, y, extra) => ({
  x, y, terreno: 'plains', recurso: null, dueno: null,
  ciudad: null, ejercito: null, descubiertoPor: ['bot', 'riv'], ...extra,
});
const ciudad = (nombre, edificios = []) => ({ nombre, nivel: 1, poblacion: 500, edificios });

/**
 * Mapa de 10x3: tierra arriba, una franja de MAR en el medio (10 casillas, muy
 * por encima del minimo que la maquina exige para poner un puerto), tierra
 * abajo. La ciudad del bot y la del rival quedan las dos sobre la costa.
 *
 * `filas` describe cuantas filas existen: tileEn indexa y*tamano+x, asi que
 * solo se pueden tocar las filas que se empujaron.
 */
function mapaConMar({ dificultadIA = 'normal', edificiosBot = [], mar = true } = {}) {
  const e = crearEstado({ nombre: 'T', semilla: 'naval' });
  aplicar(e, unirse(e, { id: 'bot', nombre: 'M', civilizacion: 'A', esBot: true, dificultadIA }));
  aplicar(e, unirse(e, { id: 'riv', nombre: 'R', civilizacion: 'B' }));
  aplicar(e, iniciar(e));
  e.config.tamanoMapa = ANCHO;

  e.mapa = [];
  for (let x = 0; x < ANCHO; x++) {
    e.mapa.push(tile(x, 0, {
      dueno: x <= 4 ? 'bot' : 'riv',
      ciudad: x === 0 ? ciudad('B1', edificiosBot) : x === ANCHO - 1 ? ciudad('R1') : null,
    }));
  }
  for (let x = 0; x < ANCHO; x++) e.mapa.push(tile(x, 1, { terreno: mar ? 'water' : 'plains' }));
  for (let x = 0; x < ANCHO; x++) e.mapa.push(tile(x, 2, { dueno: x <= 4 ? 'bot' : null }));

  e.jugadores.find(j => j.id === 'bot').recursos = { ...RICO };
  return e;
}

const tiposDe = (eventos, tipo) => eventos.filter(ev => ev.tipo === tipo).map(ev => ev.datos);

describe('la maquina y la armada', () => {
  it('con puerto y recursos, bota un buque y lo deja en el mar', () => {
    const e = mapaConMar({ dificultadIA: 'normal', edificiosBot: ['port'] });
    const eventos = jugarTurnoIA(e, 'bot', crearRng('flota'));

    const reclutas = tiposDe(eventos, 'UnidadReclutada');
    const buque = reclutas.find(d => d.tipo === 'warship');
    expect(buque).toBeTruthy();
    // Nacio en el MAR, no en la ciudad: la ciudad esta en y=0, el mar en y=1.
    expect(buque.y).toBe(1);
    expect(tileEn(e, buque.x, buque.y).terreno).toBe('water');
  });

  it('facil no arma flota aunque tenga puerto y oro de sobra', () => {
    // No es que juegue mal: su perfil dice `ofensiva: 'nunca'` y es la
    // dificultad donde te dejan colonizar en paz. Darle armada la contradice.
    expect(PERFILES_DIFICULTAD.facil.topeBuques).toBe(0);

    const e = mapaConMar({ dificultadIA: 'facil', edificiosBot: ['port'] });
    const eventos = jugarTurnoIA(e, 'bot', crearRng('flota'));

    expect(tiposDe(eventos, 'UnidadReclutada').some(d => d.tipo === 'warship')).toBe(false);
  });

  it('respeta su tope de buques: no llena el mar de barcos', () => {
    const e = mapaConMar({ dificultadIA: 'normal', edificiosBot: ['port'] });
    // Varias rondas seguidas, reponiendo recursos, para que el tope sea lo
    // unico que lo frene.
    let botados = 0;
    for (let ronda = 0; ronda < 5; ronda++) {
      e.jugadores.find(j => j.id === 'bot').recursos = { ...RICO };
      e.estado = 'jugando';
      e.indiceJugadorActual = 0;
      const eventos = jugarTurnoIA(e, 'bot', crearRng(`flota-${ronda}`));
      botados += tiposDe(eventos, 'UnidadReclutada').filter(d => d.tipo === 'warship').length;
    }
    expect(botados).toBeLessThanOrEqual(PERFILES_DIFICULTAD.normal.topeBuques);
  });

  it('los buques NO le comen el tope de ejercitos de tierra', () => {
    // Si los dos topes fueran uno solo, cada barco seria un colono menos, y
    // como el territorio se gana caminando, una maquina con armada se estaria
    // suicidando en la carrera por la dominacion.
    //
    // Se compara la MISMA partida con y sin puerto, con la misma semilla: es
    // la unica forma de aislar el efecto del buque. Un numero absoluto no
    // sirve, porque el tope de tierra sube cuando la maquina funda una ciudad
    // nueva durante el turno, y eso pasa en las dos corridas.
    const conPuerto = mapaConMar({ dificultadIA: 'normal', edificiosBot: ['port'] });
    const sinPuerto = mapaConMar({ dificultadIA: 'normal', edificiosBot: [] });

    const terrestresDe = (estado) => tiposDe(jugarTurnoIA(estado, 'bot', crearRng('flota')), 'UnidadReclutada')
      .filter(d => d.tipo !== 'warship').length;

    expect(terrestresDe(conPuerto)).toBe(terrestresDe(sinPuerto));
  });
});

describe('la maquina no se ahoga con el puerto', () => {
  it('en un mapa SIN mar no propone puertos, y el turno no se vacia', () => {
    // Este es el guardian del bug caro: construir() rechaza el puerto sin
    // costa, decidirConstruccion es la PRIMERA decision del turno, y cinco
    // rechazos seguidos cierran el turno sin fundar, mover ni reclutar.
    const e = mapaConMar({ dificultadIA: 'normal', mar: false });
    const eventos = jugarTurnoIA(e, 'bot', crearRng('sin-mar'));

    expect(tiposDe(eventos, 'EdificioConstruido').some(d => d.edificio === 'port')).toBe(false);
    // El turno hizo cosas: no quedo en el TurnoAvanzado pelado.
    expect(eventos.filter(ev => ev.tipo !== 'TurnoAvanzado').length).toBeGreaterThan(0);
  });

  it('no pone un puerto sobre un charco', () => {
    // Mar valido para la REGLA (un humano puede hacerlo si quiere), pero
    // inservible: un buque botado ahi no va a ningun lado.
    const e = mapaConMar({ dificultadIA: 'normal', mar: false });
    tileEn(e, 0, 1).terreno = 'water'; // lago de UNA casilla, pegado a la ciudad

    const eventos = jugarTurnoIA(e, 'bot', crearRng('charco'));
    expect(tiposDe(eventos, 'EdificioConstruido').some(d => d.edificio === 'port')).toBe(false);
  });
});

describe('las brujulas navales', () => {
  it('la de buque enemigo mide por el mar, no por tierra', () => {
    const e = mapaConMar();
    tileEn(e, 9, 1).ejercito = { tipo: 'warship', dueno: 'riv', salud: 70, movimientoRestante: 4, bonoMovimiento: 0 };

    const dist = distanciaABuqueEnemigo(e, 'bot');
    expect(dist.get('9,1')).toBe(0);
    expect(dist.get('0,1')).toBe(9);
    // La tierra no es camino para un buque: la fila 0 no tiene distancia.
    expect(dist.get('0,0')).toBeUndefined();
  });

  it('la de costa enemiga apunta al MAR pegado a la ciudad rival, no a la ciudad', () => {
    // Si la ciudad fuera el origen, la brujula prometeria un destino al que un
    // buque no puede llegar nunca, porque no pisa tierra.
    const e = mapaConMar();
    const dist = distanciaACostaEnemiga(e, 'bot');

    expect(dist.get('9,1')).toBe(0);   // mar pegado a la ciudad rival de (9,0)
    expect(dist.get('9,0')).toBeUndefined(); // la ciudad misma no esta en la brujula
    expect(dist.get('0,1')).toBe(9);
  });
});
