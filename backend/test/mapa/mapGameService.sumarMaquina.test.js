import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { MapGameRepo } from '../../src/db/MapGameRepo.js';
import { MapGameService } from '../../src/services/MapGameService.js';

async function partidaEnJuego(config = {}) {
  const db = new Database(':memory:');
  const repo = new MapGameRepo(db, 'sqlite');
  repo.init();
  const svc = new MapGameService({ repo });
  const { id } = await svc.crearPartida({ nombre: 'Familia', config: { tamanoMapa: 20, ...config } });
  const jugadores = {};
  for (const j of ['a', 'b']) {
    jugadores[j] = { id: j, token: (await svc.unirse(id, { id: j, nombre: j, civilizacion: `Civ ${j}` })).token };
  }
  await svc.iniciar(id);
  const accion = (j, datos) => svc.accion(id, j, datos, jugadores[j].token);
  return { svc, id, accion };
}
const ciudadesDe = (vista, id) => vista.mapa.filter(t => t.ciudad && t.dueno === id);

describe('sumar una máquina a una partida en juego', () => {
  it('entra con su capital en tierra libre, lejos de las demás', async () => {
    const { svc, id, accion } = await partidaEnJuego({ modoTurno: 'simultaneo' });
    const { vista } = await accion('a', { tipo: 'sumarMaquina', dificultadIA: 'dificil' });
    const bot = vista.jugadores.find(j => j.esBot);
    expect(bot).toMatchObject({ id: 'bot-ia', activo: true, dificultadIA: 'dificil' });

    const estado = svc.cache.get(id);
    const capital = estado.mapa.find(t => t.ciudad && t.dueno === 'bot-ia');
    expect(capital.terreno).not.toBe('water');
    const otras = estado.mapa.filter(t => t.ciudad && t.dueno !== 'bot-ia');
    const distancia = Math.min(...otras.map(o => Math.abs(o.x - capital.x) + Math.abs(o.y - capital.y)));
    expect(distancia).toBeGreaterThan(3);
  });

  it('turno simultáneo: juega en la ronda en curso, cuando terminan las personas', async () => {
    const { accion } = await partidaEnJuego({ modoTurno: 'simultaneo' });
    await accion('a', { tipo: 'sumarMaquina' });
    expect((await accion('a', { tipo: 'terminarTurno' })).vista.turno).toBe(1);
    const cierre = await accion('b', { tipo: 'terminarTurno' });
    expect(cierre.vista.turno).toBe(2);
    expect(cierre.eventos.filter(e => e.tipo === 'JugadorListo').map(e => e.jugadorId)).toContain('bot-ia');
  });

  it('por turnos: juega después del último humano y la ronda sigue cerrando', async () => {
    const { accion } = await partidaEnJuego({ modoTurno: 'secuencial' });
    await accion('a', { tipo: 'sumarMaquina' });
    await accion('a', { tipo: 'terminarTurno' });
    const { vista } = await accion('b', { tipo: 'terminarTurno' });
    expect(vista.turno).toBe(2);
    expect(vista.jugadores[vista.indiceJugadorActual].id).toBe('a');
  });

  it('se pueden sumar varias, cada una con su id y su civilización', async () => {
    const { accion } = await partidaEnJuego();
    await accion('a', { tipo: 'sumarMaquina' });
    const { vista } = await accion('b', { tipo: 'sumarMaquina' });
    const bots = vista.jugadores.filter(j => j.esBot);
    expect(bots.map(j => j.id)).toEqual(['bot-ia', 'bot-ia-2']);
    expect(new Set(bots.map(j => j.civilizacion)).size).toBe(2);
  });

  it('hay un tope, y una dificultad rara cae a la normal', async () => {
    const { accion } = await partidaEnJuego();
    const { vista } = await accion('a', { tipo: 'sumarMaquina', dificultadIA: 'imposible' });
    expect(vista.jugadores.find(j => j.esBot).dificultadIA).toBe('normal');
    for (let i = 0; i < 5; i++) await accion('a', { tipo: 'sumarMaquina' });
    await expect(accion('a', { tipo: 'sumarMaquina' })).rejects.toThrow(/No entran más/);
  });

  it('la capital de la máquina nueva queda en la niebla de quien la sumó', async () => {
    const { accion } = await partidaEnJuego();
    const { vista } = await accion('a', { tipo: 'sumarMaquina' });
    expect(ciudadesDe(vista, 'bot-ia')).toHaveLength(0);
  });
});
