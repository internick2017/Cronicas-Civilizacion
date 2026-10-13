import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { atacar } from '../../src/domain/mapa/reglas/combate.js';
import { vistaJugador } from '../../src/domain/mapa/reglas/visibilidad.js';
import { evento } from '../../src/domain/mapa/reglas/comun.js';
import { crearRng } from '../../src/domain/mapa/rng.js';
import { saludMaximaCiudad, saludDeCiudad, REGENERACION_CIUDAD } from '../../src/domain/mapa/constantes.js';

let e;
beforeEach(() => {
  e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
});

function ciudadRival(salud) {
  aplicar(e, [evento('UnidadReclutada', e, 'p1', { x: 19, y: 1, tipo: 'catapult' })]);
  const t = tileEn(e, 18, 1);
  t.terreno = 'plains';
  t.dueno = 'p2';
  t.ciudad = { nombre: 'Rival', nivel: 1, poblacion: 500, edificios: [], ...(salud === undefined ? {} : { salud }) };
  return t;
}
const golpear = () => atacar(e, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } }, crearRng('ciudad-1'));

describe('vida de las ciudades', () => {
  it('la vida maxima crece con el nivel y una ciudad nueva nace con la vida llena', () => {
    expect(saludMaximaCiudad(1)).toBe(100);
    expect(saludMaximaCiudad(3)).toBeGreaterThan(saludMaximaCiudad(2));
    const capital = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
    expect(capital.ciudad.salud).toBe(100);
  });

  it('una partida vieja sin `salud` cuenta como ciudad entera', () => {
    expect(saludDeCiudad({ nivel: 2 })).toBe(saludMaximaCiudad(2));
  });

  it('un golpe que no la agota le baja vida pero NO la captura', () => {
    const t = ciudadRival(100);
    const evs = golpear();
    expect(evs.map(ev => ev.tipo)).toEqual(['CombateResuelto']);
    expect(evs[0].datos.danoCiudad).toBeGreaterThan(0);
    aplicar(e, evs);
    expect(t.dueno).toBe('p2');
    expect(t.ciudad.salud).toBe(100 - evs[0].datos.danoCiudad);
  });

  it('el golpe que la agota la captura, y pasa al conquistador a media vida', () => {
    const t = ciudadRival(1);
    const evs = golpear();
    expect(evs.map(ev => ev.tipo)).toContain('CiudadCapturada');
    aplicar(e, evs);
    expect(t.dueno).toBe('p1');
    expect(t.ciudad.salud).toBe(Math.ceil(saludMaximaCiudad(1) / 2));
  });

  it('un ejercito que la guarnece recibe el golpe: la ciudad no pierde vida', () => {
    const t = ciudadRival(100);
    t.ejercito = { tipo: 'warrior', dueno: 'p2', salud: 100, movimientoRestante: 1, bonoMovimiento: 0 };
    const evs = golpear();
    expect(evs[0].datos.danoCiudad).toBeUndefined();
    aplicar(e, evs);
    expect(t.ciudad.salud).toBe(100);
  });

  it('se regenera al cerrar la ronda sin pasar del maximo', () => {
    const t = ciudadRival(50);
    aplicar(e, [evento('RondaCompletada', e, 'p1', {})]);
    expect(t.ciudad.salud).toBe(50 + REGENERACION_CIUDAD);
    t.ciudad.salud = 98;
    aplicar(e, [evento('RondaCompletada', e, 'p1', {})]);
    expect(t.ciudad.salud).toBe(100);
  });

  it('mejorar la ciudad agranda el maximo y regala la diferencia', () => {
    const t = ciudadRival(60);
    aplicar(e, [evento('CiudadMejorada', e, 'p2', { x: 18, y: 1 })]);
    expect(t.ciudad.salud).toBe(60 + saludMaximaCiudad(2) - saludMaximaCiudad(1));
  });

  it('la vista manda la vida y su maximo para dibujar "70/100"', () => {
    ciudadRival(70);
    tileEn(e, 18, 1).descubiertoPor.push('p1');
    const t = vistaJugador(e, 'p1').mapa.find(x => x.x === 18 && x.y === 1);
    expect(t.ciudad.salud).toBe(70);
    expect(t.ciudad.saludMax).toBe(100);
  });
});
