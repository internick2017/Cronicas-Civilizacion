import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado, jugadorPorId } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { cerrarRondaGobierno, manifestarse, apoyoDe, gobiernoDe, estaEnPoder } from '../../src/domain/mapa/reglas/gobierno.js';
import { narrarRonda } from '../../src/domain/mapa/narradorLocal.js';
import { APOYO_INICIAL, PUNTOS_MANIFESTACION, UMBRAL_LEVANTAMIENTO } from '../../src/domain/mapa/constantes.js';

let e, p1;
const siempre = () => 0;
const nunca = () => 0.999;
const levantamientos = (evs) => evs.filter(x => x.tipo === 'Levantamiento' && x.jugadorId === 'p1');

beforeEach(() => {
  e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  p1 = jugadorPorId(e, 'p1');
  p1.apoyo = { pueblo: 100, lideres: 100, militares: 100 };
});

describe('cerrarRondaGobierno: golpes de Estado y revoluciones', () => {
  it('el pueblo muy bajo hace una revolucion que trae la democracia directa', () => {
    p1.apoyo.pueblo = 5;
    const [ev] = levantamientos(cerrarRondaGobierno(e, siempre));
    expect(ev.datos).toMatchObject({ tipo: 'revolucion', grupo: 'pueblo', gobierno: 'republica_directa' });
  });

  it('los militares muy bajos dan un golpe que trae la dictadura', () => {
    p1.apoyo.militares = 5;
    const [ev] = levantamientos(cerrarRondaGobierno(e, siempre));
    expect(ev.datos).toMatchObject({ tipo: 'golpe', grupo: 'militares', gobierno: 'dictadura' });
  });

  it('los lideres muy bajos dan un golpe que trae la oligarquia', () => {
    p1.apoyo.lideres = 5;
    const [ev] = levantamientos(cerrarRondaGobierno(e, siempre));
    expect(ev.datos).toMatchObject({ tipo: 'golpe', grupo: 'lideres', gobierno: 'oligarquia' });
  });

  it('se alza el grupo mas descontento', () => {
    p1.apoyo = { pueblo: 10, lideres: 3, militares: 20 };
    expect(levantamientos(cerrarRondaGobierno(e, siempre))[0].datos.grupo).toBe('lideres');
  });

  it('si empatan, se sortea: tambien hay golpes cuando caen los tres parejo', () => {
    p1.apoyo = { pueblo: 10, lideres: 10, militares: 10 };
    const secuencia = (segundo) => { const v = [0, segundo]; return () => v.shift(); };
    expect(levantamientos(cerrarRondaGobierno(e, secuencia(0)))[0].datos.grupo).toBe('pueblo');
    expect(levantamientos(cerrarRondaGobierno(e, secuencia(0.5)))[0].datos.grupo).toBe('lideres');
    expect(levantamientos(cerrarRondaGobierno(e, secuencia(0.9)))[0].datos.grupo).toBe('militares');
  });

  it('ni el despota esta a salvo', () => {
    expect(gobiernoDe(p1)).toBe('despotismo');
    p1.apoyo.pueblo = 5;
    expect(levantamientos(cerrarRondaGobierno(e, siempre))).toHaveLength(1);
  });

  it('con apoyo justo en el umbral no hay riesgo, y debajo depende del azar', () => {
    p1.apoyo.pueblo = UMBRAL_LEVANTAMIENTO;
    expect(levantamientos(cerrarRondaGobierno(e, siempre))).toEqual([]);
    p1.apoyo.pueblo = UMBRAL_LEVANTAMIENTO - 1;
    expect(levantamientos(cerrarRondaGobierno(e, nunca))).toEqual([]);
  });

  it('cuanto mas bajo el apoyo, mas probable', () => {
    const azar = () => 0.2;
    p1.apoyo.pueblo = 15;
    expect(levantamientos(cerrarRondaGobierno(e, azar))).toEqual([]);
    p1.apoyo.pueblo = 0;
    expect(levantamientos(cerrarRondaGobierno(e, azar))).toHaveLength(1);
  });

  it('cuenta el respeto del gobierno: una tirania aprieta al pueblo', () => {
    p1.gobierno = 'tirania';
    p1.apoyo.pueblo = 35; // 35 - 15 de respeto = 20
    expect(levantamientos(cerrarRondaGobierno(e, siempre))[0].datos.grupo).toBe('pueblo');
  });

  it('aplicado: cambia el gobierno, saca del poder y calma al grupo que se alzo', () => {
    p1.apoyo.militares = 5;
    aplicar(e, cerrarRondaGobierno(e, siempre));
    expect(gobiernoDe(p1)).toBe('dictadura');
    expect(estaEnPoder(p1)).toBe(false);
    expect(apoyoDe(p1).militares).toBe(APOYO_INICIAL);
  });

  it('quien ya perdio el poder no sufre otro levantamiento', () => {
    p1.enPoder = false;
    p1.gobierno = 'monarquia';
    p1.apoyo.pueblo = 5;
    expect(levantamientos(cerrarRondaGobierno(e, nunca))).toEqual([]);
    expect(levantamientos(cerrarRondaGobierno(e, siempre))).toEqual([]);
  });

  it('los bots no tienen gobierno que perder', () => {
    p1.esBot = true;
    p1.apoyo.pueblo = 0;
    expect(levantamientos(cerrarRondaGobierno(e, siempre))).toEqual([]);
  });

  it('sin la mecanica de gobierno no hay levantamientos', () => {
    e.config.mecanicas = { gobierno: false };
    p1.apoyo.pueblo = 0;
    expect(levantamientos(cerrarRondaGobierno(e, siempre))).toEqual([]);
  });

  it('la cronica cuenta el levantamiento', () => {
    p1.apoyo.pueblo = 5;
    const eventos = levantamientos(cerrarRondaGobierno(e, siempre));
    expect(JSON.stringify(narrarRonda(eventos, e.jugadores))).toContain('revolucion');
  });
});

