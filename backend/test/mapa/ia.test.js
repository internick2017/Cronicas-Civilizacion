import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { jugarTurnoIA, PERFILES_DIFICULTAD } from '../../src/domain/mapa/ia.js';
import { crearRng } from '../../src/domain/mapa/rng.js';
import { esNaval } from '../../src/domain/mapa/constantes.js';

function partidaCon(semilla, cantidadHumanos = 1) {
  const e = crearEstado({ nombre: 'T', semilla });
  aplicar(e, unirse(e, { id: 'bot', nombre: 'La Máquina', civilizacion: 'Autómatas', esBot: true }));
  for (let i = 1; i <= cantidadHumanos; i++) {
    aplicar(e, unirse(e, { id: `h${i}`, nombre: `H${i}`, civilizacion: `Civ${i}` }));
  }
  aplicar(e, iniciar(e));
  return e;
}

const jugarIA = (e, semilla = 'ia-1') => jugarTurnoIA(e, 'bot', crearRng(semilla));

describe('jugarTurnoIA', () => {
  let e;
  beforeEach(() => { e = partidaCon('mapa-ia-1'); });

  it('siempre termina cerrando el turno: el turno pasa al siguiente jugador', () => {
    expect(e.jugadores[e.indiceJugadorActual].id).toBe('bot');
    jugarIA(e);
    expect(e.jugadores[e.indiceJugadorActual].id).not.toBe('bot');
  });

  it('nunca tira una excepcion sin importar el terreno/semilla', () => {
    for (const semilla of ['a', 'b', 'c', 'd', 'e', 'mapa-raro', '123']) {
      const partida = partidaCon(semilla);
      expect(() => jugarTurnoIA(partida, 'bot', crearRng(semilla))).not.toThrow();
    }
  });

  it('devuelve una lista de eventos no vacia (siempre incluye el cierre de turno)', () => {
    const eventos = jugarIA(e);
    expect(eventos.length).toBeGreaterThan(0);
    expect(eventos.at(-1).tipo).toBe('TurnoAvanzado');
  });

  it('los eventos quedan realmente aplicados al estado (no es una simulacion aparte)', () => {
    const eventos = jugarIA(e);
    const huboConstruccionOReclutamiento = eventos.some(
      (ev) => ev.tipo === 'EdificioConstruido' || ev.tipo === 'UnidadReclutada' || ev.tipo === 'CiudadFundada');
    // Con recursos iniciales de sobra, el primer turno de la IA deberia hacer
    // AL MENOS una cosa productiva antes de terminar.
    expect(huboConstruccionOReclutamiento).toBe(true);
  });

  it('gasta recursos de verdad: el jugador termina con menos de lo que empezo', () => {
    const antes = { ...e.jugadores.find((j) => j.id === 'bot').recursos };
    jugarIA(e);
    const despues = e.jugadores.find((j) => j.id === 'bot').recursos;
    const gastoAlgo = Object.keys(antes).some((r) => despues[r] < antes[r]);
    expect(gastoAlgo).toBe(true);
  });

  it('prioriza aserradero/cantera si su capital no rinde madera o piedra (el bug que encontramos jugando)', () => {
    const capital = e.mapa.find((t) => t.ciudad && t.dueno === 'bot');
    // Fuerza el escenario problematico: capital en llanura, sin madera/piedra propia.
    capital.terreno = 'plains';
    e.jugadores.find((j) => j.id === 'bot').recursos = { food: 500, gold: 500, wood: 500, stone: 500, science: 0, culture: 0 };

    jugarIA(e);
    const construidos = capital.ciudad.edificios;
    expect(construidos.includes('sawmill') || construidos.includes('quarry')).toBe(true);
  });

  it('no se traba en un mapa mayormente agua (movimiento muy restringido)', () => {
    const partida = partidaCon('mapa-ia-1');
    for (const t of partida.mapa) {
      if (!t.ciudad) t.terreno = 'water';
    }
    expect(() => jugarTurnoIA(partida, 'bot', crearRng('agua'))).not.toThrow();
  });

  // El tope sale del perfil (hoy normal = ciudades + 3) en vez de un numero
  // clavado: el valor es balance y ya cambio una vez (subio cuando la IA paso a
  // jugar por dominacion, porque cada ejercito es un reclamador de territorio).
  // Lo que este test protege es que EXISTA un tope, no cual es.
  it('respeta el tope de ejercitos de su dificultad: no gasta todo en reclutar', () => {
    const jugador = e.jugadores.find((j) => j.id === 'bot');
    jugador.recursos = { food: 10000, gold: 10000, wood: 10000, stone: 10000, science: 0, culture: 0 };
    jugarIA(e);
    // Tierra y buques tienen topes separados (ver decidirReclutamientoNaval):
    // un buque no le come el lugar a un colono, asi que se cuentan aparte.
    const ejercitos = e.mapa.filter((t) => t.ejercito && t.ejercito.dueno === 'bot');
    const terrestres = ejercitos.filter((t) => !esNaval(t.ejercito.tipo)).length;
    const buques = ejercitos.filter((t) => esNaval(t.ejercito.tipo)).length;
    const ciudades = e.mapa.filter((t) => t.ciudad && t.dueno === 'bot').length;
    expect(terrestres).toBeLessThanOrEqual(ciudades + PERFILES_DIFICULTAD.normal.topeEjercitosExtra);
    expect(buques).toBeLessThanOrEqual(PERFILES_DIFICULTAD.normal.topeBuques);
  });

  it('descubre territorio nuevo al moverse (no da vueltas siempre sobre lo mismo)', () => {
    const jugador = e.jugadores.find((j) => j.id === 'bot');
    jugador.recursos = { food: 0, gold: 0, wood: 0, stone: 0, science: 0, culture: 0 }; // que no pueda construir/reclutar/fundar
    const capital = e.mapa.find((t) => t.ciudad && t.dueno === 'bot');
    const descubiertoAntes = e.mapa.filter((t) => t.descubiertoPor.includes('bot')).length;

    aplicar(e, [{ tipo: 'UnidadReclutada', turno: e.turno, jugadorId: 'bot', datos: { x: capital.x, y: capital.y, tipo: 'warrior' } }]);
    jugarIA(e);

    const descubiertoDespues = e.mapa.filter((t) => t.descubiertoPor.includes('bot')).length;
    expect(descubiertoDespues).toBeGreaterThan(descubiertoAntes);
  });

  it('juega una partida completa contra si misma (dos bots) sin trabarse', () => {
    const dos = crearEstado({ nombre: 'T', semilla: 'dos-bots' });
    aplicar(dos, unirse(dos, { id: 'bot1', nombre: 'B1', civilizacion: 'A', esBot: true }));
    aplicar(dos, unirse(dos, { id: 'bot2', nombre: 'B2', civilizacion: 'B', esBot: true }));
    aplicar(dos, iniciar(dos));

    let vueltas = 0;
    while (dos.estado === 'jugando' && vueltas < 60) {
      const actual = dos.jugadores[dos.indiceJugadorActual].id;
      jugarTurnoIA(dos, actual, crearRng(`vs-${vueltas}`));
      vueltas++;
    }
    // No hace falta que termine (60 rondas puede no alcanzar): lo que importa
    // es que nunca haya tirado y que el turno siempre haya seguido rotando.
    expect(vueltas).toBe(60);
  });
});
