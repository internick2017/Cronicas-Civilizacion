import { describe, it, expect } from 'vitest';
import { crearEstado, toJSON, fromJSON, tileEn, puedePagar } from '../../src/domain/mapa/MapGame.js';
import { ReglaError } from '../../src/domain/mapa/errores.js';

const estadoBase = () => crearEstado({ nombre: 'Partida', semilla: 's1' });

describe('crearEstado', () => {
  it('crea el estado inicial del spec', () => {
    const e = estadoBase();
    expect(e.estado).toBe('esperando');
    expect(e.versionEsquema).toBe(1);
    expect(e.turno).toBe(0);
    expect(e.jugadores).toEqual([]);
    expect(e.mapa).toHaveLength(400);
    // El objetivo de territorio y el limite de rondas se eligen en el lobby por
    // partida; los defaults replican el comportamiento historico (60%, sin limite).
    expect(e.config).toEqual({
      tamanoMapa: 20, maxJugadores: 4, modoTurno: 'secuencial',
      porcentajeVictoria: 60, limiteRondas: null,
    });
    expect(e.ganador).toBeNull();
  });
});

describe('validacion de config (anti-OOM)', () => {
  const crear = (config) => () => crearEstado({ nombre: 'P', semilla: 's1', config });

  it('los defaults siguen siendo validos', () => {
    expect(crear(undefined)).not.toThrow();
    expect(crear({})).not.toThrow();
    expect(crearEstado({ nombre: 'P', semilla: 's1', config: { tamanoMapa: 10 } }).mapa).toHaveLength(100);
    expect(crearEstado({ nombre: 'P', semilla: 's1', config: { tamanoMapa: 60 } }).mapa).toHaveLength(3600);
  });

  it('tamanoMapa gigante (50000) es rechazado con CONFIG_INVALIDA en vez de reventar el proceso', () => {
    expect(crear({ tamanoMapa: 50000 })).toThrow(ReglaError);
    try {
      crearEstado({ nombre: 'P', semilla: 's1', config: { tamanoMapa: 50000 } });
    } catch (err) {
      expect(err.codigo).toBe('CONFIG_INVALIDA');
    }
  });

  it('tamanoMapa fuera de [10,60] o no entero es rechazado', () => {
    for (const valor of [9, 61, 600, 20.5, '20', NaN, null]) {
      expect(crear({ tamanoMapa: valor })).toThrow(ReglaError);
    }
  });

  it('maxJugadores 999 (y otros fuera de [2,8]) es rechazado con CONFIG_INVALIDA', () => {
    expect(crear({ maxJugadores: 999 })).toThrow(ReglaError);
    try {
      crearEstado({ nombre: 'P', semilla: 's1', config: { maxJugadores: 999 } });
    } catch (err) {
      expect(err.codigo).toBe('CONFIG_INVALIDA');
    }
    for (const valor of [1, 9, 2.5, '4', null]) {
      expect(crear({ maxJugadores: valor })).toThrow(ReglaError);
    }
  });

  it('modoTurno distinto de secuencial es rechazado (unico modo implementado)', () => {
    expect(crear({ modoTurno: 'simultaneo' })).toThrow(ReglaError);
    expect(crear({ modoTurno: 'secuencial' })).not.toThrow();
  });
});

describe('round-trip de serializacion (anti B3/B6)', () => {
  it('estado -> toJSON -> JSON.stringify -> parse -> fromJSON es identico', () => {
    const e = estadoBase();
    // simular partida avanzada a mano
    e.estado = 'jugando';
    e.jugadores.push({ id: 'p1', nombre: 'Ana', civilizacion: 'Incas',
      recursos: { food: 87, gold: 12, wood: 3, stone: 0, science: 5, culture: 9 }, activo: true });
    e.mapa[0].ciudad = { nombre: 'Cusco', nivel: 2, poblacion: 800, edificios: ['granary'] };
    e.mapa[0].dueno = 'p1';
    e.mapa[1].ejercito = { tipo: 'warrior', dueno: 'p1', salud: 55, movimientoRestante: 1 };
    e.mapa[0].descubiertoPor = ['p1'];
    const vuelta = fromJSON(JSON.parse(JSON.stringify(toJSON(e))));
    expect(vuelta).toEqual(e);
  });
});

describe('tileEn (anti A5)', () => {
  it('devuelve null fuera de rango en vez de reventar', () => {
    const e = estadoBase();
    expect(tileEn(e, 999, 999)).toBeNull();
    expect(tileEn(e, -1, 0)).toBeNull();
    expect(tileEn(e, 7, 3)).toMatchObject({ x: 7, y: 3 });
  });
});

describe('puedePagar (anti A4)', () => {
  const jugador = { recursos: { food: 100, gold: 50, wood: 0, stone: 0, science: 0, culture: 0 } };
  it('true si alcanza, false si no', () => {
    expect(puedePagar(jugador, { food: 50 })).toBe(true);
    expect(puedePagar(jugador, { wood: 1 })).toBe(false);
  });
  it('lanza RECURSO_DESCONOCIDO ante clave invalida (no NaN silencioso)', () => {
    expect(() => puedePagar(jugador, { mithril: 1 }))
      .toThrowError(expect.objectContaining({ codigo: 'RECURSO_DESCONOCIDO' }));
  });
});
