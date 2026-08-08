import { describe, it, expect } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { MapGameRepo } from '../../src/db/MapGameRepo.js';
import { MapGameService } from '../../src/services/MapGameService.js';
import { crearMapRoutes } from '../../src/routes/mapRoutes.js';

function crearApp(servicio) {
  const app = express();
  app.use(express.json());
  app.use('/api/map', crearMapRoutes(servicio));
  return app;
}

function crearServicio(opts = {}) {
  const db = new Database(':memory:');
  const repo = new MapGameRepo(db, 'sqlite');
  repo.init();
  const servicio = new MapGameService({ repo, ...opts });
  return { db, repo, servicio, app: crearApp(servicio) };
}

describe('mapRoutes', () => {
  it('flujo feliz: crear -> unirse x2 -> iniciar -> accion', async () => {
    const { app } = crearServicio();

    const resCrear = await request(app)
      .post('/api/map')
      .send({ nombre: 'Mi Partida', semilla: 's1' });
    expect(resCrear.status).toBe(201);
    expect(resCrear.body).toHaveProperty('id');
    expect(resCrear.body).toHaveProperty('codigo');
    const { id } = resCrear.body;

    const resUnirse1 = await request(app)
      .post(`/api/map/${id}/unirse`)
      .send({ id: 'p1', nombre: 'A', civilizacion: 'Incas' });
    expect(resUnirse1.status).toBe(200);
    expect(resUnirse1.body.vista.jugadores.some(j => j.id === 'p1')).toBe(true);
    expect(resUnirse1.body.token).toMatch(/^[0-9a-f]{64}$/);
    const tokenP1 = resUnirse1.body.token;

    const resUnirse2 = await request(app)
      .post(`/api/map/${id}/unirse`)
      .send({ id: 'p2', nombre: 'B', civilizacion: 'Mayas' });
    expect(resUnirse2.status).toBe(200);
    expect(resUnirse2.body.vista.jugadores.some(j => j.id === 'p2')).toBe(true);

    const resIniciar = await request(app).post(`/api/map/${id}/iniciar`);
    expect(resIniciar.status).toBe(200);
    expect(resIniciar.body.estado).toBe('jugando');

    // el primer jugador en unirse (p1) es quien arranca
    const resAccion = await request(app)
      .post(`/api/map/${id}/accion`)
      .set('X-Jugador-Token', tokenP1)
      .send({ jugadorId: 'p1', tipo: 'terminarTurno' });
    expect(resAccion.status).toBe(200);
    expect(resAccion.body).toHaveProperty('vista');
    expect(resAccion.body).toHaveProperty('eventos');
    expect(resAccion.body.eventos.some(e => e.tipo === 'TurnoAvanzado')).toBe(true);
  });

  it('accion invalida (fuera de turno) devuelve 400 con codigo NO_ES_TU_TURNO', async () => {
    const { app } = crearServicio();
    const resCrear = await request(app).post('/api/map').send({ nombre: 'T', semilla: 's1' });
    const { id } = resCrear.body;
    await request(app).post(`/api/map/${id}/unirse`).send({ id: 'p1', nombre: 'A', civilizacion: 'Incas' });
    const resUnirse2 = await request(app).post(`/api/map/${id}/unirse`).send({ id: 'p2', nombre: 'B', civilizacion: 'Mayas' });
    const tokenP2 = resUnirse2.body.token;
    await request(app).post(`/api/map/${id}/iniciar`);

    // p2 no es el jugador actual (p1 empieza) -> NO_ES_TU_TURNO, con SU PROPIO token valido
    const res = await request(app)
      .post(`/api/map/${id}/accion`)
      .set('X-Jugador-Token', tokenP2)
      .send({ jugadorId: 'p2', tipo: 'terminarTurno' });

    expect(res.status).toBe(400);
    expect(res.body.codigo).toBe('NO_ES_TU_TURNO');
    expect(res.body).toHaveProperty('mensaje');
  });

  it('accion sin token o con token incorrecto devuelve 400 con codigo TOKEN_INVALIDO', async () => {
    const { app } = crearServicio();
    const resCrear = await request(app).post('/api/map').send({ nombre: 'T', semilla: 's1' });
    const { id } = resCrear.body;
    await request(app).post(`/api/map/${id}/unirse`).send({ id: 'p1', nombre: 'A', civilizacion: 'Incas' });
    await request(app).post(`/api/map/${id}/unirse`).send({ id: 'p2', nombre: 'B', civilizacion: 'Mayas' });
    await request(app).post(`/api/map/${id}/iniciar`);

    const sinToken = await request(app)
      .post(`/api/map/${id}/accion`)
      .send({ jugadorId: 'p1', tipo: 'terminarTurno' });
    expect(sinToken.status).toBe(400);
    expect(sinToken.body.codigo).toBe('TOKEN_INVALIDO');

    const tokenFalso = await request(app)
      .post(`/api/map/${id}/accion`)
      .set('X-Jugador-Token', 'no-es-un-token-real')
      .send({ jugadorId: 'p1', tipo: 'terminarTurno' });
    expect(tokenFalso.status).toBe(400);
    expect(tokenFalso.body.codigo).toBe('TOKEN_INVALIDO');
  });

  it('GET de un id inexistente devuelve 404 sin token (no hay token que verificar sobre una partida que no existe)', async () => {
    const { app } = crearServicio();
    const res = await request(app).get('/api/map/no-existe?jugadorId=p1').set('X-Jugador-Token', 'x');
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty('codigo');
    expect(res.body).toHaveProperty('mensaje');
  });

  it('GET / lista partidas activas', async () => {
    const { app } = crearServicio();
    await request(app).post('/api/map').send({ nombre: 'T', semilla: 's1' });
    const res = await request(app).get('/api/map');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBe(1);
  });

  it('GET sin token o con el token de otro jugador devuelve 400 TOKEN_INVALIDO', async () => {
    const { app } = crearServicio();
    const resCrear = await request(app).post('/api/map').send({ nombre: 'T', semilla: 's1' });
    const { id } = resCrear.body;
    await request(app).post(`/api/map/${id}/unirse`).send({ id: 'p1', nombre: 'A', civilizacion: 'Incas' });
    const resUnirse2 = await request(app).post(`/api/map/${id}/unirse`).send({ id: 'p2', nombre: 'B', civilizacion: 'Mayas' });
    const tokenP2 = resUnirse2.body.token;
    await request(app).post(`/api/map/${id}/iniciar`);

    const sinToken = await request(app).get(`/api/map/${id}?jugadorId=p1`);
    expect(sinToken.status).toBe(400);
    expect(sinToken.body.codigo).toBe('TOKEN_INVALIDO');

    // token VALIDO pero de otro jugador (p2) intentando leer la vista de p1
    const tokenAjeno = await request(app).get(`/api/map/${id}?jugadorId=p1`).set('X-Jugador-Token', tokenP2);
    expect(tokenAjeno.status).toBe(400);
    expect(tokenAjeno.body.codigo).toBe('TOKEN_INVALIDO');
  });

  it('fuga de informacion: la vista de p1 no revela la ciudad ni la posicion de p2, ni la semilla', async () => {
    const { app } = crearServicio();
    const resCrear = await request(app).post('/api/map').send({ nombre: 'T', semilla: 'semilla-secreta' });
    const { id } = resCrear.body;
    const resUnirse1 = await request(app).post(`/api/map/${id}/unirse`).send({ id: 'p1', nombre: 'A', civilizacion: 'Incas' });
    const tokenP1 = resUnirse1.body.token;
    await request(app).post(`/api/map/${id}/unirse`).send({ id: 'p2', nombre: 'B', civilizacion: 'Mayas' });
    await request(app).post(`/api/map/${id}/iniciar`);

    const res = await request(app).get(`/api/map/${id}?jugadorId=p1`).set('X-Jugador-Token', tokenP1);
    expect(res.status).toBe(200);

    // ningun tile no descubierto por p1 debe traer la clave `ciudad`
    // (ni ninguna otra info mas alla de x, y, descubierto)
    for (const tile of res.body.mapa) {
      if (tile.descubierto === false) {
        expect(tile).not.toHaveProperty('ciudad');
        expect(Object.keys(tile).sort()).toEqual(['descubierto', 'x', 'y']);
      }
    }
    // p1 no debe ver capital de p2 fundada (algun tile descubierto por p1 con ciudad
    // pertenece solo a p1, nunca a p2)
    const ciudadesVisibles = res.body.mapa.filter(t => t.descubierto && t.ciudad);
    expect(ciudadesVisibles.every(t => t.dueno === 'p1')).toBe(true);

    // la semilla del mapa nunca debe viajar en la respuesta serializada
    const serializado = JSON.stringify(res.body);
    expect(serializado).not.toContain('semilla-secreta');
    expect(res.body).not.toHaveProperty('semilla');
  });
});
