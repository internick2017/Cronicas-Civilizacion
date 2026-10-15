import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { crearEstado, jugadorPorId } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { terminarTurno } from '../../src/domain/mapa/reglas/turnos.js';
import { construir } from '../../src/domain/mapa/reglas/ciudades.js';
import { multiplicadorCostos } from '../../src/domain/mapa/reglas/efectosProblemas.js';
import { vistaJugador } from '../../src/domain/mapa/reglas/visibilidad.js';
import {
  monedaDe, inflacionAcunadaDe, nombrarMoneda, acunarMoneda,
} from '../../src/domain/mapa/reglas/moneda.js';
import {
  ACUNACION, MONEDA_POR_DEFECTO, LARGO_MAXIMO_NOMBRE_MONEDA, EDIFICIOS, EFECTOS_PROBLEMAS,
} from '../../src/domain/mapa/constantes.js';
import { MapGameRepo } from '../../src/db/MapGameRepo.js';
import { MapGameService } from '../../src/services/MapGameService.js';

let e, p1;
const codigo = (fn) => { try { fn(); } catch (err) { return err.codigo; } return null; };
const cerrarRonda = () => { aplicar(e, terminarTurno(e, 'p1')); aplicar(e, terminarTurno(e, 'p2')); };

beforeEach(() => {
  e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  p1 = jugadorPorId(e, 'p1');
});

describe('nombrarMoneda', () => {
  it('una partida vieja sin el campo usa la moneda por defecto', () => {
    expect(monedaDe(p1)).toEqual(MONEDA_POR_DEFECTO);
    expect(inflacionAcunadaDe(p1)).toBe(0);
  });

  it('guarda nombre y símbolo recortados, sin turno y también en la sala de espera', () => {
    const evs = nombrarMoneda(e, 'p2', { nombre: '  Peso ', simbolo: ' $ ' });
    expect(evs.map(x => x.tipo)).toEqual(['MonedaNombrada']);
    aplicar(e, evs);
    expect(monedaDe(jugadorPorId(e, 'p2'))).toEqual({ nombre: 'Peso', simbolo: '$' });
    aplicar(e, iniciar(e));
    aplicar(e, nombrarMoneda(e, 'p2', { nombre: 'Austral', simbolo: '🇦🇷' })); // una bandera es un solo símbolo
    expect(monedaDe(jugadorPorId(e, 'p2')).simbolo).toBe('🇦🇷');
  });

  it('rechaza nombre o símbolo vacíos, largos o que no son texto', () => {
    const casos = [
      [{ nombre: '', simbolo: '$' }, 'NOMBRE_INVALIDO'],
      [{ nombre: 'a'.repeat(LARGO_MAXIMO_NOMBRE_MONEDA + 1), simbolo: '$' }, 'NOMBRE_INVALIDO'],
      [{ nombre: 42, simbolo: '$' }, 'NOMBRE_INVALIDO'],
      [{ nombre: 'Peso', simbolo: '  ' }, 'SIMBOLO_INVALIDO'],
      [{ nombre: 'Peso', simbolo: 'ARSX' }, 'SIMBOLO_INVALIDO'],
      [{ nombre: 'Peso' }, 'SIMBOLO_INVALIDO'],
    ];
    for (const [datos, esperado] of casos) expect(codigo(() => nombrarMoneda(e, 'p1', datos))).toBe(esperado);
    expect(monedaDe(p1)).toEqual(MONEDA_POR_DEFECTO);
  });

  it('rechaza al eliminado y la partida terminada', () => {
    jugadorPorId(e, 'p2').activo = false;
    expect(codigo(() => nombrarMoneda(e, 'p2', { nombre: 'X', simbolo: 'X' }))).toBe('JUGADOR_INACTIVO');
    e.estado = 'terminado';
    expect(codigo(() => nombrarMoneda(e, 'p1', { nombre: 'X', simbolo: 'X' }))).toBe('PARTIDA_TERMINADA');
  });
});

