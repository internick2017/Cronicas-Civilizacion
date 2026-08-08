import express from 'express';
import { ReglaError } from '../domain/mapa/errores.js';

/**
 * Traduce un error del dominio/servicio a una respuesta HTTP.
 * - ReglaError con codigo PARTIDA_NO_ENCONTRADA -> 404 (id inexistente).
 * - Cualquier otra ReglaError -> 400 { codigo, mensaje }.
 * - Todo lo demas es un bug nuestro -> 500, sin filtrar detalles internos.
 */
function manejarError(err, res) {
  if (err instanceof ReglaError) {
    const status = err.codigo === 'PARTIDA_NO_ENCONTRADA' ? 404 : 400;
    return res.status(status).json({ codigo: err.codigo, mensaje: err.message });
  }
  return res.status(500).json({ codigo: 'ERROR_INTERNO', mensaje: 'Error interno del servidor' });
}

/**
 * Router factory: el service se inyecta para poder testear sobre un repo
 * sqlite en memoria sin levantar el server real.
 *
 * IMPORTANTE: cada ruta que devuelve estado de partida usa la vista filtrada
 * (vistaJugador) que ya produce MapGameService. Nunca se lee el repo/dominio
 * directamente para servir un estado de partida: eso sería reintroducir la
 * fuga de informacion (niebla, recursos ajenos, semilla) que el dominio
 * ya se encarga de evitar.
 *
 * Toda ruta que actua o lee como un jugador (accion, GET) exige el header
 * `X-Jugador-Token`, emitido una unica vez por `unirse`. Sin el, cualquiera
 * que supiera el jugadorId de otro (visible dentro de la partida via
 * vistaJugador) podria jugar en su nombre o leer su vista privada.
 */
export function crearMapRoutes(servicio) {
  const router = express.Router();

  // POST /api/map - crear una partida nueva
  router.post('/', async (req, res) => {
    try {
      const { nombre, semilla, config } = req.body ?? {};
      const resultado = await servicio.crearPartida({ nombre, semilla, config });
      res.status(201).json(resultado);
    } catch (err) {
      manejarError(err, res);
    }
  });

  // GET /api/map - listar partidas activas (solo metadata, no estado de juego)
  router.get('/', async (req, res) => {
    try {
      const partidas = await servicio.repo.listarActivas();
      res.status(200).json(partidas);
    } catch (err) {
      manejarError(err, res);
    }
  });

  // POST /api/map/:id/unirse
  router.post('/:id/unirse', async (req, res) => {
    try {
      const { id, nombre, civilizacion } = req.body ?? {};
      const resultado = await servicio.unirse(req.params.id, { id, nombre, civilizacion });
      res.status(200).json(resultado); // { vista, token }
    } catch (err) {
      manejarError(err, res);
    }
  });

  // POST /api/map/:id/iniciar
  router.post('/:id/iniciar', async (req, res) => {
    try {
      const vista = await servicio.iniciar(req.params.id);
      res.status(200).json(vista);
    } catch (err) {
      manejarError(err, res);
    }
  });

  // POST /api/map/:id/accion
  router.post('/:id/accion', async (req, res) => {
    try {
      const { jugadorId, ...accion } = req.body ?? {};
      const token = req.headers['x-jugador-token'];
      const resultado = await servicio.accion(req.params.id, jugadorId, accion, token);
      res.status(200).json(resultado);
    } catch (err) {
      manejarError(err, res);
    }
  });

  // GET /api/map/:id?jugadorId= - vista del jugador (NUNCA el mapa completo)
  router.get('/:id', async (req, res) => {
    try {
      const token = req.headers['x-jugador-token'];
      const vista = await servicio.vista(req.params.id, req.query.jugadorId, token);
      res.status(200).json(vista);
    } catch (err) {
      manejarError(err, res);
    }
  });

  return router;
}
