import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado, jugadorPorId } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import {
  apoyoEfectivo, cerrarRondaGobierno, declararEmergencia, fijarImpuestos, fijarMandato, impuestosDe, mandatoDe,
  multiplicadorProduccion, poderesDe, proponerGobierno, resultadoVotacion,
} from '../../src/domain/mapa/reglas/gobierno.js';
import { reclutar } from '../../src/domain/mapa/reglas/militar.js';
import { perdidaFijaOro } from '../../src/domain/mapa/reglas/efectosProblemas.js';
import { romperAlianza } from '../../src/domain/mapa/reglas/alianzas.js';
import { produccionConResto } from '../../src/domain/mapa/reglas/turnos.js';
import { atacar } from '../../src/domain/mapa/reglas/combate.js';
import { EFECTOS_PODERES, PODERES, PODERES_SEPARADOS, UNIDADES } from '../../src/domain/mapa/constantes.js';

let e, p1;
const siempre = () => 0;
const nunca = () => 0.999;
const todos = (v) => ({ pueblo: v, lideres: v, militares: v });
const de = (evs, tipo) => evs.filter(x => x.tipo === tipo && x.jugadorId === 'p1');

beforeEach(() => {
  e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  p1 = jugadorPorId(e, 'p1');
  p1.apoyo = todos(100);
});

const ciudadDe = (id) => e.mapa.find(t => t.ciudad && t.dueno === id);

describe('tabla de poderes', () => {
  it('cada poder independiente de la tabla existe y explica qué da y qué cuesta', () => {
    for (const poder of Object.values(PODERES_SEPARADOS).flat()) expect(Object.hasOwn(PODERES, poder)).toBe(true);
    for (const datos of Object.values(PODERES)) {
      expect(datos.gana).toBeTruthy();
      expect(datos.paga).toBeTruthy();
    }
  });

  it('los once poderes tienen efecto y todos salen en algún gobierno', () => {
    expect(Object.keys(PODERES)).toHaveLength(11);
    expect(Object.keys(EFECTOS_PODERES).sort()).toEqual(Object.keys(PODERES).sort());
    const usados = new Set(Object.values(PODERES_SEPARADOS).flat());
    expect(Object.keys(PODERES).filter(p => !usados.has(p))).toEqual(['ejecutivo']);
  });

  it('el despotismo no separa ninguno y juega como siempre', () => {
    expect(poderesDe(p1)).toEqual([]);
    expect(multiplicadorProduccion(p1, 'gold')).toBe(1);
  });
});

describe('Ejecutivo: el presupuesto de las instituciones', () => {
  it('cada poder independiente cuesta 2% de oro', () => {
    p1.gobierno = 'presidencialismo'; // tres poderes, +10% de oro propio
    expect(multiplicadorProduccion(p1, 'gold')).toBeCloseTo(1 + 0.1 - 0.06);
    expect(multiplicadorProduccion(p1, 'food')).toBeCloseTo(1 + 0.1);
  });
});

describe('Federativo', () => {
  beforeEach(() => { p1.gobierno = 'oligarquia'; });

  it('cada aliado da 5% de oro, también en la producción real', () => {
    const sinAliados = multiplicadorProduccion(p1, 'gold', 0);
    expect(multiplicadorProduccion(p1, 'gold', 2)).toBeCloseTo(sinAliados + 0.1);
    const oroSolo = produccionConResto(e, 'p1').produccion.gold;
    e.alianzas = [{ miembros: ['p1', 'p2'] }];
    p1.recursos.gold = 0;
    ciudadDe('p1').ciudad.edificios.push('market');
    const conMercado = produccionConResto(e, 'p1');
    expect(conMercado.produccion.gold).toBeGreaterThan(oroSolo);
  });

  it('sin el poder los aliados no cambian el oro', () => {
    p1.gobierno = 'monarquia';
    expect(multiplicadorProduccion(p1, 'gold', 3)).toBe(multiplicadorProduccion(p1, 'gold', 0));
  });

  it('romper una alianza alarga la tregua', () => {
    e.alianzas = [{ miembros: ['p1', 'p2'] }];
    expect(romperAlianza(e, 'p1')[0].datos.hasta).toBe(e.turno + 2);
    p1.gobierno = 'monarquia';
    expect(romperAlianza(e, 'p1')[0].datos.hasta).toBe(e.turno);
  });
});

