import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { atacar } from '../../src/domain/mapa/reglas/combate.js';
import { evento } from '../../src/domain/mapa/reglas/comun.js';
import { crearRng } from '../../src/domain/mapa/rng.js';
import { REPLICA_MINIMA } from '../../src/domain/mapa/constantes.js';

// Mismo escenario que reglas.combate.test.js: con semilla 's1' la capital de p1
// queda en (19,1) y se ataca la casilla adyacente (18,1).
function crearPartida() {
  const e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  return e;
}

let e;
beforeEach(() => { e = crearPartida(); });

const ponerEnP1 = (tipo) => aplicar(e, [evento('UnidadReclutada', e, 'p1', { x: 19, y: 1, tipo })]);
const ponerEnP2 = (tipo, salud, terreno = 'plains') => {
  aplicar(e, [evento('UnidadReclutada', e, 'p2', { x: 18, y: 1, tipo })]);
  const t = tileEn(e, 18, 1);
  t.terreno = terreno;
  if (salud !== undefined) t.ejercito.salud = salud;
};
const atacarConSemilla = (semilla) =>
  atacar(e, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } }, crearRng(semilla));

describe('daño mutuo en combate', () => {
  it('el ganador ya no sale intacto: los dos lados reciben daño', () => {
    ponerEnP1('catapult');
    ponerEnP2('archer');

    const datos = atacarConSemilla('combate-1')[0].datos;

    expect(datos.ganador).toBe('atacante');
    expect(datos.danoDefensor).toBeGreaterThan(0);
    expect(datos.danoAtacante).toBeGreaterThan(0); // esto antes valía 0
  });

  it('el perdedor pega menos que el ganador', () => {
    ponerEnP1('catapult');
    ponerEnP2('archer');

    const datos = atacarConSemilla('combate-1')[0].datos;
    expect(datos.danoDefensor).toBeGreaterThan(datos.danoAtacante);
  });

  it('un combate parejo desgasta a los dos mucho más que uno aplastante', () => {
    // Lancero (def 15) contra guerrero (atq 10) es mucho más parejo que
    // catapulta (atq 25) contra arquero (def 5).
    ponerEnP1('warrior');
    ponerEnP2('spearman');
    const parejo = atacarConSemilla('combate-1')[0].datos;

    e = crearPartida();
    ponerEnP1('catapult');
    ponerEnP2('archer');
    const aplastante = atacarConSemilla('combate-1')[0].datos;

    const desgasteGanadorParejo = Math.min(parejo.danoAtacante, parejo.danoDefensor);
    const desgasteGanadorAplastante = Math.min(aplastante.danoAtacante, aplastante.danoDefensor);
    expect(desgasteGanadorParejo).toBeGreaterThan(desgasteGanadorAplastante);
  });

  it('hasta la derrota más aplastante araña algo de vida', () => {
    ponerEnP1('catapult');
    ponerEnP2('archer', 1);

    const datos = atacarConSemilla('combate-1')[0].datos;
    expect(datos.danoAtacante).toBeGreaterThanOrEqual(REPLICA_MINIMA);
  });

  it('aplica el daño a AMBAS unidades', () => {
    ponerEnP1('catapult');
    ponerEnP2('archer');
    const saludAtacanteAntes = tileEn(e, 19, 1).ejercito.salud;
    const saludDefensorAntes = tileEn(e, 18, 1).ejercito.salud;

    const evs = atacarConSemilla('combate-1');
    const { danoAtacante, danoDefensor } = evs[0].datos;
    aplicar(e, evs);

    expect(tileEn(e, 19, 1).ejercito.salud).toBe(saludAtacanteAntes - danoAtacante);
    expect(tileEn(e, 18, 1).ejercito.salud).toBe(saludDefensorAntes - danoDefensor);
  });

  it('el atacante puede morir por la réplica y se emite UnidadDestruida en SU casilla', () => {
    ponerEnP1('catapult');
    ponerEnP2('archer');
    tileEn(e, 19, 1).ejercito.salud = 1; // a punto de caer

    const evs = atacarConSemilla('combate-1');
    const destruidas = evs.filter(ev => ev.tipo === 'UnidadDestruida');

    expect(destruidas.some(ev => ev.datos.x === 19 && ev.datos.y === 1)).toBe(true);
    aplicar(e, evs);
    expect(tileEn(e, 19, 1).ejercito).toBeNull();
  });

  it('atacar una ciudad y ganar sigue capturándola, pero el atacante se desgasta', () => {
    ponerEnP1('catapult');
    const t = tileEn(e, 18, 1);
    t.terreno = 'plains';
    t.dueno = 'p2';
    t.ciudad = { nombre: 'Rival', nivel: 1, poblacion: 500, edificios: [] };
    const saludAntes = tileEn(e, 19, 1).ejercito.salud;

    const evs = atacarConSemilla('ciudad-1');

    expect(evs.map(ev => ev.tipo)).toContain('CiudadCapturada');
    expect(evs[0].datos.danoAtacante).toBeGreaterThan(0);
    aplicar(e, evs);
    expect(tileEn(e, 18, 1).dueno).toBe('p1');
    expect(tileEn(e, 19, 1).ejercito.salud).toBeLessThan(saludAntes);
  });

  it('si el atacante muere tomando la ciudad, la ciudad NO se captura', () => {
    ponerEnP1('catapult');
    const t = tileEn(e, 18, 1);
    t.terreno = 'plains';
    t.dueno = 'p2';
    t.ciudad = { nombre: 'Rival', nivel: 1, poblacion: 500, edificios: [] };
    tileEn(e, 19, 1).ejercito.salud = 1;

    const evs = atacarConSemilla('ciudad-1');

    expect(evs.map(ev => ev.tipo)).not.toContain('CiudadCapturada');
    aplicar(e, evs);
    expect(tileEn(e, 18, 1).dueno).toBe('p2');
  });

  it('sigue siendo determinista con la misma semilla', () => {
    ponerEnP1('catapult');
    ponerEnP2('archer');
    const unos = atacarConSemilla('combate-1');

    e = crearPartida();
    ponerEnP1('catapult');
    ponerEnP2('archer');
    const otros = atacarConSemilla('combate-1');

    expect(unos).toEqual(otros);
  });
});
