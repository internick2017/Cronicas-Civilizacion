import { describe, it, expect } from 'vitest';
import { crearEstado, jugadorPorId } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { cambiarFormaEstado } from '../../src/domain/mapa/reglas/gobierno.js';
import { cerrarRondaProblemas, medidoresDe } from '../../src/domain/mapa/reglas/problemas.js';
import { crearRng } from '../../src/domain/mapa/rng.js';

// Cierra `rondas` rondas de un jugador federal con una sola ciudad (la capital, sin biblioteca)
// y devuelve los tipos de problema que surgieron.
function problemasQueSurgen(config, rondas = 60) {
  const e = crearEstado({ nombre: 'T', semilla: 's1', config });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  const p1 = jugadorPorId(e, 'p1');
  aplicar(e, cambiarFormaEstado(e, 'p1', { formaEstado: 'federal' }));
  const tipos = new Set();
  for (let turno = 1; turno <= rondas; turno++) {
    p1.recursos = { food: 999, gold: 999, wood: 999, stone: 999, science: 999, culture: 999 };
    e.turno = turno;
    const evs = cerrarRondaProblemas(e, crearRng(`gp:${turno}`));
    evs.filter(ev => ev.tipo === 'ProblemaSurgido').forEach(ev => tipos.add(ev.datos.problema.tipo));
    aplicar(e, evs);
  }
  return { tipos, medidores: medidoresDe(p1) };
}

describe('problemas sociales con ciencia apagada', () => {
  it('control: en una partida normal, sin biblioteca, el problema de educacion surge', () => {
    expect(problemasQueSurgen({}).tipos.has('educacion')).toBe(true);
  });

  it('educacion no surge ni lleva medidor: su unico efecto es sobre una ciencia que no existe', () => {
    const { tipos, medidores } = problemasQueSurgen({ mecanicas: { ciencia: false } });
    expect(tipos.has('educacion')).toBe(false);
    const claves = Object.values(medidores).flatMap(m => Object.keys(m));
    expect(claves).not.toContain('educacion');
  });

  it('los demas problemas siguen existiendo', () => {
    const { medidores } = problemasQueSurgen({ mecanicas: { ciencia: false } }, 3);
    const claves = new Set(Object.values(medidores).flatMap(m => Object.keys(m)));
    expect(claves.has('inseguridad')).toBe(true);
    expect(claves.has('corrupcion')).toBe(true);
  });
});
