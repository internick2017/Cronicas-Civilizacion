import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado, tileEn, jugadorPorId } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { reclutar } from '../../src/domain/mapa/reglas/militar.js';
import { moverEjercito } from '../../src/domain/mapa/reglas/movimiento.js';
import { atacar } from '../../src/domain/mapa/reglas/combate.js';
import { embarcar, desembarcar } from '../../src/domain/mapa/reglas/transporte.js';
import { evento } from '../../src/domain/mapa/reglas/comun.js';
import { crearRng } from '../../src/domain/mapa/rng.js';
import { UNIDADES } from '../../src/domain/mapa/constantes.js';
import { ReglaError } from '../../src/domain/mapa/errores.js';

// El transporte: la unica unidad que no ataca, y la unica forma de que la
// tropa cruce el mar. Ver docs/superpowers/specs/2026-08-28-mar-rio-y-armada-design.md
//
// Escenario: capital de p1 en tierra, con una franja de mar a su izquierda y
// otra franja de tierra del otro lado. Es el mapa mas chico donde una invasion
// tiene sentido.
//
//   ... [tierra lejana] [mar] [CAPITAL p1] ...
//         cx-2           cx-1     cx

let e, cx, cy, mx, my, lx, ly;

beforeEach(() => {
  e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  for (const t of e.mapa) t.terreno = 'plains';
  jugadorPorId(e, 'p1').recursos = { food: 999, gold: 999, wood: 999, stone: 999, science: 999, culture: 999 };

  const capital = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
  cx = capital.x; cy = capital.y;
  if (cx < 2) throw new Error(`supuesto roto: la capital quedo en x=${cx}, se necesita x>=2`);
  mx = cx - 1; my = cy;            // el mar
  lx = cx - 2; ly = cy;            // la orilla del otro lado
  tileEn(e, mx, my).terreno = 'water';

  aplicar(e, [evento('EdificioConstruido', e, 'p1', { x: cx, y: cy, edificio: 'port' })]);
});

const conTransporte = () => aplicar(e, reclutar(e, 'p1', { x: cx, y: cy, unidad: 'transport' }));
const conTropaEnCapital = (tipo = 'warrior') =>
  aplicar(e, [evento('UnidadReclutada', e, 'p1', { x: cx, y: cy, tipo })]);

describe('el transporte', () => {
  it('no puede atacar: es la unica unidad del juego con ataque 0', () => {
    expect(UNIDADES.transport.ataque).toBe(0);
    conTransporte();
    aplicar(e, [evento('UnidadReclutada', e, 'p2', { x: mx, y: my - 1, tipo: 'warship' })]);
    tileEn(e, mx, my - 1).terreno = 'water';

    expect(() => atacar(e, 'p1', { desde: { x: mx, y: my }, hasta: { x: mx, y: my - 1 } }, crearRng('x')))
      .toThrow(ReglaError);
  });

  it('lleva hasta su capacidad y despues rechaza', () => {
    conTransporte();
    for (let i = 0; i < UNIDADES.transport.capacidad; i++) {
      conTropaEnCapital();
      aplicar(e, embarcar(e, 'p1', { desde: { x: cx, y: cy }, hasta: { x: mx, y: my } }));
    }
    expect(tileEn(e, mx, my).ejercito.carga).toHaveLength(UNIDADES.transport.capacidad);

    conTropaEnCapital();
    expect(() => embarcar(e, 'p1', { desde: { x: cx, y: cy }, hasta: { x: mx, y: my } }))
      .toThrow(ReglaError);
  });
});

describe('embarcar', () => {
  beforeEach(() => {
    conTransporte();
    conTropaEnCapital();
  });

  it('la tropa desaparece de su casilla y viaja adentro, con su salud', () => {
    tileEn(e, cx, cy).ejercito.salud = 42;
    aplicar(e, embarcar(e, 'p1', { desde: { x: cx, y: cy }, hasta: { x: mx, y: my } }));

    expect(tileEn(e, cx, cy).ejercito).toBeNull();
    // La salud viaja con ella: si se perdiera, embarcar seria una curacion
    // gratis mas barata que un cuartel.
    expect(tileEn(e, mx, my).ejercito.carga).toEqual([
      expect.objectContaining({ tipo: 'warrior', salud: 42 }),
    ]);
  });

  it('embarcar consume el movimiento de la tropa, no el del transporte', () => {
    const movimientoBarcoAntes = tileEn(e, mx, my).ejercito.movimientoRestante;
    aplicar(e, embarcar(e, 'p1', { desde: { x: cx, y: cy }, hasta: { x: mx, y: my } }));

    expect(tileEn(e, mx, my).ejercito.movimientoRestante).toBe(movimientoBarcoAntes);
    expect(tileEn(e, mx, my).ejercito.carga[0].movimientoRestante).toBe(0);
  });

  it('un barco no se sube a otro barco', () => {
    aplicar(e, [evento('UnidadReclutada', e, 'p1', { x: mx, y: my - 1, tipo: 'warship' })]);
    tileEn(e, mx, my - 1).terreno = 'water';

    expect(() => embarcar(e, 'p1', { desde: { x: mx, y: my - 1 }, hasta: { x: mx, y: my } }))
      .toThrow(ReglaError);
  });

  it('no se embarca en un transporte ajeno', () => {
    tileEn(e, mx, my).ejercito.dueno = 'p2';
    expect(() => embarcar(e, 'p1', { desde: { x: cx, y: cy }, hasta: { x: mx, y: my } }))
      .toThrow(ReglaError);
  });
});

