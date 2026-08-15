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
  const { token: tokenP1 } = await svc.unirse(id, { id: 'p1', nombre: 'A', civilizacion: 'Incas' });
  const { token: tokenP2 } = await svc.unirse(id, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' });
  await svc.iniciar(id);
  return { id, codigo, tokenP1, tokenP2 };
}

describe('MapGameService', () => {
  it('la partida sobrevive a un reinicio del backend (el test que el legacy jamas paso)', async () => {
    const db = new Database(':memory:');
    const svc1 = new MapGameService({ repo: new MapGameRepo(db, 'sqlite') });
    svc1.repo.init();
    const { id } = await svc1.crearPartida({ nombre: 'T', semilla: 's1' });
    const { token: tokenP1 } = await svc1.unirse(id, { id: 'p1', nombre: 'A', civilizacion: 'Incas' });
    await svc1.unirse(id, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' });
    await svc1.iniciar(id);
    const antes = await svc1.vista(id, 'p1', tokenP1);

    // "reinicio": servicio nuevo, cache vacio, misma DB
    const svc2 = new MapGameService({ repo: new MapGameRepo(db, 'sqlite') });
    const despues = await svc2.vista(id, 'p1', tokenP1);
    expect(despues).toEqual(antes); // ciudades y recursos NO se perdieron
    // y se puede seguir jugando (el token sobrevive al reinicio tambien):
    const r = await svc2.accion(id, 'p1', { tipo: 'terminarTurno' }, tokenP1);
    expect(r.eventos.some(e => e.tipo === 'TurnoAvanzado')).toBe(true);
  });

  it('crear+unirse+iniciar feliz devuelve vista con niebla', async () => {
    const { svc } = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'Mi Partida' });
    const { vista: vistaUnion } = await svc.unirse(id, { id: 'p1', nombre: 'A', civilizacion: 'Incas' });
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
    const { id, tokenP2 } = await crearPartidaConDosJugadores(svc);

    const antes = repo.cargar(id);

    await expect(svc.accion(id, 'p2', { tipo: 'terminarTurno' }, tokenP2))
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
    const { id, tokenP1, tokenP2 } = await crearPartidaConDosJugadores(svc);

    await svc.accion(id, 'p1', { tipo: 'terminarTurno' }, tokenP1);
    await svc.accion(id, 'p2', { tipo: 'terminarTurno' }, tokenP2); // cierra la ronda

    // el narrador corre async (no bloquea `accion`); darle una vuelta al microtask queue
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(narrador).toHaveBeenCalledTimes(1);
    const eventosPasados = narrador.mock.calls[0][0];
    expect(eventosPasados.some(e => e.tipo === 'RondaCompletada')).toBe(true);
  });

  it('un narrador que rechaza NO rompe la accion', async () => {
    const narrador = vi.fn().mockRejectedValue(new Error('IA caida'));
    const { svc } = crearServicio({ narrador });
    const { id, tokenP1, tokenP2 } = await crearPartidaConDosJugadores(svc);

    await svc.accion(id, 'p1', { tipo: 'terminarTurno' }, tokenP1);
    const r = await svc.accion(id, 'p2', { tipo: 'terminarTurno' }, tokenP2); // cierra la ronda

    expect(r.eventos.some(e => e.tipo === 'RondaCompletada')).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 0));
    expect(narrador).toHaveBeenCalledTimes(1);

    // la partida sigue jugable tras el rechazo del narrador
    const vista = await svc.vista(id, 'p1', tokenP1);
    expect(vista.estado).toBe('jugando');
  });

  it('unirse por codigo', async () => {
    const { svc } = crearServicio();
    const { id, codigo } = await svc.crearPartida({ nombre: 'T' });
    const { vista, token } = await svc.unirse(codigo, { id: 'p1', nombre: 'A', civilizacion: 'Incas' });
    expect(vista.jugadores.some(j => j.id === 'p1')).toBe(true);

    // sigue siendo la misma partida (mismo id)
    const vistaPorId = await svc.vista(id, 'p1', token);
    expect(vistaPorId.jugadores.some(j => j.id === 'p1')).toBe(true);
  });

  it('codigo generado es corto, A-Z0-9, y unico', async () => {
    const { svc } = crearServicio();
    const { codigo } = await svc.crearPartida({ nombre: 'T' });
    expect(codigo).toMatch(/^[A-Z0-9]{6}$/);
  });

  it('si repo.guardar falla, el cache NO queda adelantado respecto de la DB', async () => {
    const { svc, repo } = crearServicio();
    const { id, tokenP1 } = await crearPartidaConDosJugadores(svc);

    const estadoEnDbAntes = repo.cargar(id);

    // Falla la proxima escritura (la que dispara `accion`), simulando un
    // error transitorio de infraestructura.
    vi.spyOn(repo, 'guardar').mockImplementationOnce(() => {
      throw new Error('fallo transitorio de DB');
    });

    await expect(svc.accion(id, 'p1', { tipo: 'terminarTurno' }, tokenP1))
      .rejects.toThrow('fallo transitorio de DB');

    // La DB no cambio (el guardar que fallo nunca completo)...
    const estadoEnDbDespues = repo.cargar(id);
    expect(estadoEnDbDespues).toEqual(estadoEnDbAntes);

    // ...y una lectura posterior en la MISMA instancia del servicio debe reflejar
    // eso, no el estado a medio mutar que la escritura fallida intento guardar.
    const vistaPostFallo = await svc.vista(id, 'p1', tokenP1);
    const vistaEsperada = { ...vistaJugador(estadoEnDbDespues, 'p1'), narrativas: [] };
    expect(vistaPostFallo).toEqual(vistaEsperada);
    // en particular, el turno NO debe haber avanzado (eso es lo que
    // `terminarTurno` intentaba hacer cuando el guardar fallo)
    expect(vistaPostFallo.turno).toBe(estadoEnDbAntes.turno);
  });

  it('el broadcast por socket NO entrega a un jugador la vista de otro (niebla en la capa socket)', async () => {
    const emitir = vi.fn();
    const { svc } = crearServicio({ emitir });
    const { id, tokenP1, tokenP2 } = await crearPartidaConDosJugadores(svc);
    const tokenDe = { p1: tokenP1, p2: tokenP2 };
    emitir.mockClear();

    await svc.accion(id, 'p1', { tipo: 'terminarTurno' }, tokenP1);

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
      const esperada = await svc.vista(id, jugadorId, tokenDe[jugadorId]);
      expect(payload).toEqual(esperada);
      // y nunca contiene la vista del otro jugador
      const otro = jugadorId === 'p1' ? 'p2' : 'p1';
      expect(JSON.stringify(payload)).not.toContain(JSON.stringify(await svc.vista(id, otro, tokenDe[otro])));
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

  it('unirse devuelve un token de 64 caracteres hex, distinto en cada llamada', async () => {
    const { svc } = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'T', semilla: 's1' });
    const r1 = await svc.unirse(id, { id: 'p1', nombre: 'A', civilizacion: 'Incas' });
    const r2 = await svc.unirse(id, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' });
    expect(r1).toHaveProperty('vista');
    expect(r1.token).toMatch(/^[0-9a-f]{64}$/);
    expect(r2.token).toMatch(/^[0-9a-f]{64}$/);
    expect(r1.token).not.toBe(r2.token);
  });

  it('accion con el token correcto funciona igual que antes', async () => {
    const { svc } = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'T', semilla: 's1' });
    const { token: t1 } = await svc.unirse(id, { id: 'p1', nombre: 'A', civilizacion: 'Incas' });
    await svc.unirse(id, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' });
    await svc.iniciar(id);
    const r = await svc.accion(id, 'p1', { tipo: 'terminarTurno' }, t1);
    expect(r.eventos.some(e => e.tipo === 'TurnoAvanzado')).toBe(true);
  });

  it('accion sin token o con token incorrecto lanza TOKEN_INVALIDO', async () => {
    const { svc } = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'T', semilla: 's1' });
    await svc.unirse(id, { id: 'p1', nombre: 'A', civilizacion: 'Incas' });
    await svc.unirse(id, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' });
    await svc.iniciar(id);

    await expect(svc.accion(id, 'p1', { tipo: 'terminarTurno' }, undefined))
      .rejects.toMatchObject({ codigo: 'TOKEN_INVALIDO' });
    await expect(svc.accion(id, 'p1', { tipo: 'terminarTurno' }, 'token-inventado'))
      .rejects.toMatchObject({ codigo: 'TOKEN_INVALIDO' });
  });

  it('el token de OTRO jugador de la misma partida no sirve para actuar en tu nombre', async () => {
    const { svc } = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'T', semilla: 's1' });
    await svc.unirse(id, { id: 'p1', nombre: 'A', civilizacion: 'Incas' });
    const { token: t2 } = await svc.unirse(id, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' });
    await svc.iniciar(id);

    // p2 intenta jugar el turno de p1 (que es quien arranca) usando SU PROPIO token (t2)
    await expect(svc.accion(id, 'p1', { tipo: 'terminarTurno' }, t2))
      .rejects.toMatchObject({ codigo: 'TOKEN_INVALIDO' });
  });

  it('vista con token correcto funciona; con token de otro jugador o ausente lanza TOKEN_INVALIDO', async () => {
    const { svc } = crearServicio();
    const { id } = await svc.crearPartida({ nombre: 'T', semilla: 's1' });
    const { token: t1 } = await svc.unirse(id, { id: 'p1', nombre: 'A', civilizacion: 'Incas' });
    const { token: t2 } = await svc.unirse(id, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' });
    await svc.iniciar(id);

    const v = await svc.vista(id, 'p1', t1);
    expect(v).toHaveProperty('mapa');

    await expect(svc.vista(id, 'p1', t2)).rejects.toMatchObject({ codigo: 'TOKEN_INVALIDO' });
    await expect(svc.vista(id, 'p1', undefined)).rejects.toMatchObject({ codigo: 'TOKEN_INVALIDO' });
  });

  it('reclutar a traves del servicio (como la API real) recluta la unidad pedida, no "reclutar"', async () => {
    // Reproduce el bug real: MapGameService._accion enruta con `accion.tipo`
    // ('reclutar', 'construir', ...) y pasa el objeto `accion` COMPLETO, sin
    // modificar, a la regla elegida (ver REGLAS_POR_TIPO). Si la regla
    // `reclutar` tambien leyera su unidad bajo el nombre `tipo`, ese campo ya
    // valdria 'reclutar' (el de enrutamiento) y jamas el tipo de unidad
    // pedido: UNIDADES['reclutar'] no existe, asi que la accion fallaria
    // SIEMPRE con UNIDAD_DESCONOCIDA sin importar que mande el cliente. Los
    // tests de reglas/militar.js llaman a reclutar() directo, salteando este
    // enrutamiento, por eso el bug sobrevivio. Este test pasa por
    // svc.accion(), igual que la ruta POST /:id/accion real.
    const { svc } = crearServicio();
    const { id, tokenP1 } = await crearPartidaConDosJugadores(svc);

    const antes = await svc.vista(id, 'p1', tokenP1);
    const capital = antes.mapa.find(t => t.ciudad && t.dueno === 'p1');

    const r = await svc.accion(
      id,
      'p1',
      { tipo: 'reclutar', x: capital.x, y: capital.y, unidad: 'warrior' },
      tokenP1
    );

    expect(r.eventos.map(e => e.tipo)).toEqual(['RecursosGastados', 'UnidadReclutada']);
    const tileReclutado = r.vista.mapa.find(t => t.x === capital.x && t.y === capital.y);
    expect(tileReclutado.ejercito).toMatchObject({ tipo: 'warrior', dueno: 'p1' });
  });

  describe('narrativas en la vista', () => {
    it('la vista incluye las narrativas guardadas de la partida', async () => {
      const { svc, repo } = crearServicio();
      const { id, tokenP1 } = await crearPartidaConDosJugadores(svc);
      await repo.guardarNarrativa(id, 1, 'Algo paso.');

      const vista = await svc.vista(id, 'p1', tokenP1);
      expect(vista.narrativas).toEqual([{ ronda: 1, texto: 'Algo paso.' }]);
    });

    it('sin narrativas, el campo existe y esta vacio', async () => {
      const { svc } = crearServicio();
      const { id, tokenP1 } = await crearPartidaConDosJugadores(svc);
      const vista = await svc.vista(id, 'p1', tokenP1);
      expect(vista.narrativas).toEqual([]);
    });
  });
});
