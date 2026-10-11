import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado, jugadorPorId, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { cambiarFormaEstado, cerrarRondaGobierno } from '../../src/domain/mapa/reglas/gobierno.js';
import { producirParaJugador } from '../../src/domain/mapa/reglas/turnos.js';
import { construir, mejorarCiudad } from '../../src/domain/mapa/reglas/ciudades.js';
import { reclutar } from '../../src/domain/mapa/reglas/militar.js';
import { vistaJugador } from '../../src/domain/mapa/reglas/visibilidad.js';
import { cerrarRondaProblemas } from '../../src/domain/mapa/reglas/problemas.js';
import { defensaDeCiudad } from '../../src/domain/mapa/reglas/combate.js';
import {
  factorProduccionCiudad, perdidaFijaOro, consumoExtraComida, penalizacionDefensa,
  multiplicadorCostos, caidaApoyoPueblo, perdidaPoblacion, escalarCosto,
} from '../../src/domain/mapa/reglas/efectosProblemas.js';
import { crearRng } from '../../src/domain/mapa/rng.js';
import { COSTO_MEJORA_CIUDAD, EDIFICIOS, UNIDADES } from '../../src/domain/mapa/constantes.js';

let e, p1, A, B;
const sinProblemas = () => { p1.problemas = []; };
function problema(tipo, ciudades, gravedad = 1) {
  p1.problemas = [...(p1.problemas ?? []), { id: `pr${(p1.problemas ?? []).length + 1}`, tipo, ciudades, gravedad, desde: 1, resolutor: null, listoEn: 99 }];
}

beforeEach(() => {
  e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  p1 = jugadorPorId(e, 'p1');
  p1.recursos = { food: 999, gold: 999, wood: 999, stone: 999, science: 999, culture: 999 };
  aplicar(e, cambiarFormaEstado(e, 'p1', { formaEstado: 'federal' }));
  const cap = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
  const tam = e.config.tamanoMapa;
  A = { x: cap.x, y: cap.y };
  const tb = tileEn(e, cap.x + (cap.x + 1 < tam ? 1 : -1), cap.y);
  tb.terreno = 'plains'; tb.dueno = 'p1';
  tb.ciudad = { nombre: 'B', nivel: 1, poblacion: 500, edificios: [] };
  B = { x: tb.x, y: tb.y };
  tileEn(e, A.x, A.y).ciudad.edificios = [];
  tileEn(e, A.x, A.y).terreno = 'plains';
});

describe('sin problemas todo es la identidad', () => {
  it('multiplicadores en 1 y pérdidas en 0', () => {
    expect(factorProduccionCiudad(p1, A.x, A.y, 'food')).toBe(1);
    expect(perdidaFijaOro(p1)).toBe(0);
    expect(consumoExtraComida(p1)).toBe(0);
    expect(penalizacionDefensa(p1, A.x, A.y)).toBe(0);
    expect(multiplicadorCostos(p1)).toBe(1);
    expect(caidaApoyoPueblo(p1)).toBe(0);
    expect(perdidaPoblacion(p1, A.x, A.y)).toBe(0);
    expect(escalarCosto({ gold: 50 }, 1)).toEqual({ gold: 50 });
  });
});

describe('producción', () => {
  it('desempleo baja la producción de la ciudad afectada y no la de las otras', () => {
    const base = producirParaJugador(e, 'p1');
    problema('desempleo', [A]);
    const uno = producirParaJugador(e, 'p1');
    problema('desempleo', [B]);
    const dos = producirParaJugador(e, 'p1');
    for (const r of ['food', 'gold']) {
      expect(uno[r]).toBeLessThan(base[r]);
      expect(dos[r]).toBeLessThan(uno[r]);
    }
    expect(factorProduccionCiudad(p1, A.x, A.y, 'food')).toBeCloseTo(0.8);
    expect(factorProduccionCiudad(p1, 99, 99, 'food')).toBe(1);
  });

  it('educación baja solo la ciencia y clima solo la comida', () => {
    const base = producirParaJugador(e, 'p1');
    problema('educacion', [A]);
    let r = producirParaJugador(e, 'p1');
    expect(r.science).toBeLessThan(base.science);
    expect(r.food).toBe(base.food);
    expect(r.gold).toBe(base.gold);
    sinProblemas();
    problema('clima', [A]);
    r = producirParaJugador(e, 'p1');
    expect(r.food).toBeLessThan(base.food);
    expect(r.science).toBe(base.science);
  });

  it('corrupción resta oro fijo por ciudad afectada y inmigración resta comida', () => {
    const base = producirParaJugador(e, 'p1');
    problema('corrupcion', [A]);
    expect(base.gold - producirParaJugador(e, 'p1').gold).toBe(3);
    sinProblemas();
    problema('inmigracion', [A, B]);
    expect(base.food - producirParaJugador(e, 'p1').food).toBe(4);
  });

  it('la gravedad escala el efecto', () => {
    problema('corrupcion', [A], 3);
    expect(perdidaFijaOro(p1)).toBe(6); // 3 * (1 + 0,5 * 2)
  });

  it('resolver el problema devuelve la producción a la normal', () => {
    const base = producirParaJugador(e, 'p1');
    problema('desempleo', [A]);
    expect(producirParaJugador(e, 'p1')).not.toEqual(base);
    sinProblemas();
    expect(producirParaJugador(e, 'p1')).toEqual(base);
  });

  it('el oro y la comida producidos nunca dejan los recursos en negativo', () => {
    p1.recursos.gold = 1;
    problema('corrupcion', [A, B], 3);
    const prod = producirParaJugador(e, 'p1');
    aplicar(e, [{ tipo: 'RecursosProducidos', turno: 1, jugadorId: 'p1', datos: { jugadorId: 'p1', produccion: { ...prod, gold: -50 } } }]);
    expect(p1.recursos.gold).toBe(0);
  });
});