describe('desembarcar', () => {
  beforeEach(() => {
    conTransporte();
    conTropaEnCapital();
    aplicar(e, embarcar(e, 'p1', { desde: { x: cx, y: cy }, hasta: { x: mx, y: my } }));
    // Se le devuelve el movimiento a la carga, como hace el cierre de ronda.
    aplicar(e, [evento('RondaCompletada', e, 'p1', {})]);
  });

  it('la tropa baja a tierra y reclama la casilla, igual que caminando', () => {
    const evs = desembarcar(e, 'p1', { desde: { x: mx, y: my }, hasta: { x: lx, y: ly } });
    expect(evs.map(ev => ev.tipo)).toContain('TerritorioReclamado');
    aplicar(e, evs);

    expect(tileEn(e, lx, ly).ejercito).toMatchObject({ tipo: 'warrior', dueno: 'p1' });
    expect(tileEn(e, lx, ly).dueno).toBe('p1');
    expect(tileEn(e, mx, my).ejercito.carga).toHaveLength(0);
  });

  it('no se desembarca en el mar', () => {
    tileEn(e, lx, ly).terreno = 'water';
    expect(() => desembarcar(e, 'p1', { desde: { x: mx, y: my }, hasta: { x: lx, y: ly } }))
      .toThrow(ReglaError);
  });

  it('no se desembarca sobre una casilla defendida: para eso hay que pelear', () => {
    aplicar(e, [evento('UnidadReclutada', e, 'p2', { x: lx, y: ly, tipo: 'spearman' })]);
    expect(() => desembarcar(e, 'p1', { desde: { x: mx, y: my }, hasta: { x: lx, y: ly } }))
      .toThrow(ReglaError);
  });

  it('un transporte vacio no puede desembarcar nada', () => {
    aplicar(e, desembarcar(e, 'p1', { desde: { x: mx, y: my }, hasta: { x: lx, y: ly } }));
    expect(() => desembarcar(e, 'p1', { desde: { x: mx, y: my }, hasta: { x: lx, y: ly } }))
      .toThrow(ReglaError);
  });
});

describe('hundir un transporte cargado', () => {
  it('se lleva la tropa al fondo', () => {
    conTransporte();
    conTropaEnCapital();
    aplicar(e, embarcar(e, 'p1', { desde: { x: cx, y: cy }, hasta: { x: mx, y: my } }));
    expect(tileEn(e, mx, my).ejercito.carga).toHaveLength(1);

    // Es lo que le da sentido a escoltar la flota de invasion: la travesia es
    // una apuesta, no un tramite.
    aplicar(e, [evento('UnidadDestruida', e, 'p2', { x: mx, y: my, naval: true })]);

    expect(tileEn(e, mx, my).ejercito).toBeNull();
    const tropaSuelta = e.mapa.filter(t => t.ejercito && t.ejercito.tipo === 'warrior');
    expect(tropaSuelta).toHaveLength(0);
  });
});

describe('la tropa embarcada al cerrar la ronda', () => {
  it('recupera su movimiento: si no, no podria volver a bajar nunca', () => {
    conTransporte();
    conTropaEnCapital();
    aplicar(e, embarcar(e, 'p1', { desde: { x: cx, y: cy }, hasta: { x: mx, y: my } }));
    expect(tileEn(e, mx, my).ejercito.carga[0].movimientoRestante).toBe(0);

    aplicar(e, [evento('RondaCompletada', e, 'p1', {})]);
    expect(tileEn(e, mx, my).ejercito.carga[0].movimientoRestante).toBe(UNIDADES.warrior.movimiento);
  });
});

describe('el transporte navega, no camina', () => {
  it('no puede entrar en tierra', () => {
    conTransporte();
    expect(() => moverEjercito(e, 'p1', { desde: { x: mx, y: my }, hasta: { x: cx, y: cy } }))
      .toThrow(ReglaError);
  });
});
