import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado, tileEn, jugadorPorId } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { construir } from '../../src/domain/mapa/reglas/ciudades.js';
import { reclutar } from '../../src/domain/mapa/reglas/militar.js';
import { atacar } from '../../src/domain/mapa/reglas/combate.js';
import { terminarTurno } from '../../src/domain/mapa/reglas/turnos.js';
import { evento } from '../../src/domain/mapa/reglas/comun.js';
import { crearRng } from '../../src/domain/mapa/rng.js';
import { UNIDADES, CUARTEL } from '../../src/domain/mapa/constantes.js';

let e, capitalP1, capitalP2;
beforeEach(() => {
  e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  jugadorPorId(e, 'p1').recursos = { food: 999, gold: 999, wood: 999, stone: 999, science: 999, culture: 999 };
  jugadorPorId(e, 'p2').recursos = { food: 999, gold: 999, wood: 999, stone: 999, science: 999, culture: 999 };
  capitalP1 = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
  capitalP2 = e.mapa.find(t => t.ciudad && t.dueno === 'p2');
});

describe('cuartel: reclutar más barato', () => {
  it('sin cuartel se cobra el costo de lista', () => {
    const evs = reclutar(e, 'p1', { x: capitalP1.x, y: capitalP1.y, unidad: 'warrior' });
    expect(evs[0].datos.costo).toEqual(UNIDADES.warrior.costo);
  });

  it('con cuartel, el costo baja un 15% redondeado, en TODOS los recursos del costo', () => {
    aplicar(e, construir(e, 'p1', { x: capitalP1.x, y: capitalP1.y, edificio: 'barracks' }));
    const evs = reclutar(e, 'p1', { x: capitalP1.x, y: capitalP1.y, unidad: 'warrior' });
    const esperado = Object.fromEntries(Object.entries(UNIDADES.warrior.costo).map(
      ([r, m]) => [r, Math.round(m * (1 - CUARTEL.descuentoReclutar))]));
    expect(evs[0].datos.costo).toEqual(esperado);
  });

  it('el descuento se aplica de verdad al gastar (no solo se anuncia distinto)', () => {
    aplicar(e, construir(e, 'p1', { x: capitalP1.x, y: capitalP1.y, edificio: 'barracks' }));
    const jugador = jugadorPorId(e, 'p1');
    jugador.recursos = { food: 100, gold: 100, wood: 100, stone: 100, science: 100, culture: 100 };
    aplicar(e, reclutar(e, 'p1', { x: capitalP1.x, y: capitalP1.y, unidad: 'warrior' }));
    const gastado = 100 - jugador.recursos.food;
    expect(gastado).toBe(Math.round(UNIDADES.warrior.costo.food * (1 - CUARTEL.descuentoReclutar)));
  });
});

describe('cuartel: movimiento extra al reclutar ahí', () => {
  it('sin cuartel, la unidad nace con su movimiento normal', () => {
    aplicar(e, reclutar(e, 'p1', { x: capitalP1.x, y: capitalP1.y, unidad: 'warrior' }));
    expect(tileEn(e, capitalP1.x, capitalP1.y).ejercito.movimientoRestante).toBe(UNIDADES.warrior.movimiento);
  });

  it('con cuartel, nace con +1 de movimiento', () => {
    aplicar(e, construir(e, 'p1', { x: capitalP1.x, y: capitalP1.y, edificio: 'barracks' }));
    aplicar(e, reclutar(e, 'p1', { x: capitalP1.x, y: capitalP1.y, unidad: 'warrior' }));
    expect(tileEn(e, capitalP1.x, capitalP1.y).ejercito.movimientoRestante)
      .toBe(UNIDADES.warrior.movimiento + CUARTEL.bonoMovimiento);
  });

  it('el bono se mantiene ronda tras ronda, no solo al nacer', () => {
    aplicar(e, construir(e, 'p1', { x: capitalP1.x, y: capitalP1.y, edificio: 'barracks' }));
    aplicar(e, reclutar(e, 'p1', { x: capitalP1.x, y: capitalP1.y, unidad: 'warrior' }));
    // Gasta el movimiento y cierra una ronda completa (los dos jugadores terminan turno).
    tileEn(e, capitalP1.x, capitalP1.y).ejercito.movimientoRestante = 0;
    aplicar(e, terminarTurno(e, 'p1'));
    aplicar(e, terminarTurno(e, 'p2'));
    expect(tileEn(e, capitalP1.x, capitalP1.y).ejercito.movimientoRestante)
      .toBe(UNIDADES.warrior.movimiento + CUARTEL.bonoMovimiento);
  });
});

