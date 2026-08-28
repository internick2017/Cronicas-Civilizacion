import { describe, it, expect } from 'vitest';
import { crearEstado, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import {
  jugarTurnoIA, PERFILES_DIFICULTAD, distanciaATierraTomable, distanciaACiudadEnemiga,
} from '../../src/domain/mapa/ia.js';
import { crearRng } from '../../src/domain/mapa/rng.js';
import { UNIDADES, defensaCiudad, BONO_DEFENSA_CIUDAD } from '../../src/domain/mapa/constantes.js';

// Franja 10x1: [ciudad bot][bot x4][rival x3][ciudad rival]. No queda tierra
// SIN DUEÑO: lo unico que el bot puede ganar es territorio del rival. Es la
// frontera sellada que trababa las partidas.
const ANCHO = 10;
function franjaConRival(dificultadIA) {
  const e = crearEstado({ nombre: 'T', semilla: 'ofensiva' });
  aplicar(e, unirse(e, { id: 'bot', nombre: 'M', civilizacion: 'A', esBot: true, dificultadIA }));
  aplicar(e, unirse(e, { id: 'riv', nombre: 'R', civilizacion: 'B' }));
  aplicar(e, iniciar(e));
  e.config.tamanoMapa = ANCHO;
  const tile = (x, y, extra) => ({ x, y, terreno: 'plains', recurso: null, dueno: null, ciudad: null, ejercito: null, descubiertoPor: ['bot', 'riv'], ...extra });
  const ciudad = (n) => ({ nombre: n, nivel: 1, poblacion: 500, edificios: [] });
  e.mapa = [];
  for (let x = 0; x < ANCHO; x++) {
    const mia = x <= 4;
    e.mapa.push(tile(x, 0, {
      dueno: mia ? 'bot' : 'riv',
      ciudad: x === 0 ? ciudad('B1') : x === ANCHO - 1 ? ciudad('R1') : null,
    }));
  }
  for (let x = 0; x < ANCHO; x++) e.mapa.push(tile(x, 1, { terreno: 'water' }));
  tileEn(e, 4, 0).ejercito = { tipo: 'warrior', dueno: 'bot', salud: 100, movimientoRestante: 2, bonoMovimiento: 0 };
  e.jugadores.find(j => j.id === 'bot').recursos = { food: 0, gold: 0, wood: 0, stone: 0, science: 0, culture: 0 };
  return e;
}

describe('brujulas de la IA', () => {
  it('la de tierra tomable cuenta la casilla enemiga, no solo la libre', () => {
    const e = franjaConRival('normal');
    const dist = distanciaATierraTomable(e, 'bot');
    expect(dist.get('5,0')).toBe(0);  // primera casilla del rival: tomable ya
    expect(dist.get('4,0')).toBe(1);
    expect(dist.get('0,0')).toBe(5);
  });

  it('la ofensiva mide la distancia a la ciudad enemiga', () => {
    const e = franjaConRival('dificil');
    const dist = distanciaACiudadEnemiga(e, 'bot');
    expect(dist.get(`${ANCHO - 1},0`)).toBe(0); // la ciudad rival
    expect(dist.get(`${ANCHO - 2},0`)).toBe(1);
    expect(dist.get('4,0')).toBe(5);
  });
});

describe('agresividad segun la dificultad', () => {
  const avanzo = (e) => {
    const antes = e.mapa.filter(t => t.dueno === 'bot').length;
    for (let i = 0; i < 6 && e.estado === 'jugando'; i++) {
      jugarTurnoIA(e, 'bot', crearRng(`ofe-${i}`));
      const otro = e.jugadores[e.indiceJugadorActual];
      if (otro.id !== 'bot' && e.estado === 'jugando') {
        aplicar(e, [{ tipo: 'TurnoAvanzado', turno: e.turno, jugadorId: otro.id, datos: { indiceJugadorActual: 0, turno: e.turno } }]);
      }
    }
    return e.mapa.filter(t => t.dueno === 'bot').length - antes;
  };

  it('facil no marcha sobre el rival', () => {
    expect(PERFILES_DIFICULTAD.facil.ofensiva).toBe('nunca');
  });

  it('normal y dificil si, y dificil desde el principio', () => {
    expect(PERFILES_DIFICULTAD.normal.ofensiva).toBe('sinTierraLibre');
    expect(PERFILES_DIFICULTAD.dificil.ofensiva).toBe('siempre');
  });

  it('normal le come territorio al rival cuando no le queda tierra libre', () => {
    expect(avanzo(franjaConRival('normal'))).toBeGreaterThan(0);
  });

  it('dificil tambien, y recluta algo capaz de tomar una ciudad', () => {
    const e = franjaConRival('dificil');
    expect(avanzo(e)).toBeGreaterThan(0);
    const capturadoras = Object.entries(UNIDADES)
      .filter(([, u]) => (u.ataque + 2) * 1.2 > defensaCiudad(1) * 0.8 * BONO_DEFENSA_CIUDAD)
      .map(([tipo]) => tipo);
    expect(PERFILES_DIFICULTAD.dificil.unidadesPrioridad.some(u => capturadoras.includes(u))).toBe(true);
    expect(PERFILES_DIFICULTAD.normal.unidadesPrioridad.some(u => capturadoras.includes(u))).toBe(true);
  });
});
