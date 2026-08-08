import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { atacar } from '../../src/domain/mapa/reglas/combate.js';
import { evento } from '../../src/domain/mapa/reglas/comun.js';
import { crearRng } from '../../src/domain/mapa/rng.js';

// Con semilla 's1' la capital de p1 queda en (19,1). Usamos (18,1), adyacente,
// como casilla objetivo, forzando su terreno según lo que cada caso necesite.
function crearPartida() {
  const e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  return e;
}

let e;
beforeEach(() => {
  e = crearPartida();
});

function ponerCatapultaP1() {
  aplicar(e, [evento('UnidadReclutada', e, 'p1', { x: 19, y: 1, tipo: 'catapult' })]);
}

function ponerArcheroP2(salud) {
  aplicar(e, [evento('UnidadReclutada', e, 'p2', { x: 18, y: 1, tipo: 'archer' })]);
  const t = tileEn(e, 18, 1);
  t.terreno = 'plains';
  if (salud !== undefined) t.ejercito.salud = salud;
}

describe('atacar', () => {
  it('combate determinista: mismo rng, mismo resultado', () => {
    ponerCatapultaP1();
    ponerArcheroP2();

    const estadoB = crearPartida();
    aplicar(estadoB, [evento('UnidadReclutada', estadoB, 'p1', { x: 19, y: 1, tipo: 'catapult' })]);
    aplicar(estadoB, [evento('UnidadReclutada', estadoB, 'p2', { x: 18, y: 1, tipo: 'archer' })]);
    tileEn(estadoB, 18, 1).terreno = 'plains';

    const evs1 = atacar(e, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } }, crearRng('combate-1'));
    const evs2 = atacar(estadoB, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } }, crearRng('combate-1'));

    expect(evs1).toEqual(evs2);
  });

  it('catapult (ataque 25) vs archer (defensa 5) en llanura: gana el atacante y el daño coincide con el cálculo a mano', () => {
    ponerCatapultaP1();
    ponerArcheroP2();

    // rng 'combate-1': tirada 1 (ataque) = 1.014382811728865, tirada 2 (defensa) = 0.8075878992676735
    // poderAtaque = 25 * 1.014382811728865 = 25.359570293221623
    // poderDefensa = 5 * 0.8075878992676735 * bonoDefensa('plains'=1.0) * (sin ciudad => 1) = 4.0379394963383675
    // damageMultiplier = |pA-pD| / max(pA,pD) = 0.840772558460201
    // dano = max(10, round(50 * 0.840772558460201)) = 42
    const evs = atacar(e, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } }, crearRng('combate-1'));

    expect(evs).toHaveLength(1);
    expect(evs[0].tipo).toBe('CombateResuelto');
    expect(evs[0].datos).toEqual({
      desde: { x: 19, y: 1 },
      hasta: { x: 18, y: 1 },
      ganador: 'atacante',
      danoAtacante: 0,
      danoDefensor: 42,
    });

    aplicar(e, evs);
    expect(tileEn(e, 18, 1).ejercito.salud).toBe(80 - 42);
    expect(tileEn(e, 19, 1).ejercito.movimientoRestante).toBe(0);
  });

  it('el mismo enfrentamiento en montaña da menos daño por el bono de defensa ×1.25', () => {
    ponerCatapultaP1();
    ponerArcheroP2();
    tileEn(e, 18, 1).terreno = 'mountains';

    // poderDefensa = 5 * 0.8075878992676735 * 1.25 = 5.047424370422959 (vs 4.0379... en llanura)
    // dano = max(10, round(50 * 0.8009656980752513)) = 40 (vs 42 en llanura)
    const evs = atacar(e, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } }, crearRng('combate-1'));

    expect(evs[0].datos.ganador).toBe('atacante');
    expect(evs[0].datos.danoDefensor).toBe(40);
  });

  it('atacar una ciudad enemiga sin ejército y ganar: emite CiudadCapturada y el tile cambia de dueño al aplicar', () => {
    ponerCatapultaP1();
    const t = tileEn(e, 18, 1);
    t.terreno = 'plains';
    t.dueno = 'p2';
    t.ciudad = { nombre: 'Rival', nivel: 1, poblacion: 500, edificios: [] };

    // base = defensaCiudad(1) = 10; poderDefensa = 10 * 0.evaluado * 1.0 * 1.5 (BONO_DEFENSA_CIUDAD)
    // con rng 'ciudad-1': pA=27.487..., pD=12.701... => gana atacante
    const evs = atacar(e, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } }, crearRng('ciudad-1'));

    expect(evs.map(ev => ev.tipo)).toEqual(['CombateResuelto', 'CiudadCapturada']);
    expect(evs[0].datos.ganador).toBe('atacante');
    expect(evs[1].datos).toEqual({ x: 18, y: 1 });

    aplicar(e, evs);
    expect(tileEn(e, 18, 1).dueno).toBe('p1');
    // El atacante no se mueve al tile en v1: sigue en su casilla de origen.
    expect(tileEn(e, 19, 1).ejercito).not.toBeNull();
    expect(tileEn(e, 18, 1).ejercito).toBeNull();
  });

  it('si la salud del defensor llega a 0, emite UnidadDestruida además de CombateResuelto', () => {
    ponerCatapultaP1();
    ponerArcheroP2(5); // el daño mínimo (10) alcanza para destruirlo

    const evs = atacar(e, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } }, crearRng('combate-1'));

    expect(evs.map(ev => ev.tipo)).toEqual(['CombateResuelto', 'UnidadDestruida']);
    expect(evs[1].datos).toEqual({ x: 18, y: 1 });

    aplicar(e, evs);
    expect(tileEn(e, 18, 1).ejercito).toBeNull();
  });

  it('atacar una casilla sin ejército ni ciudad enemiga da OBJETIVO_INVALIDO', () => {
    ponerCatapultaP1();
    const t = tileEn(e, 18, 1);
    t.ejercito = null;
    t.ciudad = null;
    t.dueno = null;

    expect(() => atacar(e, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } }, crearRng('x')))
      .toThrowError(expect.objectContaining({ codigo: 'OBJETIVO_INVALIDO' }));
  });

  it('atacar propia ciudad neutral/propia no cuenta como objetivo válido (OBJETIVO_INVALIDO)', () => {
    ponerCatapultaP1();
    const t = tileEn(e, 18, 1);
    t.ejercito = null;
    t.dueno = 'p1';
    t.ciudad = { nombre: 'Propia', nivel: 1, poblacion: 500, edificios: [] };

    expect(() => atacar(e, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } }, crearRng('x')))
      .toThrowError(expect.objectContaining({ codigo: 'OBJETIVO_INVALIDO' }));
  });

  it('atacar sin movimiento restante da UNIDAD_SIN_MOVIMIENTO', () => {
    ponerCatapultaP1();
    ponerArcheroP2();
    tileEn(e, 19, 1).ejercito.movimientoRestante = 0;

    expect(() => atacar(e, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } }, crearRng('x')))
      .toThrowError(expect.objectContaining({ codigo: 'UNIDAD_SIN_MOVIMIENTO' }));
  });

  it('a un destino no adyacente da DESTINO_NO_ADYACENTE', () => {
    ponerCatapultaP1();

    expect(() => atacar(e, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 17, y: 1 } }, crearRng('x')))
      .toThrowError(expect.objectContaining({ codigo: 'DESTINO_NO_ADYACENTE' }));
  });

  it('desde una casilla sin ejército propio da SIN_EJERCITO', () => {
    ponerArcheroP2();

    expect(() => atacar(e, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } }, crearRng('x')))
      .toThrowError(expect.objectContaining({ codigo: 'SIN_EJERCITO' }));
  });

  it('con posición fuera del mapa da POSICION_INVALIDA', () => {
    ponerCatapultaP1();

    expect(() => atacar(e, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 999, y: 999 } }, crearRng('x')))
      .toThrowError(expect.objectContaining({ codigo: 'POSICION_INVALIDA' }));
  });

  it('fuera de turno da NO_ES_TU_TURNO', () => {
    ponerCatapultaP1();
    ponerArcheroP2();

    expect(() => atacar(e, 'p2', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } }, crearRng('x')))
      .toThrowError(expect.objectContaining({ codigo: 'NO_ES_TU_TURNO' }));
  });
});
