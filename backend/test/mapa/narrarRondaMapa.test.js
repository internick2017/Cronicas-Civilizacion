import { describe, it, expect, vi } from 'vitest';
import { narrarRondaMapa } from '../../src/domain/mapa/narracionRonda.js';

const eventos = [{ tipo: 'CiudadFundada', jugadorId: 'p1', datos: { nombre: 'Cusco', x: 1, y: 2 } }];
const jugadores = [{ id: 'p1', nombre: 'Pachacutec' }];

describe('narrarRondaMapa (bisagra IA/narrador local)', () => {
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
