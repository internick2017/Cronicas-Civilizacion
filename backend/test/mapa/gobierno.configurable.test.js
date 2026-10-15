import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { crearEstado, jugadorPorId } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { produccionConResto, produccionBruta } from '../../src/domain/mapa/reglas/turnos.js';
import {
  cerrarRondaGobierno, multiplicadorProduccion, fijarImpuestos, fijarMandato, nombrarGobierno,
  impuestosDe, mandatoDe, nombreGobiernoDe,
} from '../../src/domain/mapa/reglas/gobierno.js';
import { vistaJugador } from '../../src/domain/mapa/reglas/visibilidad.js';
import { IMPUESTOS, LARGO_MAXIMO_NOMBRE_GOBIERNO } from '../../src/domain/mapa/constantes.js';
import { MapGameRepo } from '../../src/db/MapGameRepo.js';
import { MapGameService } from '../../src/services/MapGameService.js';

let e, p1;
const nunca = () => 0.999; // el azar no ocurre nunca
const todos = (v) => ({ pueblo: v, lideres: v, militares: v });
const codigo = (fn) => { try { fn(); } catch (err) { return err.codigo; } return null; };
const de = (evs, tipo) => evs.filter(x => x.tipo === tipo && x.jugadorId === 'p1');

beforeEach(() => {
  e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  p1 = jugadorPorId(e, 'p1');
  p1.apoyo = todos(100);
});

describe('accesores con partida vieja', () => {
  it('sin los campos: impuestos normales, el mandato de la partida (u 8) y el nombre por defecto', () => {
    expect(impuestosDe(p1)).toBe('normales');
    expect(nombreGobiernoDe(p1)).toBeNull();
    e.config.rondasEntreElecciones = 6;
    expect(mandatoDe(e, p1)).toBe(6);
    delete e.config.rondasEntreElecciones;
    expect(mandatoDe(e, p1)).toBe(8);
  });
});

describe('impuestos', () => {
  it('se fijan sin ser tu turno y la vista los muestra', () => {
    const evs = fijarImpuestos(e, 'p2', { nivel: 'altos' });
    expect(evs.map(x => x.tipo)).toEqual(['ImpuestosFijados']);
    aplicar(e, evs);
    expect(impuestosDe(jugadorPorId(e, 'p2'))).toBe('altos');
    expect(vistaJugador(e, 'p2').jugadores.find(j => j.id === 'p2').impuestos).toBe('altos');
  });

  it('rechaza un nivel inexistente y a quien perdió el poder', () => {
    for (const nivel of ['muy altos', 'toString', undefined]) {
      expect(codigo(() => fijarImpuestos(e, 'p1', { nivel }))).toBe('IMPUESTOS_INVALIDOS');
    }
    p1.enPoder = false;
    expect(codigo(() => fijarImpuestos(e, 'p1', { nivel: 'bajos' }))).toBe('SIN_PODER');
    expect(impuestosDe(p1)).toBe('normales');
  });

  it('cambian solo el oro: altos +25%, bajos -20%', () => {
    expect(multiplicadorProduccion({ impuestos: 'altos' }, 'gold')).toBeCloseTo(1 + IMPUESTOS.altos.oro);
    expect(multiplicadorProduccion({ impuestos: 'bajos' }, 'gold')).toBeCloseTo(1 + IMPUESTOS.bajos.oro);
    expect(multiplicadorProduccion({ impuestos: 'altos' }, 'food')).toBe(1);
    // Y se acumulan con el bono del gobierno.
    expect(multiplicadorProduccion({ impuestos: 'altos', gobierno: 'monarquia' }, 'gold')).toBeCloseTo(1.45);
  });

  it('en 10 rondas los impuestos altos rinden el 25% de oro de más', () => {
    const base = produccionBruta(e, 'p1').gold;
    p1.impuestos = 'altos';
    let total = 0;
    for (let i = 0; i < 10; i++) {
      const { produccion, resto } = produccionConResto(e, 'p1');
      aplicar(e, [{ tipo: 'RecursosProducidos', turno: e.turno, jugadorId: 'p1', datos: { jugadorId: 'p1', produccion, resto } }]);
      total += produccion.gold;
    }
    expect(total).toBe(Math.floor(10 * base * (1 + IMPUESTOS.altos.oro) + 1e-9));
  });

  it('mueven el apoyo del pueblo por ronda: bajos +1, altos -2', () => {
    p1.apoyo = todos(50);
    const puebloCon = (nivel) => {
      const copia = structuredClone(e);
      jugadorPorId(copia, 'p1').impuestos = nivel;
      const [ev] = de(cerrarRondaGobierno(copia, nunca), 'ApoyoActualizado');
      return ev ? ev.datos.apoyo.pueblo : 50;
    };
    const normal = puebloCon('normales');
    expect(puebloCon('bajos') - normal).toBe(IMPUESTOS.bajos.apoyoPueblo);
    expect(puebloCon('altos') - normal).toBe(IMPUESTOS.altos.apoyoPueblo);
  });
});

