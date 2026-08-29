import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado, tileEn, jugadorPorId } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { construir } from '../../src/domain/mapa/reglas/ciudades.js';
import { reclutar } from '../../src/domain/mapa/reglas/militar.js';
import { moverEjercito } from '../../src/domain/mapa/reglas/movimiento.js';
import { atacar } from '../../src/domain/mapa/reglas/combate.js';
import { evento } from '../../src/domain/mapa/reglas/comun.js';
import { crearRng } from '../../src/domain/mapa/rng.js';
import { SAQUEO, PUERTO, UNIDADES } from '../../src/domain/mapa/constantes.js';
import { ReglaError } from '../../src/domain/mapa/errores.js';

// La armada: el buque vive en el mar y solo en el mar, sale de un puerto, y
// cuando le gana a una ciudad la saquea en vez de tomarla, porque no pisa
// tierra. Ver docs/adr/0002 y 0003.
//
// El mapa se aplana a llanura despues de iniciar() y el mar se talla a mano:
// asi cada caso controla exactamente que hay alrededor, sin depender de que
// bioma le toco a la semilla ni de donde cayeron las capitales.

// Semilla elegida para que el buque GANE el combate contra una ciudad de
// nivel 1 en llanura, y asi el test pueda afirmar sobre el saqueo en vez de
// sobre el azar. Verificado a mano: 18 * tirada = 18.57 contra
// defensaCiudad(1) * tirada * 1.5 = 13.59.
const SEMILLA_GANA_EL_BUQUE = 'saqueo-2';

let e, cx, cy, mx, my;

function capitalDe(estado, jugadorId) {
  return estado.mapa.find(t => t.ciudad && t.dueno === jugadorId);
}

beforeEach(() => {
  e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  for (const t of e.mapa) t.terreno = 'plains';
  jugadorPorId(e, 'p1').recursos = { food: 999, gold: 999, wood: 999, stone: 999, science: 999, culture: 999 };
  jugadorPorId(e, 'p2').recursos = { food: 999, gold: 999, wood: 999, stone: 999, science: 999, culture: 999 };

  const capital = capitalDe(e, 'p1');
  cx = capital.x;
  cy = capital.y;
  if (cx < 1) throw new Error(`supuesto roto: la capital de p1 quedo en x=${cx}, se necesita x>=1`);
  // El mar de esta partida: una sola casilla pegada a la capital, a la
  // izquierda. Cada test que necesite mas lo talla.
  mx = cx - 1;
  my = cy;
  tileEn(e, mx, my).terreno = 'water';
});

const conPuerto = () => aplicar(e, [evento('EdificioConstruido', e, 'p1', { x: cx, y: cy, edificio: 'port' })]);

describe('el puerto', () => {
  it('se puede construir en una ciudad con mar al lado', () => {
    expect(() => construir(e, 'p1', { x: cx, y: cy, edificio: 'port' })).not.toThrow();
  });

  it('NO se puede construir tierra adentro', () => {
    tileEn(e, mx, my).terreno = 'plains'; // se le saca el mar
    expect(() => construir(e, 'p1', { x: cx, y: cy, edificio: 'port' })).toThrow(ReglaError);
  });

  it('un rio al lado no vuelve costera a una ciudad: se vadea, no se navega', () => {
    tileEn(e, mx, my).terreno = 'river';
    expect(() => construir(e, 'p1', { x: cx, y: cy, edificio: 'port' })).toThrow(ReglaError);
  });
});