describe('Tribunicio', () => {
  beforeEach(() => { p1.gobierno = 'republica_directa'; });

  it('frena la revolución, calma al pueblo y lo cuenta', () => {
    p1.apoyo = { pueblo: 0, lideres: 100, militares: 100 };
    const evs = cerrarRondaGobierno(e, siempre);
    expect(de(evs, 'Levantamiento')).toEqual([]);
    const [frenado] = de(evs, 'LevantamientoFrenado');
    expect(frenado.datos).toMatchObject({ grupo: 'pueblo', poder: 'tribunicio' });
    aplicar(e, [frenado]);
    expect(p1.apoyo.pueblo).toBe(25);
  });

  it('veta los impuestos altos, también los heredados', () => {
    expect(() => fijarImpuestos(e, 'p1', { nivel: 'altos' })).toThrow(expect.objectContaining({ codigo: 'VETO_TRIBUNICIO' }));
    expect(fijarImpuestos(e, 'p1', { nivel: 'bajos' })).toHaveLength(1);
    p1.impuestos = 'altos';
    expect(impuestosDe(p1)).toBe('normales');
  });

  it('veta el estado de excepción', () => {
    expect(() => declararEmergencia(e, 'p1')).toThrow(expect.objectContaining({ codigo: 'VETO_TRIBUNICIO' }));
  });
});

describe('Revisor', () => {
  it('anula el golpe de líderes y militares pero no una revolución', () => {
    p1.gobierno = 'teocracia';
    p1.apoyo = { pueblo: 100, lideres: 0, militares: 100 };
    expect(de(cerrarRondaGobierno(e, siempre), 'LevantamientoFrenado')[0].datos.poder).toBe('revisor');
    p1.apoyo = { pueblo: 0, lideres: 100, militares: 100 };
    p1.gobierno = 'presidencialismo';
    expect(de(cerrarRondaGobierno(e, siempre), 'Levantamiento')).toHaveLength(1);
  });

  it('hace más difícil cambiar de gobierno', () => {
    p1.gobierno = 'presidencialismo';
    const rigida = resultadoVotacion(e, 'p1', 'tecnocracia').porcentaje;
    p1.gobierno = 'parlamentarismo';
    p1.apoyo = todos(100);
    const conRevisor = (g) => { p1.gobierno = g; return resultadoVotacion(e, 'p1', 'tecnocracia'); };
    expect(conRevisor('presidencialismo').porcentaje).toBe(rigida);
    p1.gobierno = 'presidencialismo';
    const sin = 0.4 * apoyoEfectivo(p1, 'pueblo') + 0.6 * (50 + (45 - 65) / 2);
    expect(rigida).toBeCloseTo(sin - 10);
  });
});

describe('Control', () => {
  beforeEach(() => { p1.gobierno = 'republica_semidirecta'; });

  it('no deja comprar votos pero sí votar gratis', () => {
    p1.recursos.gold = 100;
    expect(() => proponerGobierno(e, 'p1', { gobierno: 'tecnocracia', oro: 10 }))
      .toThrow(expect.objectContaining({ codigo: 'VOTOS_AUDITADOS' }));
    expect(p1.recursos.gold).toBe(100);
    expect(proponerGobierno(e, 'p1', { gobierno: 'tecnocracia', oro: 0 }).length).toBeGreaterThan(0);
  });

  it('la corrupción deja de quitar oro', () => {
    const problema = { id: 'x', tipo: 'corrupcion', gravedad: 1, ciudades: [{ x: 1, y: 1 }] };
    p1.problemas = [problema];
    expect(perdidaFijaOro(p1)).toBe(0);
    p1.gobierno = 'monarquia';
    expect(perdidaFijaOro(p1)).toBeGreaterThan(0);
  });
});

describe('Mérito', () => {
  it('da ciencia y cuesta respeto de los líderes', () => {
    p1.gobierno = 'absolutismo'; // +10 de respeto propio de líderes
    p1.apoyo = todos(50);
    expect(multiplicadorProduccion(p1, 'science')).toBeCloseTo(1.15);
    expect(apoyoEfectivo(p1, 'lideres')).toBe(50);
  });
});

describe('Electoral', () => {
  beforeEach(() => {
    p1.gobierno = 'republica_directa';
    e.turno = 8;
  });

  it('ganar la elección legitima; perderla no', () => {
    p1.apoyo = { pueblo: 60, lideres: 40, militares: 100 };
    const [apoyo] = de(cerrarRondaGobierno(e, nunca), 'ApoyoActualizado');
    expect(apoyo.datos.apoyo).toMatchObject({ lideres: 45 });

    p1.apoyo = { pueblo: 40, lideres: 40, militares: 100 };
    const evs = cerrarRondaGobierno(e, nunca);
    expect(de(evs, 'PoderPerdido').map(x => x.datos.motivo)).toEqual(['eleccion']);
    expect(de(evs, 'ApoyoActualizado')[0]?.datos.apoyo.lideres ?? 40).toBe(40);
  });

  it('pone tope al mandato', () => {
    expect(() => fijarMandato(e, 'p1', { rondas: 13 })).toThrow(expect.objectContaining({ codigo: 'MANDATO_INVALIDO' }));
    expect(fijarMandato(e, 'p1', { rondas: 12 })).toHaveLength(1);
    p1.mandato = 40;
    expect(mandatoDe(e, p1)).toBe(12);
  });
});

