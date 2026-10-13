import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { crearEstado, jugadorPorId } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { renombrarPais, LARGO_MAXIMO_NOMBRE_PAIS } from '../../src/domain/mapa/reglas/pais.js';
import { MapGameRepo } from '../../src/db/MapGameRepo.js';
import { MapGameService } from '../../src/services/MapGameService.js';

let e;
beforeEach(() => {
  e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
});

describe('renombrarPais', () => {
  it('cambia el nombre del país, recorta espacios y no toca nada más', () => {
    aplicar(e, iniciar(e));
    const antes = structuredClone(jugadorPorId(e, 'p1'));
    const evs = renombrarPais(e, 'p1', { nombre: '  Tahuantinsuyo ' });
    expect(evs.map(ev => ev.tipo)).toEqual(['PaisRenombrado']);
    aplicar(e, evs);
    expect(jugadorPorId(e, 'p1')).toEqual({ ...antes, civilizacion: 'Tahuantinsuyo' });
  });

  it('se puede en cualquier momento: sin ser tu turno y también en la sala de espera', () => {
    aplicar(e, renombrarPais(e, 'p2', { nombre: 'Tikal' }));
    expect(jugadorPorId(e, 'p2').civilizacion).toBe('Tikal');
    aplicar(e, iniciar(e));
    // En secuencial arranca p1: p2 renombra igual.
    aplicar(e, renombrarPais(e, 'p2', { nombre: 'Palenque' }));
    expect(jugadorPorId(e, 'p2').civilizacion).toBe('Palenque');
  });

  it('las ciudades ya fundadas conservan su nombre', () => {
    aplicar(e, iniciar(e));
    aplicar(e, renombrarPais(e, 'p1', { nombre: 'Tahuantinsuyo' }));
    expect(e.mapa.find(t => t.ciudad && t.dueno === 'p1').ciudad.nombre).toBe('Incas Capital');
  });

  it('rechaza nombre vacío, solo espacios, no texto o demasiado largo', () => {
    for (const nombre of ['', '   ', undefined, 42, 'a'.repeat(LARGO_MAXIMO_NOMBRE_PAIS + 1)]) {
      expect(() => renombrarPais(e, 'p1', { nombre }))
        .toThrowError(expect.objectContaining({ codigo: 'NOMBRE_INVALIDO' }));
    }
  });

  it('rechaza el nombre que ya usa otro país, sin distinguir mayúsculas', () => {
    expect(() => renombrarPais(e, 'p1', { nombre: 'mayas' }))
      .toThrowError(expect.objectContaining({ codigo: 'NOMBRE_REPETIDO' }));
    // Cambiar solo las mayúsculas del propio sí se puede.
    aplicar(e, renombrarPais(e, 'p1', { nombre: 'INCAS' }));
    expect(jugadorPorId(e, 'p1').civilizacion).toBe('INCAS');
  });

  it('rechaza a quien no está en la partida, al eliminado y la partida terminada', () => {
    expect(() => renombrarPais(e, 'nadie', { nombre: 'X' }))
      .toThrowError(expect.objectContaining({ codigo: 'JUGADOR_DESCONOCIDO' }));
    jugadorPorId(e, 'p2').activo = false;
    expect(() => renombrarPais(e, 'p2', { nombre: 'X' }))
      .toThrowError(expect.objectContaining({ codigo: 'JUGADOR_INACTIVO' }));
    e.estado = 'terminado';
    expect(() => renombrarPais(e, 'p1', { nombre: 'X' }))
      .toThrowError(expect.objectContaining({ codigo: 'PARTIDA_TERMINADA' }));
  });
});

describe('renombrarPais por el servicio (como lo manda el navegador)', () => {
  async function partida() {
    const repo = new MapGameRepo(new Database(':memory:'), 'sqlite');
    repo.init();
    const svc = new MapGameService({ repo });
    const { id } = await svc.crearPartida({ nombre: 'Solo', contraIA: true });
    const { token } = await svc.unirse(id, { id: 'yo', nombre: 'Yo', civilizacion: 'Incas' });
    return { svc, repo, id, token };
  }
  const yo = (r) => r.vista.jugadores.find(j => j.id === 'yo');

  it('renombra antes y después de iniciar, y el cambio queda guardado', async () => {
    const { svc, repo, id, token } = await partida();
    let r = await svc.accion(id, 'yo', { tipo: 'renombrarPais', nombre: 'Cusco' }, token);
    expect(yo(r).civilizacion).toBe('Cusco');
    await svc.iniciar(id);
    r = await svc.accion(id, 'yo', { tipo: 'renombrarPais', nombre: 'Tahuantinsuyo' }, token);
    expect(yo(r).civilizacion).toBe('Tahuantinsuyo');

    const otraInstancia = new MapGameService({ repo });
    const guardada = await otraInstancia.vista(id, 'yo', token);
    expect(guardada.jugadores.find(j => j.id === 'yo').civilizacion).toBe('Tahuantinsuyo');
  });

  it('quien perdió el poder también puede renombrar su país', async () => {
    const { svc, id, token } = await partida();
    await svc.iniciar(id);
    const estado = await svc._resolver(id);
    estado.jugadores.find(j => j.id === 'yo').enPoder = false;
    const r = await svc.accion(id, 'yo', { tipo: 'renombrarPais', nombre: 'Exilio' }, token);
    expect(yo(r).civilizacion).toBe('Exilio');
  });
});
