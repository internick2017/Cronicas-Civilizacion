import { describe, it, expect } from 'vitest';
import { anotar, cronicaFinal } from '../../src/domain/mapa/cronicaFinal.js';

const base = (extra = {}) => ({
  estado: 'terminado', turno: 12, bitacora: [],
  jugadores: [{ id: 'a', nombre: 'Ana' }, { id: 'b', nombre: 'Beto' }],
  ganador: { jugadorId: 'a', tipoVictoria: 'dominacion' },
  ...extra,
});

describe('cronicaFinal', () => {
  it('es null mientras la partida sigue', () => {
    expect(cronicaFinal(base({ estado: 'jugando' }))).toBeNull();
  });

  it('anota solo los hechos que cuentan', () => {
    const e = base();
    anotar(e, { tipo: 'TerritorioReclamado', turno: 3, jugadorId: 'a', datos: {} });
    anotar(e, { tipo: 'CiudadCapturada', turno: 3, jugadorId: 'a', datos: { x: 1, y: 1 } });
    expect(e.bitacora).toEqual([{ t: 3, tipo: 'CiudadCapturada', j: 'a' }]);
  });

  it('cuenta guerras, caídas y desenlace con nombres, no ids', () => {
    const e = base();
    anotar(e, { tipo: 'CiudadFundada', turno: 1, jugadorId: 'a', datos: { nombre: 'X' } });
    anotar(e, { tipo: 'CiudadCapturada', turno: 5, jugadorId: 'a', datos: {} });
    anotar(e, { tipo: 'JugadorEliminado', turno: 9, jugadorId: 'a', datos: { jugadorId: 'b' } });
    const texto = cronicaFinal(e).map(c => c.texto).join(' ');
    expect(texto).toContain('En la ronda 5, Ana tomó una ciudad.');
    expect(texto).toContain('Beto quedó sin ciudades en la ronda 9.');
    expect(texto).toContain('Después de 12 rondas: Ana se impuso por dominación.');
    expect(texto).not.toMatch(/\b[ab]\b/);
  });

  it('sin vencedores y con tope de bitácora', () => {
    const e = base({ ganador: null });
    for (let i = 0; i < 450; i++) anotar(e, { tipo: 'CiudadCapturada', turno: i, jugadorId: 'a', datos: {} });
    expect(e.bitacora).toHaveLength(400);
    expect(cronicaFinal(e).at(-1).texto).toContain('sin vencedores');
  });
});

describe('maravillas', () => {
  it('la crónica cuenta quién levantó cada una', () => {
    const e = base();
    anotar(e, { tipo: 'EdificioConstruido', turno: 7, jugadorId: 'b', datos: { edificio: 'coloso' } });
    anotar(e, { tipo: 'EdificioConstruido', turno: 7, jugadorId: 'b', datos: { edificio: 'market' } });
    expect(e.bitacora).toHaveLength(1);
    expect(cronicaFinal(e).find(c => c.titulo === 'Las maravillas').texto)
      .toBe('En la ronda 7, Beto levantó el Coloso.');
  });
});