describe('botar un buque', () => {
  it('exige puerto en la ciudad', () => {
    expect(() => reclutar(e, 'p1', { x: cx, y: cy, unidad: 'warship' })).toThrow(ReglaError);
  });

  it('con puerto, el buque aparece en el MAR adyacente y no en la ciudad', () => {
    conPuerto();
    const evs = reclutar(e, 'p1', { x: cx, y: cy, unidad: 'warship' });
    aplicar(e, evs);

    expect(tileEn(e, mx, my).ejercito).toMatchObject({ tipo: 'warship', dueno: 'p1' });
    expect(tileEn(e, cx, cy).ejercito).toBeNull();
  });

  it('una ciudad con tropa parada encima igual puede botar un buque', () => {
    // La guarnicion ocupa la casilla de la CIUDAD, y el buque nace en el mar:
    // no compiten. Si compitieran, tener armada te dejaria la ciudad desnuda.
    conPuerto();
    aplicar(e, [evento('UnidadReclutada', e, 'p1', { x: cx, y: cy, tipo: 'warrior' })]);

    expect(() => reclutar(e, 'p1', { x: cx, y: cy, unidad: 'warship' })).not.toThrow();
  });

  it('sin mar libre no se puede botar: falla en vez de pisar el buque que ya estaba', () => {
    conPuerto();
    aplicar(e, [evento('UnidadReclutada', e, 'p1', { x: mx, y: my, tipo: 'warship' })]);

    expect(() => reclutar(e, 'p1', { x: cx, y: cy, unidad: 'warship' })).toThrow(ReglaError);
  });

  it('el cuartel no le hace descuento a un buque: entrena tropa, no marineros', () => {
    conPuerto();
    aplicar(e, [evento('EdificioConstruido', e, 'p1', { x: cx, y: cy, edificio: 'barracks' })]);

    const [gasto] = reclutar(e, 'p1', { x: cx, y: cy, unidad: 'warship' });
    expect(gasto.datos.costo).toEqual(UNIDADES.warship.costo);
  });
});

describe('cada unidad en su medio', () => {
  beforeEach(() => {
    conPuerto();
    aplicar(e, reclutar(e, 'p1', { x: cx, y: cy, unidad: 'warship' }));
  });

  it('un buque no puede entrar en tierra', () => {
    expect(() => moverEjercito(e, 'p1', { desde: { x: mx, y: my }, hasta: { x: cx, y: cy } }))
      .toThrow(ReglaError);
  });

  it('la tropa de tierra no puede entrar en el mar', () => {
    // El buque se saca de en medio para que el rechazo sea por el TERRENO y no
    // por la casilla ocupada.
    tileEn(e, mx, my).ejercito = null;
    aplicar(e, [evento('UnidadReclutada', e, 'p1', { x: cx, y: cy, tipo: 'warrior' })]);

    expect(() => moverEjercito(e, 'p1', { desde: { x: cx, y: cy }, hasta: { x: mx, y: my } }))
      .toThrow(ReglaError);
  });

  it('navegar NO reclama territorio: el mar no tiene dueño', () => {
    // Se abre una segunda casilla de mar para poder navegar de verdad.
    const mx2 = mx - 1;
    if (mx2 < 0) throw new Error('supuesto roto: hace falta lugar para dos casillas de mar');
    tileEn(e, mx2, my).terreno = 'water';

    const evs = moverEjercito(e, 'p1', { desde: { x: mx, y: my }, hasta: { x: mx2, y: my } });
    aplicar(e, evs);

    expect(evs.map(ev => ev.tipo)).not.toContain('TerritorioReclamado');
    expect(tileEn(e, mx2, my).dueno).toBeNull();
  });
});