describe('defensa', () => {
  it('inseguridad e infraestructura bajan la defensa de la ciudad', () => {
    const tile = tileEn(e, A.x, A.y);
    const base = defensaDeCiudad(e, tile);
    problema('inseguridad', [A]);
    expect(defensaDeCiudad(e, tile)).toBe(base - 2);
    problema('infraestructura', [A]);
    expect(defensaDeCiudad(e, tile)).toBe(base - 4);
    expect(penalizacionDefensa(p1, B.x, B.y)).toBe(0);
  });
});

describe('inflación y costos', () => {
  it('encarece construir, mejorar y reclutar, y la vista muestra el multiplicador', () => {
    const tile = tileEn(e, A.x, A.y);
    tile.ciudad.edificios = [];
    const costoBase = EDIFICIOS.market.costo;
    expect(construir(e, 'p1', { x: A.x, y: A.y, edificio: 'market' })[0].datos.costo).toEqual(costoBase);
    problema('inflacion', [A]);
    expect(multiplicadorCostos(p1)).toBeCloseTo(1.25);
    expect(construir(e, 'p1', { x: A.x, y: A.y, edificio: 'market' })[0].datos.costo).toEqual(escalarCosto(costoBase, 1.25));
    expect(mejorarCiudad(e, 'p1', { x: A.x, y: A.y })[0].datos.costo).toEqual(escalarCosto(COSTO_MEJORA_CIUDAD(1), 1.25));
    expect(reclutar(e, 'p1', { x: A.x, y: A.y, unidad: 'warrior' })[0].datos.costo).toEqual(escalarCosto(UNIDADES.warrior.costo, 1.25));
    const yo = vistaJugador(e, 'p1').jugadores.find(j => j.id === 'p1');
    expect(yo.multiplicadorCostos).toBeCloseTo(1.25);
  });

  it('escalarCosto redondea hacia arriba y nunca baja un costo', () => {
    expect(escalarCosto({ gold: 50, wood: 30 }, 1.25)).toEqual({ gold: 63, wood: 38 });
    expect(escalarCosto({ gold: 3 }, 1)).toEqual({ gold: 3 });
  });
});

describe('salud, pobreza', () => {
  it('salud baja la población con piso', () => {
    problema('salud', [A]);
    e.turno = 5;
    const evs = cerrarRondaProblemas(e, crearRng('x'));
    const ajuste = evs.find(x => x.tipo === 'PoblacionAjustada');
    expect(ajuste.datos).toMatchObject({ x: A.x, y: A.y });
    expect(ajuste.datos.delta).toBe(-25);
    aplicar(e, evs);
    expect(tileEn(e, A.x, A.y).ciudad.poblacion).toBe(475);
    tileEn(e, A.x, A.y).ciudad.poblacion = 110;
    aplicar(e, [ajuste]);
    expect(tileEn(e, A.x, A.y).ciudad.poblacion).toBe(100);
  });

  it('pobreza baja el apoyo del pueblo cada ronda', () => {
    p1.apoyo = { pueblo: 50, lideres: 50, militares: 50 };
    problema('pobreza', [A]);
    const ev = cerrarRondaGobierno(e, () => 0.999).find(x => x.tipo === 'ApoyoActualizado' && x.jugadorId === 'p1');
    // Con mas ciudades que el rival todos suben 2 por territorio; el pueblo ademas pierde 1 por la pobreza.
    expect(ev.datos.apoyo).toEqual({ pueblo: 51, lideres: 52, militares: 52 });
    expect(caidaApoyoPueblo(p1)).toBe(1);
  });
});
