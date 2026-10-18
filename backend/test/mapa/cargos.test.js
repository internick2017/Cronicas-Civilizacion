import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { MapGameRepo } from '../../src/db/MapGameRepo.js';
import { MapGameService } from '../../src/services/MapGameService.js';
import { validarCargos, cargosDe, cargoQueFalta } from '../../src/domain/mapa/reglas/cargos.js';

async function partida(cargos) {
  const repo = new MapGameRepo(new Database(':memory:'), 'sqlite');
  repo.init();
  const svc = new MapGameService({ repo });
  const { id } = await svc.crearPartida({ nombre: 'Solo', contraIA: true });
  const { token, vista } = await svc.unirse(id, { id: 'yo', nombre: 'Yo', civilizacion: 'Incas', cargos });
  await svc.iniciar(id);
  return { svc, id, token, vista };
}

describe('reglas de cargos', () => {
  it('sin cargos se asumen los dos; uno solo o los dos son validos', () => {
    expect(validarCargos(undefined)).toEqual(['estado', 'gobierno']);
    expect(validarCargos(['gobierno'])).toEqual(['gobierno']);
    expect(validarCargos(['gobierno', 'estado'])).toEqual(['estado', 'gobierno']);
  });

  it('vacio o desconocido se rechaza', () => {
    expect(() => validarCargos([])).toThrow(/Jefe de Estado/);
    expect(() => validarCargos(['rey'])).toThrow(/Jefe de Estado/);
    expect(() => validarCargos('estado')).toThrow(/Jefe de Estado/);
  });

  it('una partida vieja sin cargos juega con los dos', () => {
    expect(cargosDe({})).toEqual(['estado', 'gobierno']);
  });

  it('cada orden pertenece a un cargo; terminar turno es libre', () => {
    const soloEstado = { cargos: ['estado'] };
    expect(cargoQueFalta(soloEstado, 'construir')).toBe('gobierno');
    expect(cargoQueFalta(soloEstado, 'atacar')).toBeNull();
    expect(cargoQueFalta(soloEstado, 'terminarTurno')).toBeNull();
  });
});

describe('cargos en la partida', () => {
  it('la vista del jugador trae sus cargos', async () => {
    const { vista } = await partida(['estado']);
    expect(vista.jugadores.find(j => j.id === 'yo').cargos).toEqual(['estado']);
  });

  it('Jefe de Estado solo: no puede dar ordenes internas', async () => {
    const { svc, id, token } = await partida(['estado']);
    await expect(svc.accion(id, 'yo', { tipo: 'construir', x: 0, y: 0, edificio: 'farm' }, token))
      .rejects.toMatchObject({ codigo: 'CARGO_NO_ASUMIDO' });
    await expect(svc.accion(id, 'yo', { tipo: 'proponerGobierno', gobierno: 'monarquia' }, token))
      .rejects.toMatchObject({ codigo: 'CARGO_NO_ASUMIDO' });
  });

  it('Jefe de Gobierno solo: no puede mover ni atacar ni hacer alianzas', async () => {
    const { svc, id, token } = await partida(['gobierno']);
    for (const tipo of ['moverEjercito', 'atacar', 'proponerAlianza']) {
      await expect(svc.accion(id, 'yo', { tipo }, token)).rejects.toMatchObject({ codigo: 'CARGO_NO_ASUMIDO' });
    }
  });

  it('con los dos cargos el control no cambia', async () => {
    const { svc, id, token } = await partida(['estado', 'gobierno']);
    await expect(svc.accion(id, 'yo', { tipo: 'proponerGobierno', gobierno: 'despotismo' }, token))
      .rejects.toMatchObject({ codigo: 'GOBIERNO_IGUAL' });
  });

  it('al terminar el turno la maquina lleva el cargo que falta y la partida avanza', async () => {
    const { svc, id, token } = await partida(['estado']);
    const r = await svc.accion(id, 'yo', { tipo: 'terminarTurno' }, token);
    // El humano no ordeno nada interno, pero la maquina construyo por el antes de cerrar.
    expect(r.eventos.some(e => e.jugadorId === 'yo' && e.tipo === 'EdificioConstruido')).toBe(true);
    expect(r.vista.turno).toBeGreaterThan(1);
  });

  it('con los dos cargos nadie construye por el', async () => {
    const { svc, id, token } = await partida(['estado', 'gobierno']);
    const r = await svc.accion(id, 'yo', { tipo: 'terminarTurno' }, token);
    expect(r.eventos.some(e => e.jugadorId === 'yo' && e.tipo === 'EdificioConstruido')).toBe(false);
  });
});
