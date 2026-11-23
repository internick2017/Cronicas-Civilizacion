import { describe, it, expect } from 'vitest';
import { crearEstado } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { construir } from '../../src/domain/mapa/reglas/ciudades.js';
import { terminarTurno } from '../../src/domain/mapa/reglas/turnos.js';

function partida() {
  const e = crearEstado({ nombre: 'm', semilla: 'mar-1', config: { tamanoMapa: 20, modoTurno: 'secuencial' } });
  aplicar(e, unirse(e, { id: 'a', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'b', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  for (const j of e.jugadores) j.recursos = { food: 9999, wood: 9999, stone: 9999, gold: 9999, science: 9999, culture: 9999 };
  return e;
}
const capital = (e, id) => e.mapa.find(t => t.ciudad && t.dueno === id);

describe('maravillas', () => {
  it('rinden mucho más que un edificio común', () => {
    const e = partida();
    const c = capital(e, 'a');
    aplicar(e, construir(e, 'a', { x: c.x, y: c.y, edificio: 'coloso' }));
    expect(c.ciudad.edificios).toContain('coloso');
  });

  it('solo una por partida: la segunda ciudad, aunque sea de otro jugador, no puede', () => {
    const e = partida();
    const ca = capital(e, 'a');
    aplicar(e, construir(e, 'a', { x: ca.x, y: ca.y, edificio: 'coloso' }));
    aplicar(e, terminarTurno(e, 'a'));
    const cb = capital(e, 'b');
    expect(() => construir(e, 'b', { x: cb.x, y: cb.y, edificio: 'coloso' }))
      .toThrow(/ya existe/);
    // otra maravilla distinta sigue disponible
    expect(() => construir(e, 'b', { x: cb.x, y: cb.y, edificio: 'piramide' })).not.toThrow();
  });
});
