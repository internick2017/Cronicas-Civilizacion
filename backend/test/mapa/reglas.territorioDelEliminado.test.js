import { describe, it, expect } from 'vitest';
import { crearEstado, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { terminarTurno } from '../../src/domain/mapa/reglas/turnos.js';
import { moverEjercito } from '../../src/domain/mapa/reglas/movimiento.js';
import { fundarCiudad } from '../../src/domain/mapa/reglas/ciudades.js';
import { abandonar } from '../../src/domain/mapa/reglas/abandono.js';
import { controlTerritorial } from '../../src/domain/mapa/reglas/dominacion.js';

// Tres jugadores porque con dos la partida termina apenas cae uno
// (ultimo_en_pie) y no se llega a ver que pasa con su territorio.
function partidaTresJugadores() {
  const e = crearEstado({ nombre: 'T', semilla: 'eliminado-1' });
  for (const [id, civ] of [['p1', 'X'], ['p2', 'Y'], ['p3', 'Z']]) {
    aplicar(e, unirse(e, { id, nombre: id.toUpperCase(), civilizacion: civ }));
  }
  aplicar(e, iniciar(e));
  return e;
}

// Le saca la capital a p2 y le deja territorio suelto (el que se reclama
// caminando), que es el caso real: te capturan la ultima ciudad pero tus
// casillas quedan en el mapa.
function p2SinCiudadesPeroConTierra(e, cantidad = 3) {
  const capital = e.mapa.find(t => t.ciudad && t.dueno === 'p2');
  capital.ciudad = null;
  capital.dueno = null;
  const sueltas = e.mapa.filter(t => t.terreno !== 'water' && !t.dueno && !t.ciudad).slice(0, cantidad);
  for (const t of sueltas) t.dueno = 'p2';
  return sueltas;
}

const cerrarRonda = (e) => {
  for (const j of [...e.jugadores]) {
    if (e.estado === 'jugando' && e.jugadores[e.indiceJugadorActual].id === j.id) {
      aplicar(e, terminarTurno(e, j.id));
    }
  }
};

describe('el territorio de un jugador eliminado', () => {
  it('deja de tener dueño: si no, es un muro que nadie puede cruzar ni tomar', () => {
    const e = partidaTresJugadores();
    const sueltas = p2SinCiudadesPeroConTierra(e);

    cerrarRonda(e);

    expect(e.jugadores.find(j => j.id === 'p2').activo).toBe(false);
    for (const t of sueltas) {
      expect(tileEn(e, t.x, t.y).dueno).toBe(null);
    }
  });

  it('se puede volver a caminar y a fundar sobre esa tierra', () => {
    const e = partidaTresJugadores();
    const [suelta] = p2SinCiudadesPeroConTierra(e);
    cerrarRonda(e);

    // Un ejercito de p1 pegado a la casilla liberada.
    const vecina = [[0, -1], [0, 1], [-1, 0], [1, 0]]
      .map(([dx, dy]) => tileEn(e, suelta.x + dx, suelta.y + dy))
      .find(t => t && t.terreno !== 'water' && !t.ciudad);
    expect(vecina).toBeDefined();
    vecina.dueno = 'p1';
    vecina.ejercito = { tipo: 'warrior', dueno: 'p1', salud: 100, movimientoRestante: 2 };
    while (e.jugadores[e.indiceJugadorActual].id !== 'p1') {
      aplicar(e, terminarTurno(e, e.jugadores[e.indiceJugadorActual].id));
    }

    expect(() => moverEjercito(e, 'p1', {
      desde: { x: vecina.x, y: vecina.y }, hasta: { x: suelta.x, y: suelta.y },
    })).not.toThrow();

    const jugador = e.jugadores.find(j => j.id === 'p1');
    jugador.recursos = { food: 500, gold: 500, wood: 500, stone: 500, science: 0, culture: 0 };
    expect(() => fundarCiudad(e, 'p1', { x: suelta.x, y: suelta.y, nombre: 'Nueva' })).not.toThrow();
  });

  it('esas casillas vuelven a estar disponibles para la victoria por dominacion', () => {
    const e = partidaTresJugadores();
    p2SinCiudadesPeroConTierra(e);
    cerrarRonda(e);

    const tierra = e.mapa.filter(t => t.terreno !== 'water');
    const sinDueno = tierra.filter(t => !t.dueno).length;
    const deP2 = tierra.filter(t => t.dueno === 'p2').length;
    expect(deP2).toBe(0);
    // El denominador no cambia (la tierra es la misma); lo que cambia es que
    // ninguna casilla queda fuera de alcance para siempre.
    expect(controlTerritorial(e, 'p2').tiles).toBe(0);
    expect(sinDueno).toBeGreaterThan(0);
  });

  it('al abandonar tambien libera la tierra suelta, pero NO las ciudades', () => {
    const e = partidaTresJugadores();
    const capital = e.mapa.find(t => t.ciudad && t.dueno === 'p2');
    const [suelta] = e.mapa.filter(t => t.terreno !== 'water' && !t.dueno && !t.ciudad).slice(0, 1);
    suelta.dueno = 'p2';

    aplicar(e, abandonar(e, 'p2'));

    expect(tileEn(e, suelta.x, suelta.y).dueno).toBe(null);
    // La ciudad sigue siendo suya: como ciudad enemiga SI se puede atacar y
    // capturar, asi que no es un muro; volverla sin dueño obligaria a inventar
    // que significa una ciudad de nadie.
    expect(tileEn(e, capital.x, capital.y).dueno).toBe('p2');
    expect(tileEn(e, capital.x, capital.y).ciudad).not.toBe(null);
  });
});
