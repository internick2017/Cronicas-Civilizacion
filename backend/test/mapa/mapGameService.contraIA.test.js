import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { MapGameRepo } from '../../src/db/MapGameRepo.js';
import { MapGameService } from '../../src/services/MapGameService.js';
import { ReglaError } from '../../src/domain/mapa/errores.js';

function crearServicio() {
  const db = new Database(':memory:');
  const repo = new MapGameRepo(db, 'sqlite');
  repo.init();
  return new MapGameService({ repo });
}

describe('partidas contra la máquina', () => {
  it('el bot NO existe hasta que el humano se une (evita que un tercero le robe el lugar)', async () => {
    const svc = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'Solo', contraIA: true });

    const activas = await svc.repo.listarActivas();
    // No hay forma directa de leer jugadores sin token; se verifica indirecto:
    // un GET con un token cualquiera para el id del bot debe fallar porque el
    // bot todavia no fue agregado.
    expect(activas.find(p => p.id === id)).toBeTruthy();
    await expect(svc.vista(id, 'bot-ia', 'token-cualquiera')).rejects.toThrow(ReglaError);
  });

  it('con 1 humano ya alcanza para iniciar: el bot se agregó solo al unirse', async () => {
    const svc = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'Solo', contraIA: true });
    const { token } = await svc.unirse(id, { id: 'yo', nombre: 'Yo', civilizacion: 'Incas' });

    await expect(svc.iniciar(id)).resolves.toMatchObject({ iniciada: true });
    const vista = await svc.vista(id, 'yo', token);
    expect(vista.jugadores).toHaveLength(2);
    expect(vista.jugadores.some(j => j.esBot)).toBe(true);
  });

  it('un humano solo (sin contraIA) NO puede iniciar: sigue exigiendo un segundo jugador real', async () => {
    const svc = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'Normal' });
    await svc.unirse(id, { id: 'yo', nombre: 'Yo', civilizacion: 'Incas' });
    await expect(svc.iniciar(id)).rejects.toThrow(ReglaError);
  });

  it('el humano siempre juega primero: el bot es el segundo en el orden de turno', async () => {
    const svc = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'Solo', contraIA: true });
    const { token } = await svc.unirse(id, { id: 'yo', nombre: 'Yo', civilizacion: 'Incas' });
    await svc.iniciar(id);

    const vista = await svc.vista(id, 'yo', token);
    expect(vista.jugadores[0].id).toBe('yo');
    expect(vista.jugadores[1].esBot).toBe(true);
  });

  it('el bot juega su turno SOLO cuando le toca: al terminar el turno humano, ya vuelve a ser su turno', async () => {
    const svc = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'Solo', contraIA: true });
    const { token } = await svc.unirse(id, { id: 'yo', nombre: 'Yo', civilizacion: 'Incas' });
    await svc.iniciar(id);

    const r = await svc.accion(id, 'yo', { tipo: 'terminarTurno' }, token);
    // El bot jugo y termino SU turno en la misma llamada: el que responde
    // (el humano) ya se encuentra de vuelta con el turno en sus manos.
    expect(r.vista.indiceJugadorActual).toBe(0);
    expect(r.vista.jugadores[r.vista.indiceJugadorActual].id).toBe('yo');
    // Los eventos devueltos incluyen tanto el cierre humano como la jugada del bot.
    expect(r.eventos.filter(e => e.tipo === 'TurnoAvanzado').length).toBeGreaterThanOrEqual(2);
  });

  // Este test afirmaba que tras 8 rondas el turno siempre vuelve al humano, y
  // era INESTABLE desde antes de existir el rio: el humano de este test nunca
  // se mueve ni se defiende, asi que el bot puede tomarle la capital y ganar
  // por ultimo en pie dentro de esas 8 rondas. Medido sobre 200 partidas: 3
  // terminaban antes de la ronda 8 con el rio siendo agua, y 6 con el rio
  // convertido en tierra vadeable (el mapa quedo mas conectado y el bot llega
  // antes). O sea que fallaba 1 de cada 30 corridas y nadie lo habia visto.
  //
  // Lo que este test quiere probar de verdad es que la partida NO SE TRABA: que
  // el turno alterna y avanza. Que termine es un final legitimo, no un cuelgue,
  // asi que ahora se acepta como salida valida y se corta ahi.
  it('se puede jugar varias rondas seguidas sin que la partida se trabe', async () => {
    const svc = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'Solo', contraIA: true });
    const { token } = await svc.unirse(id, { id: 'yo', nombre: 'Yo', civilizacion: 'Incas' });
    await svc.iniciar(id);

    let rondasJugadas = 0;
    let termino = false;
    for (let ronda = 0; ronda < 8; ronda++) {
      const r = await svc.accion(id, 'yo', { tipo: 'terminarTurno' }, token);
      if (r.vista.estado === 'terminado') {
        // Si termino, tiene que haber terminado de verdad: con un ganador.
        expect(r.vista.ganador).not.toBeNull();
        termino = true;
        break;
      }
      // Mientras la partida siga viva, el bot jugo y devolvio el turno.
      expect(r.vista.jugadores[r.vista.indiceJugadorActual].id).toBe('yo');
      rondasJugadas++;
    }

    const vista = await svc.vista(id, 'yo', token);
    expect(vista.turno).toBeGreaterThanOrEqual(rondasJugadas);
    if (!termino) expect(vista.turno).toBeGreaterThanOrEqual(8);
  });

  it('el bot solo no le sirve un token: no se puede jugar en su nombre', async () => {
    const svc = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'Solo', contraIA: true });
    await svc.unirse(id, { id: 'yo', nombre: 'Yo', civilizacion: 'Incas' });
    await svc.iniciar(id);

    await expect(
      svc.accion(id, 'bot-ia', { tipo: 'terminarTurno' }, 'token-inventado')
    ).rejects.toThrow(ReglaError);
  });

  it('una partida normal (sin contraIA) no se ve afectada: nadie juega el turno de nadie', async () => {
    const svc = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'Normal' });
    const { token: t1 } = await svc.unirse(id, { id: 'p1', nombre: 'A', civilizacion: 'Incas' });
    await svc.unirse(id, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' });
    await svc.iniciar(id);

    const r = await svc.accion(id, 'p1', { tipo: 'terminarTurno' }, t1);
    // Sin bots, terminar tu turno le pasa el turno al OTRO HUMANO, punto:
    // nadie lo juega por el.
    expect(r.vista.jugadores[r.vista.indiceJugadorActual].id).toBe('p2');
  });
});