describe('acunarMoneda', () => {
  beforeEach(() => {
    aplicar(e, iniciar(e));
    p1.recursos.gold = 0;
  });

  it('da el oro y sube la inflación acuñada: 50 de oro encarecen un 10%', () => {
    const evs = acunarMoneda(e, 'p1', { oro: 50 });
    expect(evs.map(x => x.tipo)).toEqual(['MonedaAcunada']);
    expect(evs[0].datos).toEqual({ oro: 50, inflacion: 50 * ACUNACION.puntosPorOro });
    aplicar(e, evs);
    expect(p1.recursos.gold).toBe(50);
    expect(inflacionAcunadaDe(p1)).toBe(10);
    expect(multiplicadorCostos(p1)).toBeCloseTo(1.1);
  });

  it('los costos reales suben, y se multiplica con la inflación del problema social', () => {
    p1.recursos = { food: 999, gold: 0, wood: 999, stone: 999, science: 999, culture: 999 };
    aplicar(e, acunarMoneda(e, 'p1', { oro: 50 }));
    const ciudad = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
    const [gasto] = construir(e, 'p1', { x: ciudad.x, y: ciudad.y, edificio: 'granary' });
    for (const [r, m] of Object.entries(EDIFICIOS.granary.costo)) expect(gasto.datos.costo[r]).toBe(Math.ceil(m * 1.1 - 1e-9));
    p1.problemas = [{ id: 'pr1', tipo: 'inflacion', gravedad: 1, ciudades: [{ x: ciudad.x, y: ciudad.y }] }];
    expect(multiplicadorCostos(p1)).toBeCloseTo((1 + EFECTOS_PROBLEMAS.inflacion) * 1.1);
  });

  it('rechaza sin turno, cantidades inválidas, pasar el tope de la ronda o el techo, y ningún rechazo da oro', () => {
    expect(codigo(() => acunarMoneda(e, 'p2', { oro: 10 }))).toBe('NO_ES_TU_TURNO');
    for (const oro of [0, -5, 1.5, '10', ACUNACION.maximoPorRonda + 1]) {
      expect(codigo(() => acunarMoneda(e, 'p1', { oro }))).toBe('ORO_INVALIDO');
    }
    aplicar(e, acunarMoneda(e, 'p1', { oro: 60 }));
    expect(codigo(() => acunarMoneda(e, 'p1', { oro: 41 }))).toBe('TOPE_ACUNACION');
    aplicar(e, acunarMoneda(e, 'p1', { oro: 40 }));
    p1.inflacionAcunada = ACUNACION.techo - 1;
    cerrarRonda(); // ronda nueva: el tope de oro vuelve a cero, la inflacion baja a 96
    const oro = p1.recursos.gold;
    expect(codigo(() => acunarMoneda(e, 'p1', { oro: 30 }))).toBe('INFLACION_MAXIMA');
    expect(p1.recursos.gold).toBe(oro);
    aplicar(e, acunarMoneda(e, 'p1', { oro: 20 })); // justo hasta el techo
    expect(inflacionAcunadaDe(p1)).toBe(ACUNACION.techo);
  });

  it('al cerrar cada ronda la inflación baja de a poco hasta cero', () => {
    aplicar(e, acunarMoneda(e, 'p1', { oro: 25 })); // +5
    cerrarRonda();
    expect(inflacionAcunadaDe(p1)).toBe(5 - ACUNACION.bajadaPorRonda);
    cerrarRonda();
    expect(inflacionAcunadaDe(p1)).toBe(0);
  });

  it('la vista muestra la moneda de todos, y la inflación y lo acuñado solo al propio', () => {
    aplicar(e, nombrarMoneda(e, 'p2', { nombre: 'Cacao', simbolo: '🌰' }));
    aplicar(e, acunarMoneda(e, 'p1', { oro: 20 }));
    const vista = vistaJugador(e, 'p1');
    const yo = vista.jugadores.find(j => j.id === 'p1');
    const otro = vista.jugadores.find(j => j.id === 'p2');
    expect(yo).toMatchObject({ moneda: MONEDA_POR_DEFECTO, inflacionAcunada: 4, acunadoEstaRonda: 20 });
    expect(otro.moneda).toEqual({ nombre: 'Cacao', simbolo: '🌰' });
    expect(otro).not.toHaveProperty('inflacionAcunada');
  });
});

describe('moneda por el servicio', () => {
  it('quien perdió el poder puede nombrar su moneda pero no acuñar', async () => {
    const repo = new MapGameRepo(new Database(':memory:'), 'sqlite');
    repo.init();
    const svc = new MapGameService({ repo });
    const { id } = await svc.crearPartida({ nombre: 'Solo', contraIA: true });
    const { token } = await svc.unirse(id, { id: 'yo', nombre: 'Yo', civilizacion: 'Incas' });
    await svc.iniciar(id);
    const sinPoder = async () => { (await svc._resolver(id)).jugadores.find(j => j.id === 'yo').enPoder = false; };
    await sinPoder();
    await expect(svc.accion(id, 'yo', { tipo: 'acunarMoneda', oro: 10 }, token))
      .rejects.toMatchObject({ codigo: 'SIN_PODER' });
    const r = await svc.accion(id, 'yo', { tipo: 'nombrarMoneda', nombre: 'Sol', simbolo: 'S/' }, token);
    expect(r.vista.jugadores.find(j => j.id === 'yo').moneda).toEqual({ nombre: 'Sol', simbolo: 'S/' });
  });
});