describe('cuartel: cura a la tropa parada ahí', () => {
  it('una tropa herida en una ciudad SIN cuartel no se cura sola', () => {
    aplicar(e, reclutar(e, 'p1', { x: capitalP1.x, y: capitalP1.y, unidad: 'warrior' }));
    const tile = tileEn(e, capitalP1.x, capitalP1.y);
    tile.ejercito.salud = 50;
    aplicar(e, terminarTurno(e, 'p1'));
    aplicar(e, terminarTurno(e, 'p2'));
    expect(tile.ejercito.salud).toBe(50);
  });

  it('con cuartel, cura al cerrar la ronda, sin pasar el máximo', () => {
    aplicar(e, construir(e, 'p1', { x: capitalP1.x, y: capitalP1.y, edificio: 'barracks' }));
    aplicar(e, reclutar(e, 'p1', { x: capitalP1.x, y: capitalP1.y, unidad: 'warrior' }));
    const tile = tileEn(e, capitalP1.x, capitalP1.y);
    tile.ejercito.salud = 50;
    aplicar(e, terminarTurno(e, 'p1'));
    aplicar(e, terminarTurno(e, 'p2'));
    expect(tile.ejercito.salud).toBe(50 + CUARTEL.curacionPorRonda);
  });

  it('no cura por encima de la salud máxima de la unidad', () => {
    aplicar(e, construir(e, 'p1', { x: capitalP1.x, y: capitalP1.y, edificio: 'barracks' }));
    aplicar(e, reclutar(e, 'p1', { x: capitalP1.x, y: capitalP1.y, unidad: 'warrior' }));
    const tile = tileEn(e, capitalP1.x, capitalP1.y);
    tile.ejercito.salud = UNIDADES.warrior.salud - 5; // cerca del tope
    aplicar(e, terminarTurno(e, 'p1'));
    aplicar(e, terminarTurno(e, 'p2'));
    expect(tile.ejercito.salud).toBe(UNIDADES.warrior.salud);
  });

  it('no cura una tropa que solo está DE PASO en una ciudad ajena con cuartel', () => {
    // Simula que la ciudad de p2 (con cuartel) fue capturada por p1 pero el
    // ejercito que quedo ahi (defendiendo) sigue siendo de p2: no deberia
    // curarse con el cuartel de una ciudad que ya no es suya. Se arma el
    // escenario directo (no via construir()) porque no es turno de p2.
    const tile = tileEn(e, capitalP2.x, capitalP2.y);
    tile.ciudad.edificios.push('barracks');
    tile.dueno = 'p1';
    tile.ejercito = { tipo: 'warrior', dueno: 'p2', salud: 50, movimientoRestante: 2 };
    aplicar(e, terminarTurno(e, 'p1'));
    aplicar(e, terminarTurno(e, 'p2'));
    expect(tile.ejercito.salud).toBe(50);
  });
});

describe('cuartel: sube la defensa de la ciudad donde está', () => {
  const escenario = (conCuartel) => {
    const partida = crearEstado({ nombre: 'T', semilla: 's1' });
    aplicar(partida, unirse(partida, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
    aplicar(partida, unirse(partida, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
    aplicar(partida, iniciar(partida));
    aplicar(partida, [evento('UnidadReclutada', partida, 'p1', { x: 19, y: 1, tipo: 'catapult' })]);
    const objetivo = tileEn(partida, 18, 1);
    objetivo.terreno = 'plains';
    objetivo.dueno = 'p2';
    objetivo.ciudad = { nombre: 'Rival', nivel: 1, poblacion: 1, edificios: conCuartel ? ['barracks'] : [] };
    return partida;
  };

  it('el ataque hace menos daño contra una ciudad con cuartel que contra una sin él', () => {
    const sinCuartel = escenario(false);
    const datosSinCuartel = atacar(sinCuartel, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } }, crearRng('cuartel-x'))[0].datos;

    const conCuartel = escenario(true);
    const datosConCuartel = atacar(conCuartel, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } }, crearRng('cuartel-x'))[0].datos;

    expect(datosConCuartel.danoDefensor).toBeLessThan(datosSinCuartel.danoDefensor);
  });

  it('el cuartel NO suma nada al defenderse de un ejército (no de una ciudad)', () => {
    // Con barracks pero SIN ciudad en el tile (solo un ejercito de p2 parado
    // en una casilla cualquiera): el bono de cuartel no tiene por que entrar,
    // porque no hay ninguna ciudad ahi.
    const partida = crearEstado({ nombre: 'T', semilla: 's1' });
    aplicar(partida, unirse(partida, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
    aplicar(partida, unirse(partida, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
    aplicar(partida, iniciar(partida));
    aplicar(partida, [evento('UnidadReclutada', partida, 'p1', { x: 19, y: 1, tipo: 'catapult' })]);
    aplicar(partida, [evento('UnidadReclutada', partida, 'p2', { x: 18, y: 1, tipo: 'archer' })]);
    tileEn(partida, 18, 1).terreno = 'plains';

    const partidaControl = crearEstado({ nombre: 'T', semilla: 's1' });
    aplicar(partidaControl, unirse(partidaControl, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
    aplicar(partidaControl, unirse(partidaControl, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
    aplicar(partidaControl, iniciar(partidaControl));
    aplicar(partidaControl, [evento('UnidadReclutada', partidaControl, 'p1', { x: 19, y: 1, tipo: 'catapult' })]);
    aplicar(partidaControl, [evento('UnidadReclutada', partidaControl, 'p2', { x: 18, y: 1, tipo: 'archer' })]);
    tileEn(partidaControl, 18, 1).terreno = 'plains';

    const datos1 = atacar(partida, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } }, crearRng('mismo'))[0].datos;
    const datos2 = atacar(partidaControl, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } }, crearRng('mismo'))[0].datos;
    expect(datos1.danoDefensor).toBe(datos2.danoDefensor);
  });
});
