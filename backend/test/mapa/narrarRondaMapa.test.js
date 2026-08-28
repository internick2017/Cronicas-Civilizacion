import { describe, it, expect, vi } from 'vitest';
import { narrarRondaMapa } from '../../src/domain/mapa/narracionRonda.js';

const eventos = [{ tipo: 'CiudadFundada', jugadorId: 'p1', datos: { nombre: 'Cusco', x: 1, y: 2 } }];
const jugadores = [{ id: 'p1', nombre: 'Pachacutec' }];

describe('narrarRondaMapa (bisagra IA/narrador local)', () => {
  // Regresion de un bug visto jugando: la cronica decia "los ejercitos del
  // bot-ia", el identificador interno del jugador maquina, porque el resumen
  // que se le manda a la IA metia e.jugadorId crudo. El narrador local ya
  // traducia a nombres; el prompt de la IA no.
  it('nombra a los jugadores por su nombre, nunca por su id interno', async () => {
    const servicioIA = { generateStoryNarrative: vi.fn().mockResolvedValue('texto') };

    await narrarRondaMapa(eventos, jugadores, servicioIA);

    const prompt = servicioIA.generateStoryNarrative.mock.calls[0][0];
    expect(prompt).toContain('Pachacutec');
    expect(prompt).not.toContain('p1');
  });

  it('a un jugador que ya no esta en la lista no lo nombra con su id', async () => {
    const servicioIA = { generateStoryNarrative: vi.fn().mockResolvedValue('texto') };
    const deOtro = [{ tipo: 'CiudadCapturada', jugadorId: 'fantasma', datos: { x: 1, y: 1 } }];

    await narrarRondaMapa(deOtro, jugadores, servicioIA);

    expect(servicioIA.generateStoryNarrative.mock.calls[0][0]).not.toContain('fantasma');
  });

  it('usa el texto de la IA cuando esta devuelve algo', async () => {
    const servicioIA = { generateStoryNarrative: vi.fn().mockResolvedValue('Texto generado por la IA') };

    const resultado = await narrarRondaMapa(eventos, jugadores, servicioIA);

    expect(resultado).toBe('Texto generado por la IA');
    expect(servicioIA.generateStoryNarrative).toHaveBeenCalledTimes(1);
  });

  it('cae al narrador local cuando la IA devuelve null (sin clave configurada)', async () => {
    const servicioIA = { generateStoryNarrative: vi.fn().mockResolvedValue(null) };

    const resultado = await narrarRondaMapa(eventos, jugadores, servicioIA);

    expect(typeof resultado).toBe('string');
    expect(resultado.length).toBeGreaterThan(0);
    expect(resultado).not.toBe('Texto generado por la IA');
  });

  it('cae al narrador local cuando la IA tira una excepcion', async () => {
    const servicioIA = { generateStoryNarrative: vi.fn().mockRejectedValue(new Error('sin cuota')) };

    const resultado = await narrarRondaMapa(eventos, jugadores, servicioIA);

    expect(typeof resultado).toBe('string');
    expect(resultado.length).toBeGreaterThan(0);
  });
});