describe('manifestarse: el ciudadano', () => {
  beforeEach(() => {
    p1.cargos = [];
    p1.apoyo = { pueblo: 50, lideres: 50, militares: 50 };
  });

  it('protestar baja el apoyo del pueblo y apoyar lo sube', () => {
    aplicar(e, manifestarse(e, 'p1', { postura: 'protestar' }));
    expect(apoyoDe(p1).pueblo).toBe(50 - PUNTOS_MANIFESTACION);
    e.turno += 1;
    aplicar(e, manifestarse(e, 'p1', { postura: 'apoyar' }));
    expect(apoyoDe(p1).pueblo).toBe(50);
  });

  it('una sola vez por ronda', () => {
    aplicar(e, manifestarse(e, 'p1', { postura: 'protestar' }));
    expect(() => manifestarse(e, 'p1', { postura: 'protestar' })).toThrow(expect.objectContaining({ codigo: 'YA_TE_MANIFESTASTE' }));
  });

  it('quien tiene un cargo no es ciudadano', () => {
    p1.cargos = ['estado'];
    expect(() => manifestarse(e, 'p1', { postura: 'protestar' })).toThrow(expect.objectContaining({ codigo: 'SOLO_CIUDADANOS' }));
  });

  it('rechaza una postura desconocida sin gastar la ronda', () => {
    expect(() => manifestarse(e, 'p1', { postura: 'bailar' })).toThrow(expect.objectContaining({ codigo: 'POSTURA_INVALIDA' }));
    expect(() => manifestarse(e, 'p1', { postura: 'apoyar' })).not.toThrow();
  });

  it('no existe sin la mecanica de gobierno', () => {
    e.config.mecanicas = { gobierno: false };
    expect(() => manifestarse(e, 'p1', { postura: 'protestar' })).toThrow();
  });

  it('protestando se puede tumbar al gobierno de tu propio pais', () => {
    p1.apoyo.pueblo = UMBRAL_LEVANTAMIENTO;
    aplicar(e, manifestarse(e, 'p1', { postura: 'protestar' }));
    expect(levantamientos(cerrarRondaGobierno(e, siempre))[0].datos.tipo).toBe('revolucion');
  });
});
