import { describe, it, expect } from 'vitest';
import { crearEstado, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { terminarTurno } from '../../src/domain/mapa/reglas/turnos.js';
import { vistaJugador } from '../../src/domain/mapa/reglas/visibilidad.js';
import { PORCENTAJE_VICTORIA_DOMINACION } from '../../src/domain/mapa/constantes.js';

function partida(config = {}) {
  const e = crearEstado({ nombre: 'T', semilla: 'params', config });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'X' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Y' }));
  aplicar(e, iniciar(e));
  return e;
}

// Reparte la tierra: `fraccion` para p1, una casilla con ciudad para p2 (para
// que no lo eliminen y la partida no termine por ultimo_en_pie).
function repartir(e, fraccion) {
  const tierra = e.mapa.filter(t => t.terreno !== 'water');
  for (const t of tierra) { t.dueno = null; t.ciudad = null; }
  const cuantas = Math.floor(tierra.length * fraccion);
  tierra.slice(0, cuantas).forEach(t => { t.dueno = 'p1'; });
  tierra[0].ciudad = { nombre: 'C1', nivel: 1, poblacion: 500, edificios: [] };
  const deP2 = tierra[tierra.length - 1];
  deP2.dueno = 'p2';
  deP2.ciudad = { nombre: 'C2', nivel: 1, poblacion: 500, edificios: [] };
  return tierra.length;
}

const cerrarRonda = (e) => {
  const eventos = [];
  for (const j of [...e.jugadores]) {
    if (e.estado === 'jugando' && e.jugadores[e.indiceJugadorActual].id === j.id) {
      const evs = terminarTurno(e, j.id);
      eventos.push(...evs);
      aplicar(e, evs);
    }
  }
  return eventos;
};

describe('config: porcentaje de victoria por partida', () => {
  it('rechaza valores fuera de rango', () => {
    expect(() => crearEstado({ nombre: 'T', semilla: 's', config: { porcentajeVictoria: 10 } })).toThrow(/porcentajeVictoria/);
    expect(() => crearEstado({ nombre: 'T', semilla: 's', config: { porcentajeVictoria: 99 } })).toThrow(/porcentajeVictoria/);
    expect(() => crearEstado({ nombre: 'T', semilla: 's', config: { porcentajeVictoria: 60.5 } })).toThrow(/porcentajeVictoria/);
  });

  it('una partida al 50% se gana al 50%, no al 60%', () => {
    const e = partida({ porcentajeVictoria: 50 });
    repartir(e, 0.55); // alcanza para 50 pero no para 60
    expect(0.55).toBeLessThan(PORCENTAJE_VICTORIA_DOMINACION);

    const eventos = cerrarRonda(e);
    const fin = eventos.find(ev => ev.tipo === 'PartidaTerminada');
    expect(fin).toBeDefined();
    expect(fin.datos.ganador).toMatchObject({ jugadorId: 'p1', tipoVictoria: 'dominacion' });
  });

  it('una partida al 75% NO se gana con el 65%', () => {
    const e = partida({ porcentajeVictoria: 75 });
    repartir(e, 0.65);
    expect(cerrarRonda(e).some(ev => ev.tipo === 'PartidaTerminada')).toBe(false);
  });

  it('una partida vieja, sin el campo, sigue usando la constante de siempre', () => {
    const e = partida();
    delete e.config.porcentajeVictoria;   // como una partida guardada antes de esto
    repartir(e, PORCENTAJE_VICTORIA_DOMINACION + 0.02);
    const fin = cerrarRonda(e).find(ev => ev.tipo === 'PartidaTerminada');
    expect(fin.datos.ganador.tipoVictoria).toBe('dominacion');
  });
});

describe('config: limite de rondas', () => {
  it('rechaza un limite fuera de rango, pero acepta null (sin limite)', () => {
    expect(() => crearEstado({ nombre: 'T', semilla: 's', config: { limiteRondas: 3 } })).toThrow(/limiteRondas/);
    expect(() => crearEstado({ nombre: 'T', semilla: 's', config: { limiteRondas: null } })).not.toThrow();
  });

  it('al llegar al limite gana el que mas territorio tiene', () => {
    const e = partida();
    // Por debajo del minimo valido (10): se fija despues de crear, como ya
    // hacen otros tests con tamanoMapa. El minimo es una regla del juego (una
    // partida de 2 rondas no es una partida); lo que este test ejercita es el
    // final forzado, no la validacion.
    e.config.limiteRondas = 2;
    repartir(e, 0.3); // p1 tiene mas que p2, pero lejos del 60%
    cerrarRonda(e);   // ronda 1
    const eventos = cerrarRonda(e); // ronda 2 = limite

    const fin = eventos.find(ev => ev.tipo === 'PartidaTerminada');
    expect(fin).toBeDefined();
    expect(fin.datos.ganador).toMatchObject({ jugadorId: 'p1', tipoVictoria: 'limite_rondas' });
  });

  it('si al llegar al limite van iguales, no se inventa un ganador', () => {
    const e = partida();
    e.config.limiteRondas = 1;
    const tierra = e.mapa.filter(t => t.terreno !== 'water');
    for (const t of tierra) { t.dueno = null; t.ciudad = null; }
    // Una casilla con ciudad para cada uno: empate perfecto.
    tierra[0].dueno = 'p1'; tierra[0].ciudad = { nombre: 'C1', nivel: 1, poblacion: 500, edificios: [] };
    tierra[1].dueno = 'p2'; tierra[1].ciudad = { nombre: 'C2', nivel: 1, poblacion: 500, edificios: [] };

    const fin = cerrarRonda(e).find(ev => ev.tipo === 'PartidaTerminada');
    expect(fin).toBeDefined();
    expect(fin.datos.ganador).toBe(null);
  });

  it('sin limite, la partida sigue despues de muchas rondas', () => {
    const e = partida({ limiteRondas: null });
    repartir(e, 0.3);
    for (let i = 0; i < 5; i++) cerrarRonda(e);
    expect(e.estado).toBe('jugando');
  });
});

describe('la vista expone los parametros para que la interfaz no mienta', () => {
  it('el objetivo y el limite viajan en la config de la vista', () => {
    const e = partida({ porcentajeVictoria: 50, limiteRondas: 40, tamanoMapa: 14 });
    const vista = vistaJugador(e, 'p1');
    expect(vista.config.porcentajeVictoria).toBe(50);
    expect(vista.config.limiteRondas).toBe(40);
    expect(vista.config.tamanoMapa).toBe(14);
  });
});
