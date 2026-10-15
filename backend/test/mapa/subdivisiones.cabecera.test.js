import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado, jugadorPorId, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { cambiarFormaEstado } from '../../src/domain/mapa/reglas/gobierno.js';
import {
  crearSubdivision, elegirCabecera, cabeceraDe, subdivisionPorId, subdivisionesDe, ciudadesConBonoCabecera,
} from '../../src/domain/mapa/reglas/subdivisiones.js';
import { produccionBruta } from '../../src/domain/mapa/reglas/turnos.js';
import { cerrarRondaProblemas, problemasDe } from '../../src/domain/mapa/reglas/problemas.js';
import { vistaJugador } from '../../src/domain/mapa/reglas/visibilidad.js';
import {
  PROBLEMAS, MEDIDOR_NEUTRO, RESOLUCION_POR_NIVEL, BONO_PRODUCCION_CABECERA, DESCUENTO_RESOLUCION_CABECERA,
} from '../../src/domain/mapa/constantes.js';
import { crearRng } from '../../src/domain/mapa/rng.js';

let e, p1, A, B, C; // A = capital; B y C = ciudades iguales en llanura
const codigo = (fn) => { try { fn(); } catch (err) { return err.codigo; } return null; };
const crear = (datos) => { const evs = crearSubdivision(e, 'p1', datos); aplicar(e, evs); return evs[0].datos.id; };
const cabecera = (subdivisionId, ciudad) => aplicar(e, elegirCabecera(e, 'p1', { subdivisionId, ...ciudad }));

function ciudadEn(x, y) {
  const t = tileEn(e, x, y);
  t.terreno = 'plains';
  t.ciudad = { nombre: `C${x}_${y}`, nivel: 1, poblacion: 500, edificios: [] };
  t.dueno = 'p1';
  return { x, y };
}

// Lo que rinde una ciudad sola: la diferencia entre producir con ella y sin ella.
function rindeDe(ciudad, recurso) {
  const tile = tileEn(e, ciudad.x, ciudad.y);
  const con = produccionBruta(e, 'p1')[recurso];
  tile.ciudad.saqueadaHasta = e.turno + 1;
  const sin = produccionBruta(e, 'p1')[recurso] ?? 0;
  delete tile.ciudad.saqueadaHasta;
  return con - sin;
}

beforeEach(() => {
  e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  p1 = jugadorPorId(e, 'p1');
  p1.recursos = { food: 999, gold: 500, wood: 999, stone: 999, science: 999, culture: 999 };
  aplicar(e, cambiarFormaEstado(e, 'p1', { formaEstado: 'federal' }));
  const cap = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
  const tam = e.config.tamanoMapa;
  A = { x: cap.x, y: cap.y };
  B = ciudadEn(cap.x + (cap.x + 1 < tam ? 1 : -1), cap.y);
  C = ciudadEn(cap.x + (cap.x + 7 < tam ? 7 : -7), cap.y);
});

describe('elegirCabecera', () => {
  it('guarda la cabecera, la vista la muestra, y con x null se quita', () => {
    const m = crear({ nombre: 'M', tipoSubdivision: 'municipio', ciudades: [A, B] });
    const evs = elegirCabecera(e, 'p1', { subdivisionId: m, x: B.x, y: B.y });
    expect(evs.map(x => x.tipo)).toEqual(['CabeceraElegida']);
    aplicar(e, evs);
    expect(cabeceraDe(e, p1, subdivisionPorId(p1, m))).toEqual(B);
    expect(vistaJugador(e, 'p1').jugadores.find(j => j.id === 'p1').subdivisiones[0].cabecera).toEqual(B);
    cabecera(m, { x: null });
    expect(cabeceraDe(e, p1, subdivisionPorId(p1, m))).toBeNull();
  });

  it('acepta una ciudad de una subdivisión hija: es parte del territorio', () => {
    const d = crear({ nombre: 'D', tipoSubdivision: 'distrito', ciudades: [A] });
    crear({ nombre: 'F', tipoSubdivision: 'freguesia', padreId: d, ciudades: [B] });
    cabecera(d, B);
    expect(cabeceraDe(e, p1, subdivisionPorId(p1, d))).toEqual(B);
  });

  it('rechaza subdivisión desconocida, ciudad ajena o inexistente, fuera del territorio y coordenadas inválidas', () => {
    const m = crear({ nombre: 'M', tipoSubdivision: 'municipio', ciudades: [A] });
    const ajena = e.mapa.find(t => t.ciudad && t.dueno === 'p2');
    const vacia = e.mapa.find(t => !t.ciudad);
    expect(codigo(() => elegirCabecera(e, 'p1', { subdivisionId: 'sub99', ...A }))).toBe('SUBDIVISION_DESCONOCIDA');
    expect(codigo(() => elegirCabecera(e, 'p1', { subdivisionId: m, x: ajena.x, y: ajena.y }))).toBe('CIUDAD_AJENA');
    expect(codigo(() => elegirCabecera(e, 'p1', { subdivisionId: m, x: vacia.x, y: vacia.y }))).toBe('CIUDAD_AJENA');
    expect(codigo(() => elegirCabecera(e, 'p1', { subdivisionId: m, ...B }))).toBe('FUERA_DE_SUBDIVISION');
    expect(codigo(() => elegirCabecera(e, 'p1', { subdivisionId: m, x: '1', y: 2 }))).toBe('CIUDAD_INVALIDA');
    expect(cabeceraDe(e, p1, subdivisionPorId(p1, m))).toBeNull();
  });

  it('exige Estado federal y estar en el poder, como el resto de las subdivisiones', () => {
    const m = crear({ nombre: 'M', tipoSubdivision: 'municipio', ciudades: [A] });
    p1.enPoder = false;
    expect(codigo(() => elegirCabecera(e, 'p1', { subdivisionId: m, ...A }))).toBe('SIN_PODER');
    p1.enPoder = true;
    p1.formaEstado = 'unitario';
    expect(codigo(() => elegirCabecera(e, 'p1', { subdivisionId: m, ...A }))).toBe('NO_ES_FEDERAL');
  });
});

