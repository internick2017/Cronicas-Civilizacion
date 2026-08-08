import { describe, it, expect } from 'vitest';
import { crearEstado, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { UNIDADES, RECURSOS_INICIALES } from '../../src/domain/mapa/constantes.js';

const ev = (tipo, jugadorId, datos = {}) => ({ tipo, turno: 1, jugadorId, datos });

function estadoConJugador() {
  const e = crearEstado({ nombre: 'T', semilla: 's' });
  aplicar(e, [ev('JugadorUnido', null, { id: 'p1', nombre: 'Ana', civilizacion: 'Incas' })]);
  return e;
}

describe('aplicar', () => {
  it('JugadorUnido agrega jugador con recursos iniciales completos', () => {
    const e = estadoConJugador();
    expect(e.jugadores).toHaveLength(1);
    expect(e.jugadores[0].recursos).toEqual(RECURSOS_INICIALES);
    expect(e.jugadores[0].activo).toBe(true);
  });

  it('PartidaIniciada fija estado, turno e indiceJugadorActual', () => {
    const e = estadoConJugador();
    e.turno = 0;
    aplicar(e, [ev('PartidaIniciada', null, {})]);
    expect(e.estado).toBe('jugando');
    expect(e.turno).toBe(1);
    expect(e.indiceJugadorActual).toBe(0);
  });

  it('CiudadFundada + TerritorioReclamado + RecursosGastados', () => {
    const e = estadoConJugador();
    aplicar(e, [
      ev('RecursosGastados', 'p1', { costo: { food: 50, wood: 30 } }),
      ev('CiudadFundada', 'p1', { x: 3, y: 4, nombre: 'Cusco' }),
    ]);
    expect(e.jugadores[0].recursos.food).toBe(RECURSOS_INICIALES.food - 50);
    expect(tileEn(e, 3, 4).ciudad).toMatchObject({ nombre: 'Cusco', nivel: 1 });
    expect(tileEn(e, 3, 4).dueno).toBe('p1');
  });

  it('TerritorioReclamado asigna el dueno del tile', () => {
    const e = estadoConJugador();
    expect(tileEn(e, 5, 5).dueno).toBeNull();
    aplicar(e, [ev('TerritorioReclamado', 'p1', { x: 5, y: 5 })]);
    expect(tileEn(e, 5, 5).dueno).toBe('p1');
  });

  it('EdificioConstruido agrega el edificio a la ciudad', () => {
    const e = estadoConJugador();
    aplicar(e, [ev('CiudadFundada', 'p1', { x: 3, y: 4, nombre: 'Cusco' })]);
    aplicar(e, [ev('EdificioConstruido', 'p1', { x: 3, y: 4, edificio: 'granary' })]);
    expect(tileEn(e, 3, 4).ciudad.edificios).toEqual(['granary']);
  });

  it('RecursosProducidos suma al jugador indicado en datos.jugadorId', () => {
    const e = estadoConJugador();
    aplicar(e, [ev('RecursosProducidos', null, { jugadorId: 'p1', produccion: { food: 5, gold: 3 } })]);
    expect(e.jugadores[0].recursos.food).toBe(RECURSOS_INICIALES.food + 5);
    expect(e.jugadores[0].recursos.gold).toBe(RECURSOS_INICIALES.gold + 3);
  });

  it('TerritorioDescubierto es por jugador y sin duplicados (anti A2)', () => {
    const e = estadoConJugador();
    const evento = ev('TerritorioDescubierto', 'p1', { tiles: [{ x: 0, y: 0 }, { x: 1, y: 0 }] });
    aplicar(e, [evento, evento]);
    expect(tileEn(e, 0, 0).descubiertoPor).toEqual(['p1']);
    expect(tileEn(e, 1, 0).descubiertoPor).toEqual(['p1']);
    expect(tileEn(e, 2, 0).descubiertoPor).toEqual([]);
  });

  it('UnidadReclutada + EjercitoMovido + RondaCompletada restaura movimiento', () => {
    const e = estadoConJugador();
    aplicar(e, [ev('UnidadReclutada', 'p1', { x: 2, y: 2, tipo: 'warrior' })]);
    expect(tileEn(e, 2, 2).ejercito).toMatchObject({ tipo: 'warrior', salud: 100, movimientoRestante: 2 });
    aplicar(e, [ev('EjercitoMovido', 'p1', { desde: { x: 2, y: 2 }, hasta: { x: 3, y: 2 } })]);
    expect(tileEn(e, 2, 2).ejercito).toBeNull();
    expect(tileEn(e, 3, 2).ejercito.movimientoRestante).toBe(1);
    aplicar(e, [ev('RondaCompletada', null)]);
    expect(tileEn(e, 3, 2).ejercito.movimientoRestante).toBe(UNIDADES.warrior.movimiento);
  });

  it('CombateResuelto aplica danos y deja al atacante sin movimiento', () => {
    const e = estadoConJugador();
    aplicar(e, [ev('UnidadReclutada', 'p1', { x: 1, y: 1, tipo: 'warrior' })]);
    aplicar(e, [ev('UnidadReclutada', 'p1', { x: 2, y: 1, tipo: 'archer' })]);
    aplicar(e, [ev('CombateResuelto', 'p1', {
      desde: { x: 1, y: 1 },
      hasta: { x: 2, y: 1 },
      danoAtacante: 10,
      danoDefensor: 15,
    })]);
    expect(tileEn(e, 1, 1).ejercito.salud).toBe(100 - 10);
    expect(tileEn(e, 2, 1).ejercito.salud).toBe(80 - 15);
    expect(tileEn(e, 1, 1).ejercito.movimientoRestante).toBe(0);
  });

  it('UnidadDestruida deja el tile sin ejercito', () => {
    const e = estadoConJugador();
    aplicar(e, [ev('UnidadReclutada', 'p1', { x: 2, y: 2, tipo: 'warrior' })]);
    aplicar(e, [ev('UnidadDestruida', 'p1', { x: 2, y: 2 })]);
    expect(tileEn(e, 2, 2).ejercito).toBeNull();
  });

  it('CiudadCapturada cambia el dueno del tile', () => {
    const e = estadoConJugador();
    aplicar(e, [ev('CiudadFundada', 'p1', { x: 3, y: 4, nombre: 'Cusco' })]);
    aplicar(e, [ev('CiudadCapturada', 'p2', { x: 3, y: 4 })]);
    expect(tileEn(e, 3, 4).dueno).toBe('p2');
  });

  it('TurnoAvanzado asigna indiceJugadorActual y turno', () => {
    const e = estadoConJugador();
    aplicar(e, [ev('TurnoAvanzado', null, { indiceJugadorActual: 1, turno: 5 })]);
    expect(e.indiceJugadorActual).toBe(1);
    expect(e.turno).toBe(5);
  });

  it('JugadorEliminado marca al jugador como inactivo', () => {
    const e = estadoConJugador();
    aplicar(e, [ev('JugadorEliminado', null, { jugadorId: 'p1' })]);
    expect(e.jugadores[0].activo).toBe(false);
  });

  it('PartidaTerminada fija ganador y estado', () => {
    const e = estadoConJugador();
    aplicar(e, [ev('PartidaTerminada', null, { ganador: { jugadorId: 'p1', tipoVictoria: 'dominacion', turno: 9 } })]);
    expect(e.estado).toBe('terminado');
    expect(e.ganador.tipoVictoria).toBe('dominacion');
  });

  it('evento desconocido lanza EVENTO_DESCONOCIDO', () => {
    const e = estadoConJugador();
    expect(() => aplicar(e, [ev('Zarasa', 'p1')]))
      .toThrowError(expect.objectContaining({ codigo: 'EVENTO_DESCONOCIDO' }));
  });
});