describe('mandato', () => {
  it('una república fija cada cuántas rondas vota, y la elección cae en ese múltiplo', () => {
    p1.gobierno = 'republica_directa';
    aplicar(e, fijarMandato(e, 'p1', { rondas: 5 }));
    expect(mandatoDe(e, p1)).toBe(5);
    p1.apoyo = { pueblo: 40, lideres: 100, militares: 100 };
    e.turno = 8; // la ronda de elecciones de la partida ya no vota
    expect(de(cerrarRondaGobierno(e, nunca), 'PoderPerdido')).toEqual([]);
    e.turno = 10;
    expect(de(cerrarRondaGobierno(e, nunca), 'PoderPerdido').map(x => x.datos.motivo)).toEqual(['eleccion']);
  });

  it('rechaza a quien no es república, mandatos fuera de 2 a 50 y a quien perdió el poder', () => {
    expect(codigo(() => fijarMandato(e, 'p1', { rondas: 5 }))).toBe('NO_ES_REPUBLICA');
    p1.gobierno = 'republica_indirecta';
    for (const rondas of [1, 51, 2.5, '5']) expect(codigo(() => fijarMandato(e, 'p1', { rondas }))).toBe('MANDATO_INVALIDO');
    p1.enPoder = false;
    expect(codigo(() => fijarMandato(e, 'p1', { rondas: 5 }))).toBe('SIN_PODER');
    expect(p1.mandato).toBeUndefined();
  });
});

describe('nombrarGobierno', () => {
  it('guarda el nombre recortado, sin turno, y vacío vuelve al nombre por defecto', () => {
    aplicar(e, nombrarGobierno(e, 'p2', { nombre: '  Junta de Mayo ' }));
    expect(nombreGobiernoDe(jugadorPorId(e, 'p2'))).toBe('Junta de Mayo');
    expect(vistaJugador(e, 'p1').jugadores.find(j => j.id === 'p2').nombreGobierno).toBe('Junta de Mayo');
    aplicar(e, nombrarGobierno(e, 'p2', { nombre: '   ' }));
    expect(nombreGobiernoDe(jugadorPorId(e, 'p2'))).toBeNull();
  });

  it('rechaza nombres largos o que no son texto', () => {
    expect(codigo(() => nombrarGobierno(e, 'p1', { nombre: 'a'.repeat(LARGO_MAXIMO_NOMBRE_GOBIERNO + 1) }))).toBe('NOMBRE_INVALIDO');
    expect(codigo(() => nombrarGobierno(e, 'p1', { nombre: 7 }))).toBe('NOMBRE_INVALIDO');
    expect(nombreGobiernoDe(p1)).toBeNull();
  });
});

describe('gobierno configurable por el servicio', () => {
  it('sin poder se puede nombrar el gobierno, pero no fijar impuestos', async () => {
    const repo = new MapGameRepo(new Database(':memory:'), 'sqlite');
    repo.init();
    const svc = new MapGameService({ repo });
    const { id } = await svc.crearPartida({ nombre: 'Solo', contraIA: true });
    const { token } = await svc.unirse(id, { id: 'yo', nombre: 'Yo', civilizacion: 'Incas' });
    await svc.iniciar(id);
    (await svc._resolver(id)).jugadores.find(j => j.id === 'yo').enPoder = false;
    await expect(svc.accion(id, 'yo', { tipo: 'fijarImpuestos', nivel: 'altos' }, token))
      .rejects.toMatchObject({ codigo: 'SIN_PODER' });
    const r = await svc.accion(id, 'yo', { tipo: 'nombrarGobierno', nombre: 'Consejo' }, token);
    expect(r.vista.jugadores.find(j => j.id === 'yo').nombreGobierno).toBe('Consejo');
  });
});
