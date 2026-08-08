import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { io as ioClient } from 'socket.io-client';
import Database from 'better-sqlite3';
import { MapGameRepo } from '../../src/db/MapGameRepo.js';
import { MapGameService } from '../../src/services/MapGameService.js';
import { registrarMapSocket } from '../../src/sockets/mapSocket.js';

let httpServer, io, mapGameService, url;

beforeEach(async () => {
  const db = new Database(':memory:');
  const repo = new MapGameRepo(db, 'sqlite');
  repo.init();
  mapGameService = new MapGameService({ repo });

  httpServer = createServer();
  io = new Server(httpServer);
  io.on('connection', (socket) => registrarMapSocket(socket, io, mapGameService));

  await new Promise((resolve) => httpServer.listen(0, resolve));
  url = `http://localhost:${httpServer.address().port}`;
});

afterEach(() => {
  io.close();
  httpServer.close();
});

function conectarCliente() {
  return new Promise((resolve) => {
    const socket = ioClient(url, { transports: ['websocket'] });
    socket.on('connect', () => resolve(socket));
  });
}

describe('registrarMapSocket', () => {
  it('map:join con token correcto une la sala privada del jugador', async () => {
    const { id } = await mapGameService.crearPartida({ nombre: 'T', semilla: 's1' });
    const { token } = await mapGameService.unirse(id, { id: 'p1', nombre: 'A', civilizacion: 'Incas' });

    const cliente = await conectarCliente();
    const ok = await new Promise((resolve) => {
      cliente.emit('map:join', id, 'p1', token, resolve);
    });
    expect(ok).toBe(true);

    // Verificacion server-side: el socket debe estar en la sala privada de p1.
    const socketsEnSala = await io.in(`map:${id}:p1`).fetchSockets();
    expect(socketsEnSala).toHaveLength(1);

    cliente.close();
  });

  it('map:join con token incorrecto NO une ninguna sala', async () => {
    const { id } = await mapGameService.crearPartida({ nombre: 'T', semilla: 's1' });
    await mapGameService.unirse(id, { id: 'p1', nombre: 'A', civilizacion: 'Incas' });

    const cliente = await conectarCliente();
    const ok = await new Promise((resolve) => {
      cliente.emit('map:join', id, 'p1', 'token-invalido', resolve);
    });
    expect(ok).toBe(false);

    const socketsEnSala = await io.in(`map:${id}:p1`).fetchSockets();
    expect(socketsEnSala).toHaveLength(0);

    cliente.close();
  });

  it('map:join con el token de OTRO jugador de la misma partida no une la sala', async () => {
    const { id } = await mapGameService.crearPartida({ nombre: 'T', semilla: 's1' });
    await mapGameService.unirse(id, { id: 'p1', nombre: 'A', civilizacion: 'Incas' });
    const { token: tokenP2 } = await mapGameService.unirse(id, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' });

    const cliente = await conectarCliente();
    const ok = await new Promise((resolve) => {
      cliente.emit('map:join', id, 'p1', tokenP2, resolve);
    });
    expect(ok).toBe(false);

    const socketsEnSala = await io.in(`map:${id}:p1`).fetchSockets();
    expect(socketsEnSala).toHaveLength(0);

    cliente.close();
  });

  it('map:join sin token (llamada vieja, 3 argumentos, sin ack) no une ninguna sala', async () => {
    const { id } = await mapGameService.crearPartida({ nombre: 'T', semilla: 's1' });
    await mapGameService.unirse(id, { id: 'p1', nombre: 'A', civilizacion: 'Incas' });

    const cliente = await conectarCliente();
    // Llamada sin ack (compatible con un cliente viejo que todavia no manda
    // token ni callback): el handler recibe `token=undefined, ack=undefined`,
    // asi que nunca invoca ningun callback. No hay nada que esperar via
    // promesa aca: en vez de eso, se manda un segundo `map:join` CON ack
    // como "punto de sincronizacion" — socket.io procesa los eventos de un
    // mismo socket en orden, asi que cuando el segundo ack llega, el primer
    // intento ya fue procesado (y rechazado) por el servidor.
    cliente.emit('map:join', id, 'p1');
    await new Promise((resolve) => {
      cliente.emit('map:join', 'otra-partida-inexistente', 'p1', 'x', resolve);
    });

    const socketsEnSala = await io.in(`map:${id}:p1`).fetchSockets();
    expect(socketsEnSala).toHaveLength(0);

    cliente.close();
  });
});
