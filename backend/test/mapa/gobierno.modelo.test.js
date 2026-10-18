import { describe, it, expect } from 'vitest';
import { crearEstado, validarConfig } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { vistaJugador } from '../../src/domain/mapa/reglas/visibilidad.js';
import { GOBIERNOS } from '../../src/domain/mapa/constantes.js';
import {
  gobiernoDe, formaEstadoDe, estaEnPoder, apoyoDe, apoyoEfectivo, probabilidadSucesion,
} from '../../src/domain/mapa/reglas/gobierno.js';

describe('modelo de gobierno', () => {
  it('accesores devuelven los defaults en un jugador viejo', () => {
    expect(gobiernoDe({})).toBe('despotismo');
    expect(formaEstadoDe({})).toBe('unitario');
    expect(estaEnPoder({})).toBe(true);
    expect(apoyoDe({})).toEqual({ pueblo: 50, lideres: 50, militares: 50 });
  });

  it('gobiernoDe ignora claves del prototipo guardadas por error', () => {
    expect(gobiernoDe({ gobierno: 'toString' })).toBe('despotismo');
    expect(gobiernoDe({ gobierno: 'constructor' })).toBe('despotismo');
  });

  it('apoyoEfectivo suma el respeto del gobierno y acota a 100', () => {
    const j = { gobierno: 'monarquia', apoyo: { pueblo: 95, lideres: 50, militares: 50 } };
    expect(apoyoEfectivo(j, 'pueblo')).toBe(100);
    expect(apoyoEfectivo(j, 'lideres')).toBe(60);
    expect(apoyoEfectivo(j, 'militares')).toBe(50);
  });

  it('probabilidadSucesion por defecto es ~0,63%', () => {
    expect(probabilidadSucesion()).toBeCloseTo(0.0063, 4);
    expect(probabilidadSucesion(100)).toBeCloseTo(0.01, 6);
  });

  it('GOBIERNOS tiene exactamente los once gobiernos', () => {
    expect(Object.keys(GOBIERNOS).sort()).toEqual([
      'aristocracia', 'despotismo', 'estratocracia', 'monarquia', 'oligarquia',
      'republica_directa', 'republica_indirecta', 'republica_semidirecta',
      'tecnocracia', 'teocracia', 'tirania',
    ]);
  });

  it('validarConfig rechaza rondasEntreElecciones fuera de 2..50', () => {
    const ok = crearEstado({ nombre: 'T', semilla: 's' }).config;
    expect(ok.rondasEntreElecciones).toBe(8);
    for (const v of [1, 51, 2.5, 'x']) {
      expect(() => validarConfig({ ...ok, rondasEntreElecciones: v }))
        .toThrowError(expect.objectContaining({ codigo: 'CONFIG_INVALIDA' }));
    }
  });

  it('la vista expone gobierno y poder del rival pero no su apoyo', () => {
    const e = crearEstado({ nombre: 'T', semilla: 's1' });
    aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
    aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
    aplicar(e, iniciar(e));
    const v = vistaJugador(e, 'p1');
    const yo = v.jugadores.find(j => j.id === 'p1');
    const rival = v.jugadores.find(j => j.id === 'p2');
    expect(yo).toMatchObject({ gobierno: 'despotismo', formaEstado: 'unitario', enPoder: true });
    expect(yo.apoyo).toEqual({ pueblo: 50, lideres: 50, militares: 50 });
    expect(rival).toMatchObject({ gobierno: 'despotismo', formaEstado: 'unitario', enPoder: true });
    expect(yo.subdivisiones).toEqual([]);
    expect(rival.subdivisiones).toBeUndefined();
    expect(rival.apoyo).toBeUndefined();
    expect(rival.cambioBloqueadoHasta).toBeUndefined();
  });
});
