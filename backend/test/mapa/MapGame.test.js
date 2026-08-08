import { describe, it, expect } from 'vitest';
import { crearEstado, toJSON, fromJSON, tileEn, puedePagar } from '../../src/domain/mapa/MapGame.js';

const estadoBase = () => crearEstado({ nombre: 'Partida', semilla: 's1' });

describe('crearEstado', () => {
  it('crea el estado inicial del spec', () => {
    const e = estadoBase();
    expect(e.estado).toBe('esperando');
    expect(e.versionEsquema).toBe(1);
    expect(e.turno).toBe(0);
    expect(e.jugadores).toEqual([]);
    expect(e.mapa).toHaveLength(400);
    expect(e.config).toEqual({ tamanoMapa: 20, maxJugadores: 4, modoTurno: 'secuencial' });
    expect(e.ganador).toBeNull();
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
