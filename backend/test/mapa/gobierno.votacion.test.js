import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado, jugadorPorId } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import {
  resultadoVotacion, proponerGobierno, cambiarFormaEstado, darVentajas,
} from '../../src/domain/mapa/reglas/gobierno.js';

let e, p1;
beforeEach(() => {
  e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  p1 = jugadorPorId(e, 'p1');
  p1.recursos = { food: 99, gold: 999, wood: 99, stone: 99, science: 99, culture: 99 };
});
const codigo = (fn) => { try { fn(); } catch (err) { return err.codigo; } return null; };

describe('proponerGobierno', () => {
  it('despotismo aprueba siempre, sin gastar oro', () => {
    const evs = proponerGobierno(e, 'p1', { gobierno: 'republica_directa' });
    expect(evs.map(x => x.tipo)).toEqual(['GobiernoCambiado']);
    aplicar(e, evs);
    expect(p1.gobierno).toBe('republica_directa');
    expect(p1.recursos.gold).toBe(999);
  });

  it('monarquía aprueba siempre si es el líder', () => {
    p1.gobierno = 'monarquia';
    expect(proponerGobierno(e, 'p1', { gobierno: 'despotismo' })[0].tipo).toBe('GobiernoCambiado');
  });

  it('república directa: con apoyo 50 y preferencia desfavorable, falla y bloquea 3 turnos', () => {
    p1.gobierno = 'republica_directa';
    const evs = proponerGobierno(e, 'p1', { gobierno: 'despotismo' });
    expect(evs.map(x => x.tipo)).toEqual(['VotacionFallida']);
    expect(evs[0].datos.hastaTurno).toBe(e.turno + 3);
    aplicar(e, evs);
    expect(p1.gobierno).toBe('republica_directa');
    expect(codigo(() => proponerGobierno(e, 'p1', { gobierno: 'monarquia' }))).toBe('EN_ENFRIAMIENTO');
  });

  it('el oro ofrecido puede dar vuelta una votación que iba perdida', () => {
    p1.gobierno = 'republica_directa';
    expect(resultadoVotacion(e, 'p1', 'despotismo', 0).aprobada).toBe(false);
    expect(resultadoVotacion(e, 'p1', 'despotismo', 60).aprobada).toBe(true);
    const evs = proponerGobierno(e, 'p1', { gobierno: 'despotismo', oro: 60 });
    expect(evs.map(x => x.tipo)).toEqual(['RecursosGastados', 'GobiernoCambiado']);
    expect(evs[0].datos.costo).toEqual({ gold: 60 });
  });

  it('el oro gastado en una votación fallida no se devuelve', () => {
    p1.gobierno = 'republica_directa';
    const evs = proponerGobierno(e, 'p1', { gobierno: 'despotismo', oro: 10 });
    expect(evs.map(x => x.tipo)).toEqual(['RecursosGastados', 'VotacionFallida']);
    aplicar(e, evs);
    expect(p1.recursos.gold).toBe(989);
  });

  it('rechaza gobierno inválido, igual al actual, enfriamiento, sin poder y sin oro, sin emitir nada', () => {
    expect(codigo(() => proponerGobierno(e, 'p1', { gobierno: 'anarquia' }))).toBe('GOBIERNO_INVALIDO');
    expect(codigo(() => proponerGobierno(e, 'p1', { gobierno: 'despotismo' }))).toBe('GOBIERNO_IGUAL');
    expect(codigo(() => proponerGobierno(e, 'p1', { gobierno: 'monarquia', oro: 5000 }))).toBe('RECURSOS_INSUFICIENTES');
    expect(codigo(() => proponerGobierno(e, 'p1', { gobierno: 'monarquia', oro: -1 }))).toBe('ORO_INVALIDO');
    p1.cambioBloqueadoHasta = e.turno + 2;
    expect(codigo(() => proponerGobierno(e, 'p1', { gobierno: 'monarquia' }))).toBe('EN_ENFRIAMIENTO');
    p1.cambioBloqueadoHasta = 0;
    p1.enPoder = false;
    expect(codigo(() => proponerGobierno(e, 'p1', { gobierno: 'monarquia' }))).toBe('SIN_PODER');
  });

  it('rechaza claves del prototipo como gobierno', () => {
    for (const gobierno of ['toString', 'constructor', '__proto__', 'hasOwnProperty']) {
      expect(codigo(() => proponerGobierno(e, 'p1', { gobierno }))).toBe('GOBIERNO_INVALIDO');
    }
  });

  it('donde nadie vota (despotismo, monarquía) el oro ofrecido no se gasta', () => {
    const evs = proponerGobierno(e, 'p1', { gobierno: 'monarquia', oro: 50 });
    expect(evs.map(x => x.tipo)).toEqual(['GobiernoCambiado']);
    p1.gobierno = 'monarquia';
    expect(proponerGobierno(e, 'p1', { gobierno: 'despotismo', oro: 50 }).map(x => x.tipo)).toEqual(['GobiernoCambiado']);
  });

  it('no exige que sea tu turno', () => {
    expect(codigo(() => proponerGobierno(e, 'p2', { gobierno: 'monarquia' }))).toBeNull();
  });

  it('semidirecta pondera 50/50 pueblo y líderes', () => {
    p1.gobierno = 'republica_semidirecta';
    p1.apoyo = { pueblo: 100, lideres: 0, militares: 50 };
    // pueblo: 0,4*100 + 0,6*55 = 73 ; líderes: 0,4*0 + 0,6*30 = 18
    expect(resultadoVotacion(e, 'p1', 'republica_directa', 0).porcentaje).toBeCloseTo(45.5, 5);
  });
});

