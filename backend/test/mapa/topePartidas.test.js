import { describe, it, expect, afterEach } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import { MapGameRepo } from '../../src/db/MapGameRepo.js';
import { MapGameService } from '../../src/services/MapGameService.js';
import { crearMapRoutes } from '../../src/routes/mapRoutes.js';
import { estaViva } from '../../src/domain/mapa/salas.js';

function crearApp() {
  const repo = new MapGameRepo(new Database(':memory:'), 'sqlite');
  repo.init();
  const app = express();
  app.use(express.json());
  app.use('/api/map', crearMapRoutes(new MapGameService({ repo })));
  return app;
}

afterEach(() => { delete process.env.MAX_PARTIDAS_ACTIVAS; });

describe('tope de partidas vivas', () => {
  it('al llegar al tope responde 503 SALA_LLENA y no crea la partida', async () => {
    process.env.MAX_PARTIDAS_ACTIVAS = '2';
    const app = crearApp();
    expect((await request(app).post('/api/map').send({ nombre: 'A' })).status).toBe(201);
    expect((await request(app).post('/api/map').send({ nombre: 'B' })).status).toBe(201);
    const res = await request(app).post('/api/map').send({ nombre: 'C' });
    expect(res.status).toBe(503);
    expect(res.body.codigo).toBe('SALA_LLENA');
    expect((await request(app).get('/api/map')).body).toHaveLength(2);
  });

  it('con tope 0 no limita', async () => {
    process.env.MAX_PARTIDAS_ACTIVAS = '0';
    const app = crearApp();
    for (let i = 0; i < 3; i++) expect((await request(app).post('/api/map').send({ nombre: `P${i}` })).status).toBe(201);
  });

  it('estaViva: terminadas y abandonadas no ocupan cupo', () => {
    const ahora = new Date('2026-11-06T12:00:00Z');
    const hace = (h) => new Date(ahora.getTime() - h * 3600e3);
    expect(estaViva({ estado: 'esperando', actualizado: hace(1) }, ahora)).toBe(true);
    expect(estaViva({ estado: 'esperando', actualizado: hace(30) }, ahora)).toBe(false);
    expect(estaViva({ estado: 'jugando', actualizado: hace(2) }, ahora)).toBe(true);
    expect(estaViva({ estado: 'jugando', actualizado: hace(8) }, ahora)).toBe(false);
    expect(estaViva({ estado: 'terminado', actualizado: hace(0) }, ahora)).toBe(false);
  });
});
