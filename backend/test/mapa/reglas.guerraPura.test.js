import { describe, it, expect } from 'vitest';
import { crearEstado, esGuerraPura } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { investigar } from '../../src/domain/mapa/reglas/tecnologia.js';
import { adoptarRasgo } from '../../src/domain/mapa/reglas/cultura.js';
import { construir, mejorarCiudad } from '../../src/domain/mapa/reglas/ciudades.js';
import { reclutar } from '../../src/domain/mapa/reglas/militar.js';
import { producirParaJugador } from '../../src/domain/mapa/reglas/turnos.js';
import { jugarTurnoIA } from '../../src/domain/mapa/ia.js';
import { crearRng } from '../../src/domain/mapa/rng.js';

function partida(config = {}, { bot = false } = {}) {
  const e = crearEstado({ nombre: 'T', semilla: 'gp-1', config });
  aplicar(e, unirse(e, { id: 'a', nombre: 'A', civilizacion: 'Uno', esBot: bot }));
  aplicar(e, unirse(e, { id: 'b', nombre: 'B', civilizacion: 'Dos' }));
  aplicar(e, iniciar(e));
  const j = e.jugadores.find(x => x.id === 'a');
  j.recursos = { food: 9999, gold: 9999, wood: 9999, stone: 9999, science: 9999, culture: 9999 };
  return e;
}

const capitalDe = (e, id) => e.mapa.find(t => t.ciudad && t.dueno === id);
const codigo = (fn) => { try { fn(); } catch (err) { return err.codigo ?? err.code ?? err.message; } return null; };

describe('guerra pura: la opcion de partida', () => {
  it('arranca apagada y las partidas viejas sin el campo se leen como apagadas', () => {
    expect(esGuerraPura(partida())).toBe(false);
    const vieja = partida();
    delete vieja.config.guerraPura;
    expect(esGuerraPura(vieja)).toBe(false);
  });

  it('se puede encender y rechaza valores que no son booleanos', () => {
    expect(esGuerraPura(partida({ guerraPura: true }))).toBe(true);
    expect(() => crearEstado({ nombre: 'T', semilla: 'x', config: { guerraPura: 'si' } })).toThrow(/guerraPura/);
  });
});

describe('guerra pura: lo que se apaga', () => {
  it('no se puede investigar, adoptar rasgos ni mejorar una ciudad', () => {
    const e = partida({ guerraPura: true });
    const { x, y } = capitalDe(e, 'a');
    expect(codigo(() => investigar(e, 'a', { tecnologia: 'irrigacion' }))).toBe('GUERRA_PURA');
    expect(codigo(() => adoptarRasgo(e, 'a', { rasgo: 'arte' }))).toBe('GUERRA_PURA');
    expect(codigo(() => mejorarCiudad(e, 'a', { x, y }))).toBe('GUERRA_PURA');
  });

  it('la misma accion en una partida normal si funciona', () => {
    const e = partida();
    const { x, y } = capitalDe(e, 'a');
    expect(investigar(e, 'a', { tecnologia: 'irrigacion' }).length).toBeGreaterThan(0);
    expect(adoptarRasgo(e, 'a', { rasgo: 'arte' }).length).toBeGreaterThan(0);
    expect(mejorarCiudad(e, 'a', { x, y }).length).toBeGreaterThan(0);
  });

  it('no se construyen los edificios de ciencia ni de cultura, pero si los demas', () => {
    const e = partida({ guerraPura: true });
    const { x, y } = capitalDe(e, 'a');
    expect(codigo(() => construir(e, 'a', { x, y, edificio: 'library' }))).toBe('GUERRA_PURA');
    expect(codigo(() => construir(e, 'a', { x, y, edificio: 'university' }))).toBe('GUERRA_PURA');
    expect(construir(e, 'a', { x, y, edificio: 'granary' }).length).toBeGreaterThan(0);
  });

  it('la ciencia y la cultura no se producen, el resto si', () => {
    const normal = producirParaJugador(partida(), 'a');
    const pura = producirParaJugador(partida({ guerraPura: true }), 'a');
    expect(normal.science).toBeGreaterThan(0);
    expect(normal.culture).toBeGreaterThan(0);
    expect(pura.science ?? 0).toBe(0);
    expect(pura.culture ?? 0).toBe(0);
    expect(pura.food).toBeGreaterThan(0);
    expect(pura.gold).toBeGreaterThan(0);
  });
});

describe('guerra pura: lo que se desbloquea', () => {
  it('el legionario se recluta desde el inicio, sin la tecnologia', () => {
    const { x, y } = capitalDe(partida(), 'a');
    const normal = partida();
    expect(codigo(() => reclutar(normal, 'a', { x, y, unidad: 'legionary' }))).toBe('REQUIERE_TECNOLOGIA');
    const pura = partida({ guerraPura: true });
    expect(reclutar(pura, 'a', { x, y, unidad: 'legionary' }).length).toBeGreaterThan(0);
  });
});

function tiposQueHaceLaMaquina(config) {
  const e = partida(config, { bot: true });
  const tipos = new Set();
  for (let i = 0; i < 6; i++) {
    const eventos = jugarTurnoIA(e, 'a', crearRng(`gp-ia-${i}`));
    eventos.forEach(ev => tipos.add(ev.tipo === 'EdificioConstruido' ? `E:${ev.datos.edificio}` : ev.tipo));
    aplicar(e, eventos);
    if (e.estado === 'terminada') break;
    // El rival humano no juega: se le devuelve el turno a la maquina con ciencia y cultura de sobra.
    const bot = e.jugadores.find(j => j.id === 'a');
    e.indiceJugadorActual = e.jugadores.indexOf(bot);
    bot.recursos.science = 9999;
    bot.recursos.culture = 9999;
  }
  return tipos;
}

describe('guerra pura: la maquina', () => {
  it('sin el modo, con ciencia de sobra, si investiga (control del test de abajo)', () => {
    expect(tiposQueHaceLaMaquina({}).has('TecnologiaInvestigada')).toBe(true);
  });

  it('en guerra pura no investiga, no mejora ni construye edificios civiles, pero sigue jugando', () => {
    const tipos = tiposQueHaceLaMaquina({ guerraPura: true });
    expect(tipos.has('TecnologiaInvestigada')).toBe(false);
    expect(tipos.has('RasgoAdoptado')).toBe(false);
    expect(tipos.has('CiudadMejorada')).toBe(false);
    expect(tipos.has('E:library')).toBe(false);
    expect(tipos.has('E:university')).toBe(false);
    expect(tipos.has('TurnoAvanzado')).toBe(true);
  });
});
