import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { MapGameRepo } from '../../src/db/MapGameRepo.js';
import { MapGameService } from '../../src/services/MapGameService.js';

function crearServicio() {
  const db = new Database(':memory:');
  const repo = new MapGameRepo(db, 'sqlite');
  repo.init();
  return new MapGameService({ repo });
}
const accion = (svc, id, jugador, tipo) => svc.accion(id, jugador.id, { tipo }, jugador.token);
const terminar = (svc, id, jugador) => accion(svc, id, jugador, 'terminarTurno');
async function unir(svc, id, jugadorId) {
  const { token, vista } = await svc.unirse(id, { id: jugadorId, nombre: jugadorId, civilizacion: `Civ ${jugadorId}` });
  return { id: jugadorId, token, vista };
}
const bots = (vista) => vista.jugadores.filter(j => j.esBot);

describe('varios bots junto con personas', () => {
  it('los bots entran con el primer humano y dejan lugar para que se sume más gente', async () => {
    const svc = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'Familia', bots: 2, config: { tamanoMapa: 20 } });
    const a = await unir(svc, id, 'a');
    expect(a.vista.jugadores[0].id).toBe('a');
    expect(bots(a.vista).map(j => j.id)).toEqual(['bot-ia', 'bot-ia-2']);
    expect(new Set(bots(a.vista).map(j => j.civilizacion)).size).toBe(2);
    expect(new Set(bots(a.vista).map(j => j.nombre)).size).toBe(2);

    const b = await unir(svc, id, 'b');
    expect(b.vista.jugadores).toHaveLength(4);
    expect(bots(b.vista)).toHaveLength(2);
  });

  it('las máquinas no ocupan los lugares de las personas: con tres o cuatro bots entran cuatro', async () => {
    for (const cantidad of [3, 4]) {
      const svc = crearServicio();
      const { id } = await svc.crearPartida({ nombre: 'Familia', bots: cantidad });
      let ultima;
      for (const j of ['a', 'b', 'c', 'd']) ultima = await unir(svc, id, j);
      expect(ultima.vista.jugadores.filter(x => !x.esBot)).toHaveLength(4);
      expect(bots(ultima.vista)).toHaveLength(cantidad);
      await expect(unir(svc, id, 'e')).rejects.toThrow(/llena/);
    }
  });

  it('con el máximo de bots la mesa llega al tope y entran dos personas', async () => {
    const svc = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'Familia', bots: 6 });
    await unir(svc, id, 'a');
    const b = await unir(svc, id, 'b');
    expect(b.vista.jugadores).toHaveLength(8);
    await expect(unir(svc, id, 'c')).rejects.toThrow(/llena/);
  });

  it('turno simultáneo: los bots juegan cuando terminó el último humano', async () => {
    const svc = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'Familia', bots: 2, config: { modoTurno: 'simultaneo', tamanoMapa: 20 } });
    const a = await unir(svc, id, 'a');
    const b = await unir(svc, id, 'b');
    await svc.iniciar(id);

    const trasA = await terminar(svc, id, a);
    expect(trasA.vista.turno).toBe(1);
    expect(trasA.vista.listos).toEqual(['a']);

    const trasB = await terminar(svc, id, b);
    expect(trasB.vista.turno).toBe(2);
    expect(trasB.eventos.filter(e => e.tipo === 'JugadorListo').map(e => e.jugadorId)).toEqual(['b', 'bot-ia', 'bot-ia-2']);
  });

  it('por turnos: los bots juegan en cadena entre un humano y el siguiente', async () => {
    const svc = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'Familia', bots: 2, config: { modoTurno: 'secuencial', tamanoMapa: 20 } });
    const a = await unir(svc, id, 'a');
    const b = await unir(svc, id, 'b');
    await svc.iniciar(id);

    const trasA = await terminar(svc, id, a);
    expect(trasA.vista.turno).toBe(1);
    expect(trasA.vista.jugadores[trasA.vista.indiceJugadorActual].id).toBe('b');

    const trasB = await terminar(svc, id, b);
    expect(trasB.vista.turno).toBe(2);
    expect(trasB.vista.jugadores[trasB.vista.indiceJugadorActual].id).toBe('a');
  });

  it('jugar solo contra varias máquinas: no entra nadie más y la ronda avanza', async () => {
    const svc = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'Solo', contraIA: true, bots: 3, config: { modoTurno: 'simultaneo', tamanoMapa: 20 } });
    const yo = await unir(svc, id, 'yo');
    expect(yo.vista.jugadores).toHaveLength(4);
    await expect(unir(svc, id, 'otro')).rejects.toThrow(/llena/);
    await svc.iniciar(id);
    expect((await terminar(svc, id, yo)).vista.turno).toBe(2);
  });

  it('si no queda ningún humano la partida termina en vez de quedar colgada', async () => {
    const svc = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'Solo', contraIA: true, bots: 2, config: { tamanoMapa: 20 } });
    const yo = await unir(svc, id, 'yo');
    await svc.iniciar(id);
    const { vista } = await accion(svc, id, yo, 'abandonar');
    expect(vista.estado).toBe('terminado');
  });

  it('una cantidad rara de bots cae a un valor válido', async () => {
    const svc = crearServicio();
    const muchos = await svc.crearPartida({ nombre: 'X', contraIA: true, bots: 99 });
    expect((await unir(svc, muchos.id, 'yo')).vista.jugadores).toHaveLength(7);
    const texto = await svc.crearPartida({ nombre: 'X', contraIA: true, bots: 'muchos' });
    expect((await unir(svc, texto.id, 'yo')).vista.jugadores).toHaveLength(2);
    const negativo = await svc.crearPartida({ nombre: 'X', bots: -3 });
    expect((await unir(svc, negativo.id, 'yo')).vista.jugadores).toHaveLength(1);
  });
});