describe('Estado de excepción', () => {
  it('concentrado: cuesta 15 de pueblo, dura tres rondas y protege del cargo', () => {
    p1.gobierno = 'monarquia';
    p1.apoyo = { pueblo: 50, lideres: 26, militares: 100 };
    aplicar(e, declararEmergencia(e, 'p1'));
    expect(p1.apoyo.pueblo).toBe(35);
    expect(p1.emergenciaHasta).toBe(e.turno + 2);

    p1.apoyo = { pueblo: 100, lideres: -10, militares: 100 }; // bajo el umbral con el respeto incluido
    const turno = e.turno;
    expect(de(cerrarRondaGobierno(e, nunca), 'PoderPerdido')).toEqual([]);
    e.turno = turno + 3;
    expect(de(cerrarRondaGobierno(e, nunca), 'PoderPerdido').map(x => x.datos.motivo)).toEqual(['expulsion']);
  });

  it('un levantamiento pasa por encima de la emergencia', () => {
    p1.gobierno = 'dictadura';
    p1.apoyo = { pueblo: 100, lideres: 0, militares: 100 };
    aplicar(e, declararEmergencia(e, 'p1'));
    expect(de(cerrarRondaGobierno(e, siempre), 'Levantamiento')).toHaveLength(1);
  });

  it('regulada: cuesta 5 y no protege del cargo', () => {
    p1.gobierno = 'republica_semidirecta';
    p1.apoyo = { pueblo: 50, lideres: 50, militares: 50 };
    aplicar(e, declararEmergencia(e, 'p1'));
    expect(p1.apoyo.pueblo).toBe(45);
    p1.apoyo = { pueblo: 100, lideres: 0, militares: 100 };
    expect(de(cerrarRondaGobierno(e, nunca), 'PoderPerdido').map(x => x.datos.motivo)).toEqual(['expulsion']);
  });

  it('no se puede repetir hasta que pase la espera', () => {
    aplicar(e, declararEmergencia(e, 'p1'));
    expect(() => declararEmergencia(e, 'p1')).toThrow(expect.objectContaining({ codigo: 'EN_ENFRIAMIENTO' }));
    e.turno += 12;
    expect(declararEmergencia(e, 'p1').length).toBeGreaterThan(0);
  });

  it('abarata reclutar solo mientras dura', () => {
    const tile = ciudadDe('p1');
    tile.ejercito = null;
    p1.recursos = { ...p1.recursos, gold: 999, food: 999, wood: 999, stone: 999 };
    const costo = () => reclutar(e, 'p1', { x: tile.x, y: tile.y, unidad: 'warrior' })[0].datos.costo;
    const normal = costo();
    aplicar(e, declararEmergencia(e, 'p1'));
    const barato = costo();
    for (const [recurso, monto] of Object.entries(normal)) expect(barato[recurso]).toBe(Math.round(monto * 0.75));
    e.turno += 3;
    expect(costo()).toEqual(normal);
  });

  it('las ciudades se defienden mejor', () => {
    const tile = ciudadDe('p1');
    tile.ejercito = null;
    tile.ciudad.salud = 500;
    const vecina = e.mapa.find(t => Math.abs(t.x - tile.x) + Math.abs(t.y - tile.y) === 1 && t.terreno !== 'water');
    const atacante = Object.keys(UNIDADES).find(u => u === 'warrior');
    const dano = () => {
      vecina.ejercito = { tipo: atacante, dueno: 'p2', salud: 100, movimientoRestante: 2, bonoMovimiento: 0 };
      e.indiceJugadorActual = e.jugadores.findIndex(j => j.id === 'p2');
      const ev = atacar(e, 'p2', { desde: { x: vecina.x, y: vecina.y }, hasta: { x: tile.x, y: tile.y } }, () => 0.5)
        .find(x => x.tipo === 'CombateResuelto');
      return ev.datos.danoCiudad;
    };
    const sin = dano();
    aplicar(e, declararEmergencia(e, 'p1'));
    expect(dano()).toBeLessThan(sin);
  });
});
