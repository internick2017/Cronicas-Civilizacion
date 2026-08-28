import { describe, it, expect, vi } from 'vitest';
import { narrarRonda } from '../../src/domain/mapa/narradorLocal.js';
import { narrarRondaMapa } from '../../src/domain/mapa/narracionRonda.js';

const jugadores = [
  { id: 'p1', nombre: 'Nick', civilizacion: 'Incas' },
  { id: 'bot-ia', nombre: 'La Máquina', civilizacion: 'Autómatas' },
];

const reclamo = (jugadorId, duenoAnterior, x = 0, y = 0) =>
  ({ tipo: 'TerritorioReclamado', jugadorId, datos: { x, y, duenoAnterior } });

describe('la crónica cuenta los cambios de territorio', () => {
  // La razon de existir de esto: jugando una partida real, el territorio propio
  // bajo del 30% al 18% en cinco turnos sin perder una sola ciudad, y la
  // cronica no dijo NADA. Narraba combates y reclutamientos mientras lo que
  // decidia la partida pasaba en silencio.
  it('dice quién te quitó territorio, y cuánto', () => {
    const texto = narrarRonda([
      reclamo('bot-ia', 'p1', 1, 1),
      reclamo('bot-ia', 'p1', 2, 1),
      reclamo('bot-ia', 'p1', 3, 1),
    ], jugadores);

    expect(texto).toContain('La Máquina');
    expect(texto).toContain('Nick');
    expect(texto).toContain('3');
  });

  // Un ejercito reclama una casilla por paso: en una partida larga se midieron
  // 8.193 reclamos. Narrarlos de a uno inundaria la cronica y la volveria
  // ilegible, que es tan malo como no contar nada.
  it('agrega en una sola frase en vez de repetir una por casilla', () => {
    const muchos = Array.from({ length: 12 }, (_, i) => reclamo('bot-ia', 'p1', i, 0));
    const texto = narrarRonda(muchos, jugadores);

    const frasesConMaquina = texto.split('.').filter(f => f.includes('La Máquina'));
    expect(frasesConMaquina).toHaveLength(1);
    expect(texto).toContain('12');
  });

  it('distingue la tierra de nadie del territorio arrebatado a alguien', () => {
    const texto = narrarRonda([
      reclamo('p1', null, 0, 0),
      reclamo('p1', null, 1, 0),
      reclamo('p1', 'bot-ia', 2, 0),
    ], jugadores);

    expect(texto).toMatch(/2 casillas? (sin dueño|de nadie|libres?)/i);
    expect(texto).toMatch(/1 casilla.*La Máquina|La Máquina.*1 casilla/);
  });

  it('el territorio anexado al capturar una ciudad también se cuenta', () => {
    const texto = narrarRonda([
      { tipo: 'CiudadCapturada', jugadorId: 'bot-ia', datos: { x: 5, y: 5 } },
      { tipo: 'TerritorioAnexado', jugadorId: 'bot-ia', datos: { duenoAnterior: 'p1', tiles: [{ x: 4, y: 5 }, { x: 6, y: 5 }] } },
    ], jugadores);

    expect(texto).toContain('tomo una ciudad');
    expect(texto).toContain('2');
  });

  it('un evento viejo sin duenoAnterior no rompe la crónica', () => {
    const texto = narrarRonda([
      { tipo: 'TerritorioReclamado', jugadorId: 'p1', datos: { x: 1, y: 1 } },
    ], jugadores);

    expect(typeof texto).toBe('string');
    expect(texto.length).toBeGreaterThan(0);
    expect(texto).not.toContain('undefined');
  });

  it('sin eventos de territorio, la crónica no inventa nada', () => {
    const texto = narrarRonda([
      { tipo: 'UnidadReclutada', jugadorId: 'p1', datos: { tipo: 'warrior' } },
    ], jugadores);

    expect(texto).not.toMatch(/casilla/i);
  });
});

describe('el prompt de la IA recibe el mismo resumen', () => {
  it('lleva el territorio arrebatado, y no una línea por casilla', async () => {
    const servicioIA = { generateStoryNarrative: vi.fn().mockResolvedValue('texto') };
    const muchos = Array.from({ length: 12 }, (_, i) => reclamo('bot-ia', 'p1', i, 0));

    await narrarRondaMapa(muchos, jugadores, servicioIA);

    const prompt = servicioIA.generateStoryNarrative.mock.calls[0][0];
    expect(prompt).toContain('12');
    expect(prompt).toContain('Nick');
    // Sin agregar, el prompt tendria 12 veces el mismo tipo de evento.
    expect(prompt.split('TerritorioReclamado').length - 1).toBeLessThanOrEqual(1);
  });
});
