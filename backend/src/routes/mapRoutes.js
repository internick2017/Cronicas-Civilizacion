import express from 'express';
import { ReglaError } from '../domain/mapa/errores.js';
import {
  EDIFICIOS, UNIDADES, COSTO_CIUDAD, MIN_JUGADORES,
  PRODUCCION_BASE_CIUDAD, BONO_TERRENO_PRODUCCION, BONO_TERRENO_DEFENSA,
  BONO_DEFENSA_CIUDAD, PORCENTAJE_VICTORIA_DOMINACION, RASGOS_CULTURALES,
  DIFICULTADES_IA, DIFICULTAD_IA_DEFAULT, TECNOLOGIAS, COSTO_MEJORA_CIUDAD
} from '../domain/mapa/constantes.js';

// Nombres en espanol para la interfaz. Viven aca y no en el dominio porque
// son presentacion, no regla de juego.
const NOMBRE_EDIFICIO = {
  granary: 'Granero', market: 'Mercado', library: 'Biblioteca',
  barracks: 'Cuartel', sawmill: 'Aserradero', quarry: 'Cantera', university: 'Universidad'
};
const NOMBRE_UNIDAD = {
  warrior: 'Guerrero', archer: 'Arquero', spearman: 'Lancero', cavalry: 'Caballería',
  catapult: 'Catapulta', legionary: 'Legionario'
};
const NOMBRE_TERRENO = {
  plains: 'Llanura', forest: 'Bosque', mountains: 'Montaña',
  hills: 'Colinas', desert: 'Desierto', water: 'Agua'
};
const DIFICULTAD_IA_INFO = {
  facil: { nombre: 'Fácil', descripcion: 'Ataca sin calcular y a veces se distrae; buena para aprender el juego.' },
  normal: { nombre: 'Normal', descripcion: 'Evita los combates que va a perder y construye con criterio.' },
  dificil: { nombre: 'Difícil', descripcion: 'Solo pelea cuando tiene ventaja clara y prioriza unidades fuertes.' },
};

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

  // GET /api/map/constantes - reglas publicas del juego. Sin token: no exponen
  // estado de ninguna partida, y el frontend las necesita para no ofrecer
  // acciones impagables. DEBE ir antes de las rutas con :id.
  router.get('/constantes', (_req, res) => {
    res.json({
      costoCiudad: COSTO_CIUDAD,
      minJugadores: MIN_JUGADORES,
      edificios: Object.entries(EDIFICIOS).map(([tipo, datos]) => ({
        tipo,
        nombre: NOMBRE_EDIFICIO[tipo] || tipo,
        costo: datos.costo,
        produccion: datos.produccion,
        requiereTecnologia: datos.requiereTecnologia ?? null
      })),
      unidades: Object.entries(UNIDADES).map(([tipo, datos]) => ({
        tipo,
        nombre: NOMBRE_UNIDAD[tipo] || tipo,
        ataque: datos.ataque,
        defensa: datos.defensa,
        salud: datos.salud,
        movimiento: datos.movimiento,
        costo: datos.costo,
        requiereBarracks: datos.requiereBarracks,
        requiereTecnologia: datos.requiereTecnologia ?? null
      })),
      // Tecnologias (que se pagan con ciencia) y el costo de subir el nivel de
      // una ciudad, que no es una tecnologia (es repetible, por ciudad): se
      // exponen por separado para que el frontend no los confunda.
      tecnologias: Object.entries(TECNOLOGIAS).map(([tipo, datos]) => ({
        tipo,
        nombre: datos.nombre,
        descripcion: datos.descripcion,
        costo: datos.costo,
        bonoAtaqueUnidades: datos.bonoAtaqueUnidades ?? 0,
        bonoDefensaUnidades: datos.bonoDefensaUnidades ?? 0,
        produccionPorcentual: datos.produccionPorcentual ?? {},
        desbloqueaUnidad: datos.desbloqueaUnidad ?? null,
        desbloqueaEdificio: datos.desbloqueaEdificio ?? null
      })),
      costoMejoraCiudadPorNivel: COSTO_MEJORA_CIUDAD(1),
      // Reglas de economia y combate, para que el panel de ayuda las explique
      // leyendolas de aca en vez de copiarlas (y quedar desactualizado al
      // primer cambio de balance).
      produccionBaseCiudad: PRODUCCION_BASE_CIUDAD,
      terrenos: Object.entries(BONO_TERRENO_PRODUCCION).map(([tipo, produccion]) => ({
        tipo,
        nombre: NOMBRE_TERRENO[tipo] || tipo,
        produccion,
        bonoDefensa: BONO_TERRENO_DEFENSA[tipo] ?? 1
      })),
      rasgosCulturales: Object.entries(RASGOS_CULTURALES).map(([tipo, datos]) => ({
        tipo,
        nombre: datos.nombre,
        descripcion: datos.descripcion,
        costo: { culture: datos.costo },
        produccionCiudad: datos.produccionCiudad ?? {},
        visionExtra: datos.visionExtra ?? 0,
        bonoDefensaCiudad: datos.bonoDefensaCiudad ?? 0
      })),
      dificultadesIA: DIFICULTADES_IA.map((tipo) => ({
        tipo,
        nombre: DIFICULTAD_IA_INFO[tipo]?.nombre || tipo,
        descripcion: DIFICULTAD_IA_INFO[tipo]?.descripcion || '',
        porDefecto: tipo === DIFICULTAD_IA_DEFAULT,
      })),
      bonoDefensaCiudad: BONO_DEFENSA_CIUDAD,
      porcentajeVictoriaDominacion: PORCENTAJE_VICTORIA_DOMINACION
    });
  });

  // POST /api/map - crear una partida nueva
  router.post('/', async (req, res) => {
    try {
      const { nombre, semilla, config, contraIA, dificultadIA } = req.body ?? {};
      const resultado = await servicio.crearPartida({
        nombre, semilla, config, contraIA: Boolean(contraIA), dificultadIA,
      });
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