describe('el saqueo', () => {
  // Una ciudad de p2 sin guarnicion, pegada al mar donde espera el buque de p1.
  function ciudadEnemigaCosteraIndefensa() {
    conPuerto();
    aplicar(e, reclutar(e, 'p1', { x: cx, y: cy, unidad: 'warship' }));
    const vx = mx, vy = my - 1;
    if (vy < 0) throw new Error('supuesto roto: hace falta lugar arriba del mar');
    aplicar(e, [evento('CiudadFundada', e, 'p2', { x: vx, y: vy, nombre: 'Puerto rival' })]);
    return { vx, vy };
  }

  it('un buque que gana no captura: saquea oro y la ciudad sigue siendo del otro', () => {
    const { vx, vy } = ciudadEnemigaCosteraIndefensa();
    jugadorPorId(e, 'p2').recursos.gold = 200;
    const oroAtacanteAntes = jugadorPorId(e, 'p1').recursos.gold;

    const evs = atacar(e, 'p1', { desde: { x: mx, y: my }, hasta: { x: vx, y: vy } }, crearRng(SEMILLA_GANA_EL_BUQUE));
    const tipos = evs.map(ev => ev.tipo);
    expect(tipos).toContain('CiudadSaqueada');
    expect(tipos).not.toContain('CiudadCapturada');
    expect(tipos).not.toContain('TerritorioAnexado');

    aplicar(e, evs);
    // La ciudad no cambio de manos.
    expect(tileEn(e, vx, vy).dueno).toBe('p2');
    expect(tileEn(e, vx, vy).ciudad).toBeTruthy();
    // El oro se TRANSFIERE: 10% de 200 = 20, dentro del piso y el techo.
    expect(jugadorPorId(e, 'p2').recursos.gold).toBe(180);
    expect(jugadorPorId(e, 'p1').recursos.gold).toBe(oroAtacanteAntes + 20);
  });

  it('respeta el techo: a un rival muy rico no se le lleva todo', () => {
    const { vx, vy } = ciudadEnemigaCosteraIndefensa();
    jugadorPorId(e, 'p2').recursos.gold = 10000;

    const evs = atacar(e, 'p1', { desde: { x: mx, y: my }, hasta: { x: vx, y: vy } }, crearRng(SEMILLA_GANA_EL_BUQUE));
    const saqueo = evs.find(ev => ev.tipo === 'CiudadSaqueada');
    expect(saqueo.datos.oro).toBe(SAQUEO.maximo);
  });

  it('a un rival sin oro no se le saca nada, pero el combate ocurrio igual', () => {
    const { vx, vy } = ciudadEnemigaCosteraIndefensa();
    jugadorPorId(e, 'p2').recursos.gold = 0;

    const evs = atacar(e, 'p1', { desde: { x: mx, y: my }, hasta: { x: vx, y: vy } }, crearRng(SEMILLA_GANA_EL_BUQUE));
    const saqueo = evs.find(ev => ev.tipo === 'CiudadSaqueada');
    expect(saqueo.datos.oro).toBe(0);
    expect(evs.map(ev => ev.tipo)).toContain('CombateResuelto');

    aplicar(e, evs);
    expect(jugadorPorId(e, 'p2').recursos.gold).toBe(0);
  });

  it('el combate naval se marca en el evento, para que la cronica lo pueda contar', () => {
    const { vx, vy } = ciudadEnemigaCosteraIndefensa();
    const evs = atacar(e, 'p1', { desde: { x: mx, y: my }, hasta: { x: vx, y: vy } }, crearRng(SEMILLA_GANA_EL_BUQUE));
    expect(evs.find(ev => ev.tipo === 'CombateResuelto').datos.naval).toBe(true);
  });
});

describe('el astillero', () => {
  it('repara un buque parado en el mar contiguo a un puerto propio', () => {
    conPuerto();
    aplicar(e, reclutar(e, 'p1', { x: cx, y: cy, unidad: 'warship' }));
    const buque = tileEn(e, mx, my).ejercito;
    buque.salud = 20;

    aplicar(e, [evento('RondaCompletada', e, 'p1', {})]);
    expect(tileEn(e, mx, my).ejercito.salud).toBe(20 + PUERTO.curacionPorRonda);
  });

  it('no repara la flota ajena amarrada en tu puerto', () => {
    conPuerto();
    aplicar(e, [evento('UnidadReclutada', e, 'p2', { x: mx, y: my, tipo: 'warship' })]);
    tileEn(e, mx, my).ejercito.salud = 20;

    aplicar(e, [evento('RondaCompletada', e, 'p1', {})]);
    expect(tileEn(e, mx, my).ejercito.salud).toBe(20);
  });

  it('sin puerto no hay reparacion, aunque la ciudad sea costera', () => {
    aplicar(e, [evento('UnidadReclutada', e, 'p1', { x: mx, y: my, tipo: 'warship' })]);
    tileEn(e, mx, my).ejercito.salud = 20;

    aplicar(e, [evento('RondaCompletada', e, 'p1', {})]);
    expect(tileEn(e, mx, my).ejercito.salud).toBe(20);
  });
});
