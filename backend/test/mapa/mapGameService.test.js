import { describe, it, expect, vi } from 'vitest';
import Database from 'better-sqlite3';
import { MapGameRepo } from '../../src/db/MapGameRepo.js';
import { MapGameService } from '../../src/services/MapGameService.js';
import { ReglaError } from '../../src/domain/mapa/errores.js';
import { vistaJugador } from '../../src/domain/mapa/reglas/visibilidad.js';

function crearServicio(opts = {}) {
  const db = new Database(':memory:');
  const repo = new MapGameRepo(db, 'sqlite');
  repo.init();
  return { db, repo, svc: new MapGameService({ repo, ...opts }) };
}

async function crearPartidaConDosJugadores(svc) {
  const { id, codigo } = await svc.crearPartida({ nombre: 'T', semilla: 's1' });
  await svc.unirse(id, { id: 'p1', nombre: 'A', civilizacion: 'Incas' });
  await svc.unirse(id, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' });
  await svc.iniciar(id);
  return { id, codigo };
}

describe('MapGameService', () => {
  it('la partida sobrevive a un reinicio del backend (el test que el legacy jamas paso)', async () => {
    const db = new Database(':memory:');
    const svc1 = new MapGameService({ repo: new MapGameRepo(db, 'sqlite') });
    svc1.repo.init();
    const { id } = await svc1.crearPartida({ nombre: 'T', semilla: 's1' });
    await svc1.unirse(id, { id: 'p1', nombre: 'A', civilizacion: 'Incas' });
    await svc1.unirse(id, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' });
    await svc1.iniciar(id);
    const antes = await svc1.vista(id, 'p1');

    // "reinicio": servicio nuevo, cache vacio, misma DB
    const svc2 = new MapGameService({ repo: new MapGameRepo(db, 'sqlite') });
    const despues = await svc2.vista(id, 'p1');
    expect(despues).toEqual(antes); // ciudades y recursos NO se perdieron
    // y se puede seguir jugando:
    const r = await svc2.accion(id, 'p1', { tipo: 'terminarTurno' });
    expect(r.eventos.some(e => e.tipo === 'TurnoAvanzado')).toBe(true);
  });

  it('crear+unirse+iniciar feliz devuelve vista con niebla', async () => {
    const { svc } = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'Mi Partida' });
    const vistaUnion = await svc.unirse(id, { id: 'p1', nombre: 'A', civilizacion: 'Incas' });
    expect(vistaUnion.jugadores.some(j => j.id === 'p1')).toBe(true);
    // niebla: la mayoria de tiles no estan descubiertos todavia
    expect(vistaUnion.mapa.some(t => t.descubierto === false)).toBe(true);

    await svc.unirse(id, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' });
    const vistaInicio = await svc.iniciar(id);
    expect(vistaInicio.estado).toBe('jugando');
    expect(vistaInicio.mapa.some(t => t.descubierto === true)).toBe(true);
  });

  it('accion con ReglaError no persiste nada (atomicidad)', async () => {
    const { svc, repo } = crearServicio();
    const { id } = await crearPartidaConDosJugadores(svc);

    const antes = repo.cargar(id);

    await expect(svc.accion(id, 'p2', { tipo: 'terminarTurno' }))
      .rejects.toBeInstanceOf(ReglaError); // no es el turno de p2

    const despues = repo.cargar(id);
    expect(despues).toEqual(antes);
    expect(repo.eventosDe(id)).toEqual(repo.eventosDe(id)); // sanity: no revienta
    expect(repo.eventosDe(id).length).toBe(
      repo.eventosDe(id).length
    );
  });

  it('narrador es llamado con los eventos al cerrar ronda', async () => {
    const narrador = vi.fn().mockResolvedValue('una narrativa cualquiera');
    const { svc } = crearServicio({ narrador });
    const { id } = await crearPartidaConDosJugadores(svc);

    await svc.accion(id, 'p1', { tipo: 'terminarTurno' });
    await svc.accion(id, 'p2', { tipo: 'terminarTurno' }); // cierra la ronda

    // el narrador corre async (no bloquea `accion`); darle una vuelta al microtask queue
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(narrador).toHaveBeenCalledTimes(1);
    const eventosPasados = narrador.mock.calls[0][0];
    expect(eventosPasados.some(e => e.tipo === 'RondaCompletada')).toBe(true);
  });

  it('un narrador que rechaza NO rompe la accion', async () => {
    const narrador = vi.fn().mockRejectedValue(new Error('IA caida'));
    const { svc } = crearServicio({ narrador });
    const { id } = await crearPartidaConDosJugadores(svc);

    await svc.accion(id, 'p1', { tipo: 'terminarTurno' });
    const r = await svc.accion(id, 'p2', { tipo: 'terminarTurno' }); // cierra la ronda

    expect(r.eventos.some(e => e.tipo === 'RondaCompletada')).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(narrador).toHaveBeenCalledTimes(1);

    // la partida sigue jugable tras el rechazo del narrador
    const vista = await svc.vista(id, 'p1');
    expect(vista.estado).toBe('jugando');
  });

  it('unirse por codigo', async () => {
    const { svc } = crearServicio();
    const { id, codigo } = await svc.crearPartida({ nombre: 'T' });
    const vista = await svc.unirse(codigo, { id: 'p1', nombre: 'A', civilizacion: 'Incas' });
    expect(vista.jugadores.some(j => j.id === 'p1')).toBe(true);

    // sigue siendo la misma partida (mismo id)
    const vistaPorId = await svc.vista(id, 'p1');
    expect(vistaPorId.jugadores.some(j => j.id === 'p1')).toBe(true);
  });

  it('codigo generado es corto, A-Z0-9, y unico', async () => {
    const { svc } = crearServicio();
    const { codigo } = await svc.crearPartida({ nombre: 'T' });
    expect(codigo).toMatch(/^[A-Z0-9]{6}$/);
  });

  it('si repo.guardar falla, el cache NO queda adelantado respecto de la DB', async () => {
    const { svc, repo } = crearServicio();
    const { id } = await crearPartidaConDosJugadores(svc);

    const estadoEnDbAntes = repo.cargar(id);

    // Falla la proxima escritura (la que dispara `accion`), simulando un
    // error transitorio de infraestructura.
    vi.spyOn(repo, 'guardar').mockImplementationOnce(() => {
      throw new Error('fallo transitorio de DB');
    });

    await expect(svc.accion(id, 'p1', { tipo: 'terminarTurno' }))
      .rejects.toThrow('fallo transitorio de DB');

    // La DB no cambio (el guardar que fallo nunca completo)...
    const estadoEnDbDespues = repo.cargar(id);
    expect(estadoEnDbDespues).toEqual(estadoEnDbAntes);

    // ...y una lectura posterior en la MISMA instancia del servicio debe reflejar
    // eso, no el estado a medio mutar que la escritura fallida intento guardar.
    const vistaPostFallo = await svc.vista(id, 'p1');
    const vistaEsperada = vistaJugador(estadoEnDbDespues, 'p1');
    expect(vistaPostFallo).toEqual(vistaEsperada);
    // en particular, el turno NO debe haber avanzado (eso es lo que
    // `terminarTurno` intentaba hacer cuando el guardar fallo)
    expect(vistaPostFallo.turno).toBe(estadoEnDbAntes.turno);
  });

  it('el broadcast por socket NO entrega a un jugador la vista de otro (niebla en la capa socket)', async () => {
    const emitir = vi.fn();
    const { svc } = crearServicio({ emitir });
    const { id } = await crearPartidaConDosJugadores(svc);
    emitir.mockClear();

    await svc.accion(id, 'p1', { tipo: 'terminarTurno' });

    // Se emite UNA vez por jugador, cada una dirigida a ese jugador.
    expect(emitir).toHaveBeenCalledTimes(2);
    const destinatarios = emitir.mock.calls.map(c => c[1]).sort();
    expect(destinatarios).toEqual(['p1', 'p2']);

    for (const [partidaId, jugadorId, evento, payload] of emitir.mock.calls) {
      expect(partidaId).toBe(id);
      expect(evento).toBe('estado');
      // El payload es la vista de ESE jugador, no un diccionario con todas.
      expect(payload).not.toHaveProperty('p1');
      expect(payload).not.toHaveProperty('p2');
      const esperada = await svc.vista(id, jugadorId);
      expect(payload).toEqual(esperada);
      // y nunca contiene la vista del otro jugador
      const otro = jugadorId === 'p1' ? 'p2' : 'p1';
      expect(JSON.stringify(payload)).not.toContain(JSON.stringify(await svc.vista(id, otro)));
    }
  });

  it('dos unirse concurrentes NO se pisan: ambos jugadores quedan persistidos', async () => {
    const { svc, repo } = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'T', semilla: 's1' });

    await Promise.all([
      svc.unirse(id, { id: 'a', nombre: 'A', civilizacion: 'Incas' }),
      svc.unirse(id, { id: 'b', nombre: 'B', civilizacion: 'Mayas' }),
    ]);

    const persistido = repo.cargar(id);
    expect(persistido.jugadores.map(j => j.id).sort()).toEqual(['a', 'b']);
  });
});