describe('cabeceraDe', () => {
  it('partida vieja sin el campo: no hay cabecera', () => {
    p1.subdivisiones = [{ id: 'sub1', nombre: 'Viejo', ciudades: [{ ...A }] }];
    expect(subdivisionesDe(p1)[0].cabecera).toBeNull();
    expect(cabeceraDe(e, p1, p1.subdivisiones[0])).toBeNull();
  });

  it('deja de valer si la ciudad cambia de dueño o sale del territorio', () => {
    const m = crear({ nombre: 'M', tipoSubdivision: 'municipio', ciudades: [A, B] });
    cabecera(m, B);
    tileEn(e, B.x, B.y).dueno = 'p2';
    expect(cabeceraDe(e, p1, subdivisionPorId(p1, m))).toBeNull();
    tileEn(e, B.x, B.y).dueno = 'p1';
    crear({ nombre: 'Otro', tipoSubdivision: 'municipio', ciudades: [B] });
    expect(cabeceraDe(e, p1, subdivisionPorId(p1, m))).toBeNull();
  });
});

describe('efectos de la cabecera', () => {
  it('las demás ciudades de la subdivisión rinden un 5% más; la cabecera no', () => {
    const m = crear({ nombre: 'M', tipoSubdivision: 'municipio', ciudades: [B, C] });
    const rindeB = rindeDe(B, 'food');
    const antes = produccionBruta(e, 'p1').food;
    cabecera(m, C);
    expect(produccionBruta(e, 'p1').food - antes).toBeCloseTo(rindeB * BONO_PRODUCCION_CABECERA);
  });

  it('no se acumula entre niveles', () => {
    const d = crear({ nombre: 'D', tipoSubdivision: 'distrito' });
    const m = crear({ nombre: 'M', tipoSubdivision: 'municipio', padreId: d, ciudades: [B, C] });
    const rindeB = rindeDe(B, 'food');
    const antes = produccionBruta(e, 'p1').food;
    cabecera(d, C);
    cabecera(m, C);
    // B esta cubierta por las dos con cabecera, y gana el 5% una sola vez.
    expect(produccionBruta(e, 'p1').food - antes).toBeCloseTo(rindeB * BONO_PRODUCCION_CABECERA);
  });

  it('en un Estado unitario no rinde', () => {
    const m = crear({ nombre: 'M', tipoSubdivision: 'municipio', ciudades: [B, C] });
    cabecera(m, C);
    expect(ciudadesConBonoCabecera(e, p1).size).toBe(1);
    p1.formaEstado = 'unitario';
    expect(ciudadesConBonoCabecera(e, p1).size).toBe(0);
  });

  it('resolver un problema cuesta 20% menos, igual en la vista que en el cobro', () => {
    const m = crear({ nombre: 'M', tipoSubdivision: 'municipio', ciudades: [A] });
    cabecera(m, A);
    const neutros = Object.fromEntries(Object.keys(PROBLEMAS).map(t => [t, MEDIDOR_NEUTRO]));
    p1.medidores = { [`${A.x},${A.y}`]: { ...neutros, educacion: 90 } };
    const ronda = (turno) => { e.turno = turno; aplicar(e, cerrarRondaProblemas(e, crearRng('cab'))); };
    ronda(1);
    const esperado = Math.ceil(RESOLUCION_POR_NIVEL[5].oro * (1 - DESCUENTO_RESOLUCION_CABECERA));
    expect(vistaJugador(e, 'p1').jugadores.find(j => j.id === 'p1').problemas[0].costoResolver).toBe(esperado);
    const antes = p1.recursos.gold;
    ronda(1 + RESOLUCION_POR_NIVEL[5].rondas);
    expect(problemasDe(p1)).toHaveLength(0);
    expect(p1.recursos.gold).toBe(antes - esperado);
  });
});
