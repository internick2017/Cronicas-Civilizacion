import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { MapGameRepo } from '../../src/db/MapGameRepo.js';
import { MapGameService } from '../../src/services/MapGameService.js';

function crearServicio() {
  const db = new Database(':memory:');
  const repo = new MapGameRepo(db, 'sqlite');
  repo.init();
  const emitidos = [];
  const svc = new MapGameService({ repo, emitir: (_id, jugadorId, tipo, datos) => emitidos.push({ jugadorId, tipo, datos }) });
  return { svc, emitidos };
}
const config = { modoTurno: 'simultaneo', tamanoMapa: 14 };
const terminar = (svc, id, jugadorId, token) => svc.accion(id, jugadorId, { tipo: 'terminarTurno' }, token);

describe('turno simultáneo por el servicio', () => {
  it('dos humanos: la ronda avanza solo cuando terminaron los dos', async () => {
    const { svc, emitidos } = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'Familia', config });
    const a = await svc.unirse(id, { id: 'a', nombre: 'A', civilizacion: 'Incas' });
    const b = await svc.unirse(id, { id: 'b', nombre: 'B', civilizacion: 'Mayas' });
    await svc.iniciar(id);

    // B termina primero, sin esperar a A (que es el primero de la lista).
    const trasB = await terminar(svc, id, 'b', b.token);
    expect(trasB.vista.turno).toBe(1);
    expect(trasB.vista.listos).toEqual(['b']);
    // A se entera por socket de que B ya terminó.
    expect(emitidos.filter(m => m.jugadorId === 'a' && m.tipo === 'estado').at(-1).datos.listos).toEqual(['b']);
    await expect(terminar(svc, id, 'b', b.token)).rejects.toThrow(/Ya terminaste/);

    const trasA = await terminar(svc, id, 'a', a.token);
    expect(trasA.vista.turno).toBe(2);
    expect(trasA.vista.listos).toEqual([]);
    expect(trasA.eventos.map(e => e.tipo)).toContain('RondaCompletada');
  });

  it('contra la máquina: el bot juega cuando el humano termina y la ronda cierra', async () => {
    const { svc } = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'Solo', contraIA: true, config });
    const { token } = await svc.unirse(id, { id: 'yo', nombre: 'Yo', civilizacion: 'Incas' });
    await svc.iniciar(id);

    const { vista, eventos } = await terminar(svc, id, 'yo', token);
    expect(vista.turno).toBe(2);
    expect(vista.listos).toEqual([]);
    expect(eventos.filter(e => e.tipo === 'JugadorListo').map(e => e.jugadorId)).toEqual(['yo', 'bot-ia']);
  });

  it('si abandona el único que faltaba terminar, la partida no queda trabada', async () => {
    const { svc } = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'Familia', config });
    const a = await svc.unirse(id, { id: 'a', nombre: 'A', civilizacion: 'Incas' });
    const b = await svc.unirse(id, { id: 'b', nombre: 'B', civilizacion: 'Mayas' });
    await svc.iniciar(id);
    await terminar(svc, id, 'a', a.token);
    // Abandona el único que faltaba: gana A por último en pie, no queda trabada.
    const { vista } = await svc.accion(id, 'b', { tipo: 'abandonar' }, b.token);
    expect(vista.estado).toBe('terminado');
  });

  it('quien perdió el poder pasa: la máquina juega su turno y queda listo', async () => {
    const { svc } = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'Familia', config });
    const a = await svc.unirse(id, { id: 'a', nombre: 'A', civilizacion: 'Incas' });
    const b = await svc.unirse(id, { id: 'b', nombre: 'B', civilizacion: 'Mayas' });
    await svc.iniciar(id);
    const estado = svc.cache.get(id);
    estado.jugadores.find(j => j.id === 'a').enPoder = false;

    const trasA = await terminar(svc, id, 'a', a.token);
    expect(trasA.vista.listos).toEqual(['a']);
    expect(trasA.vista.turno).toBe(1);
    const trasB = await terminar(svc, id, 'b', b.token);
    expect(trasB.vista.turno).toBe(2);
  });
});
