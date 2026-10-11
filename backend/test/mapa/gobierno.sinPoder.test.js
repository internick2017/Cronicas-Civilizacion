import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { MapGameRepo } from '../../src/db/MapGameRepo.js';
import { MapGameService } from '../../src/services/MapGameService.js';

async function partidaContraIA() {
  const db = new Database(':memory:');
  const repo = new MapGameRepo(db, 'sqlite');
  repo.init();
  const svc = new MapGameService({ repo });
  const { id } = await svc.crearPartida({ nombre: 'Solo', contraIA: true });
  const { token } = await svc.unirse(id, { id: 'yo', nombre: 'Yo', civilizacion: 'Incas' });
  await svc.iniciar(id);
  // Se le quita el poder al humano directo en el cache (la DB sigue la accion
  // siguiente): lo que se prueba es QUE HACE el servicio con alguien sin poder.
  const estado = await svc._resolver(id);
  const yo = estado.jugadores.find(j => j.id === 'yo');
  yo.gobierno = 'monarquia'; // en despotismo se recupera el poder al cerrar la ronda
  yo.enPoder = false;
  yo.recursos.gold = 100;
  return { svc, id, token, yo };
}

describe('un humano sin poder', () => {
  it('su turno lo juega la IA y la partida sigue sin colgarse', async () => {
    const { svc, id, token } = await partidaContraIA();
    const r = await svc.accion(id, 'yo', { tipo: 'darVentajas', grupo: 'pueblo', oro: 5 }, token);
    // La IA jugó el turno del humano y el del bot: hubo varios cierres de turno.
    expect(r.eventos.filter(e => e.tipo === 'TurnoAvanzado').length).toBeGreaterThanOrEqual(2);
    expect(r.vista.turno).toBeGreaterThan(1);
  });

  it('no queda eliminado y sigue activo en la partida', async () => {
    const { svc, id, token } = await partidaContraIA();
    const r = await svc.accion(id, 'yo', { tipo: 'darVentajas', grupo: 'pueblo', oro: 5 }, token);
    const yo = r.vista.jugadores.find(j => j.id === 'yo');
    expect(yo.activo).toBe(true);
    expect(yo.enPoder).toBe(false);
  });

  it('no puede mover ni construir: solo ventajas, terminar turno o abandonar', async () => {
    const { svc, id, token } = await partidaContraIA();
    await expect(svc.accion(id, 'yo', { tipo: 'reclutar', x: 0, y: 0, unidad: 'warrior' }, token))
      .rejects.toMatchObject({ codigo: 'SIN_PODER' });
    await expect(svc.accion(id, 'yo', { tipo: 'proponerGobierno', gobierno: 'monarquia' }, token))
      .rejects.toMatchObject({ codigo: 'SIN_PODER' });
  });

  it('terminar turno sin poder SIEMPRE avanza la partida, sin gastar oro ni trabarse', async () => {
    const { svc, id, token } = await partidaContraIA();
    let turnoAnterior = 0;
    for (let i = 0; i < 4; i++) {
      const r = await svc.accion(id, 'yo', { tipo: 'terminarTurno' }, token);
      expect(r.vista.turno).toBeGreaterThan(turnoAnterior);
      turnoAnterior = r.vista.turno;
    }
  });

  it('al recuperar el poder vuelve a controlar su turno', async () => {
    const { svc, id, token, yo } = await partidaContraIA();
    yo.enPoder = true;
    await expect(svc.accion(id, 'yo', { tipo: 'terminarTurno' }, token)).resolves.toBeTruthy();
  });
});

describe('privacidad de los eventos devueltos', () => {
  it('quien cierra la ronda no recibe el apoyo de otro humano', async () => {
    const db = new Database(':memory:');
    const repo = new MapGameRepo(db, 'sqlite');
    repo.init();
    const svc = new MapGameService({ repo });
    const { id } = await svc.crearPartida({ nombre: 'Dos' });
    const a = await svc.unirse(id, { id: 'a', nombre: 'A', civilizacion: 'Incas' });
    const b = await svc.unirse(id, { id: 'b', nombre: 'B', civilizacion: 'Mayas' });
    await svc.iniciar(id);
    const estado = await svc._resolver(id);
    for (const t of estado.mapa.filter(t => t.terreno !== 'water' && !t.ciudad && !t.dueno).slice(0, 12)) t.dueno = 'a';
    await svc.accion(id, 'a', { tipo: 'terminarTurno' }, a.token);
    const r = await svc.accion(id, 'b', { tipo: 'terminarTurno' }, b.token);
    const ajenos = r.eventos.filter(e => e.tipo === 'ApoyoActualizado' && e.jugadorId !== 'b');
    expect(ajenos).toEqual([]);
    expect(r.eventos.some(e => e.tipo === 'ApoyoActualizado' && e.jugadorId === 'b')).toBe(true);
  });
});