describe('darVentajas', () => {
  it('sube el apoyo y gasta oro, también sin poder y fuera de turno', () => {
    p1.enPoder = false;
    const evs = darVentajas(e, 'p1', { grupo: 'pueblo', oro: 50 });
    expect(evs.map(x => x.tipo)).toEqual(['RecursosGastados', 'ApoyoActualizado']);
    aplicar(e, evs);
    expect(p1.apoyo.pueblo).toBe(60);
    expect(p1.apoyo.lideres).toBe(50);
    expect(p1.recursos.gold).toBe(949);
  });

  it('acota a 100 y rechaza grupo inválido u oro menor al mínimo', () => {
    p1.apoyo = { pueblo: 99, lideres: 50, militares: 50 };
    aplicar(e, darVentajas(e, 'p1', { grupo: 'pueblo', oro: 500 }));
    expect(p1.apoyo.pueblo).toBe(100);
    expect(codigo(() => darVentajas(e, 'p1', { grupo: 'dioses', oro: 50 }))).toBe('GRUPO_INVALIDO');
    expect(codigo(() => darVentajas(e, 'p1', { grupo: 'pueblo', oro: 4 }))).toBe('ORO_INVALIDO');
  });
});

describe('cambiarFormaEstado', () => {
  it('federal y de vuelta es gratis', () => {
    aplicar(e, cambiarFormaEstado(e, 'p1', { formaEstado: 'federal' }));
    expect(p1.formaEstado).toBe('federal');
    aplicar(e, cambiarFormaEstado(e, 'p1', { formaEstado: 'unitario' }));
    expect(p1.formaEstado).toBe('unitario');
    expect(p1.recursos.gold).toBe(999);
  });
  it('rechaza una forma inválida y a quien no tiene el poder', () => {
    expect(codigo(() => cambiarFormaEstado(e, 'p1', { formaEstado: 'imperio' }))).toBe('FORMA_ESTADO_INVALIDA');
    p1.enPoder = false;
    expect(codigo(() => cambiarFormaEstado(e, 'p1', { formaEstado: 'federal' }))).toBe('SIN_PODER');
  });
});
