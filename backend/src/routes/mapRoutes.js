import express from 'express';
import { ReglaError } from '../domain/mapa/errores.js';
import { esSalaAbandonada } from '../domain/mapa/salas.js';
import { PRIORIDADES } from '../domain/mapa/reglas/subdivisiones.js';
import {
  TIPOS_SUBDIVISION, PROBLEMAS, RESOLUCION_POR_NIVEL, LIMITE_SENAL, LIMITE_PROBLEMA, GRAVEDAD_MAXIMA,
  EFECTOS_PROBLEMAS, ESCALA_GRAVEDAD, CAPACIDAD_CIUDADES_POR_NIVEL,
  BONO_PRODUCCION_CAPITAL, BONO_DEFENSA_CAPITAL, COSTO_MOVER_CAPITAL, RONDAS_SIN_PRODUCIR_MUDANZA,
  BONO_PRODUCCION_CABECERA, DESCUENTO_RESOLUCION_CABECERA,
  MONEDA_POR_DEFECTO, LARGO_MAXIMO_NOMBRE_MONEDA, LARGO_MAXIMO_SIMBOLO_MONEDA, ACUNACION,
} from '../domain/mapa/constantes.js';
import {
  GOBIERNOS, GRUPOS_DE_APOYO, ENFRIAMIENTO_VOTO, ESPERANZA_DE_VIDA_TURNOS, ORO_POR_PUNTO_APOYO,
  BONO_PRODUCCION_REPUBLICA, BONO_PRODUCCION_GOBIERNO, NIVEL_MAXIMO_ADMINISTRADO, RESPETO,
  UMBRAL_EXPULSION, UMBRAL_ELECCION, UMBRAL_REGRESO_MILITAR, UMBRAL_APROBACION,
  VARIACION_APOYO_POR_RONDA, BAJADA_APOYO_POR_RONDA, PISO_APOYO_POR_TERRITORIO,
  RECUPERACION_APOYO_SIN_PODER,
  EDIFICIOS, UNIDADES, COSTO_CIUDAD, MIN_JUGADORES,
  PRODUCCION_BASE_CIUDAD, BONO_TERRENO_PRODUCCION, BONO_TERRENO_DEFENSA,
  BONO_DEFENSA_CIUDAD, PORCENTAJE_VICTORIA_DOMINACION, UMBRAL_AVISO_DOMINACION, RASGOS_CULTURALES,
  DIFICULTADES_IA, DIFICULTAD_IA_DEFAULT, TECNOLOGIAS, COSTO_MEJORA_CIUDAD, CUARTEL, RAZAS
} from '../domain/mapa/constantes.js';

// Nombres en espanol para la interfaz. Viven aca y no en el dominio porque
// son presentacion, no regla de juego.
const NOMBRE_EDIFICIO = {
  granary: 'Granero', market: 'Mercado', library: 'Biblioteca',
  barracks: 'Cuartel', sawmill: 'Aserradero', quarry: 'Cantera', university: 'Universidad',
  port: 'Puerto'
};
const NOMBRE_UNIDAD = {
  warrior: 'Guerrero', archer: 'Arquero', spearman: 'Lancero', cavalry: 'Caballería',
  catapult: 'Catapulta', legionary: 'Legionario', warship: 'Buque de guerra',
  transport: 'Transporte'
};
// 'Mar' y no 'Agua': desde que el rio es un terreno propio, "agua" nombra a
// dos cosas con reglas opuestas (una detiene, la otra se vadea) y deja de
// servir como etiqueta. Ver CONTEXT.md.
const NOMBRE_TERRENO = {
  plains: 'Llanura', forest: 'Bosque', mountains: 'Montaña',
  hills: 'Colinas', desert: 'Desierto', water: 'Mar', river: 'Río'
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
        requiereTecnologia: datos.requiereTecnologia ?? null,
        // El puerto es el unico edificio con una condicion de geografia. La
        // vista lo necesita para poder decir "requiere costa" en vez de
        // ofrecer un boton que el backend va a rechazar.
        requiereCosta: datos.requiereCosta ?? false
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
        requiereTecnologia: datos.requiereTecnologia ?? null,
        // `naval` cambia como se juega la unidad, no solo como se recluta: la
        // vista lo usa para invertir el filtro de casillas alcanzables (un
        // buque solo entra al mar) y para no aplicarle el bono del cuartel.
        naval: datos.naval ?? false,
        requierePuerto: datos.requierePuerto ?? false,
        // Cuanta tropa lleva adentro. Cero para todo lo que no transporta; la
        // vista lo usa para ofrecer subir y bajar tropa.
        capacidad: datos.capacidad ?? 0
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
      // Efectos del cuartel (ver el comentario junto a EDIFICIOS.barracks en
      // el dominio): no son "produccion" de un recurso, por eso van aparte.
      cuartel: CUARTEL,
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
      // Razas jugables: el lobby las ofrece y el panel explica sus bonos leyendolos de aca.
      razas: Object.entries(RAZAS).map(([tipo, datos]) => ({
        tipo,
        nombre: datos.nombre,
        icono: datos.icono,
        descripcion: datos.descripcion,
        produccionPorcentual: datos.produccionPorcentual ?? {},
        bonoAtaqueUnidades: datos.bonoAtaqueUnidades ?? 0,
        bonoDefensaUnidades: datos.bonoDefensaUnidades ?? 0,
        visionExtra: datos.visionExtra ?? 0,
        bonoDefensaCiudad: datos.bonoDefensaCiudad ?? 0
      })),
      dificultadesIA: DIFICULTADES_IA.map((tipo) => ({
        tipo,
        nombre: DIFICULTAD_IA_INFO[tipo]?.nombre || tipo,
        descripcion: DIFICULTAD_IA_INFO[tipo]?.descripcion || '',
        porDefecto: tipo === DIFICULTAD_IA_DEFAULT,
      })),
      // Gobierno: el panel lista las opciones y explica quien aprueba cada
      // cambio leyendolo de aca, no copiandolo.
      gobiernos: Object.entries(GOBIERNOS).map(([tipo, datos]) => ({ tipo, ...datos })),
      gruposDeApoyo: GRUPOS_DE_APOYO,
      enfriamientoVoto: ENFRIAMIENTO_VOTO,
      esperanzaDeVidaTurnos: ESPERANZA_DE_VIDA_TURNOS,
      oroPorPuntoApoyo: ORO_POR_PUNTO_APOYO,
      prioridadesSubdivision: Object.keys(PRIORIDADES),
      problemasSociales: Object.entries(PROBLEMAS).map(([tipo, datos]) => ({ tipo, ...datos })),
      resolucionPorNivel: RESOLUCION_POR_NIVEL,
      capacidadCiudadesPorNivel: CAPACIDAD_CIUDADES_POR_NIVEL,
      efectosProblemas: EFECTOS_PROBLEMAS,
      limitesProblemas: { senal: LIMITE_SENAL, problema: LIMITE_PROBLEMA, gravedadMaxima: GRAVEDAD_MAXIMA, escalaGravedad: ESCALA_GRAVEDAD },
      // Del mas grande al mas chico: el panel los ofrece en ese orden.
      tiposSubdivision: Object.entries(TIPOS_SUBDIVISION)
        .map(([tipo, datos]) => ({ tipo, ...datos }))
        .sort((a, b) => a.nivel - b.nivel),
      // Numeros del manual de instrucciones (MapAyuda): el texto los lee de aca.
      bonoProduccionRepublica: BONO_PRODUCCION_REPUBLICA,
      bonosProduccionGobierno: BONO_PRODUCCION_GOBIERNO,
      respetoGobierno: RESPETO,
      nivelMaximoAdministrado: NIVEL_MAXIMO_ADMINISTRADO,
      umbralesGobierno: {
        expulsion: UMBRAL_EXPULSION, eleccion: UMBRAL_ELECCION,
        regresoMilitar: UMBRAL_REGRESO_MILITAR, aprobacion: UMBRAL_APROBACION,
      },
      variacionApoyo: {
        sube: VARIACION_APOYO_POR_RONDA, baja: BAJADA_APOYO_POR_RONDA,
        piso: PISO_APOYO_POR_TERRITORIO, recuperacion: RECUPERACION_APOYO_SIN_PODER,
      },
      bonoDefensaCiudad: BONO_DEFENSA_CIUDAD,
      porcentajeVictoriaDominacion: PORCENTAJE_VICTORIA_DOMINACION,
      umbralAvisoDominacion: UMBRAL_AVISO_DOMINACION,
      capital: {
        bonoProduccion: BONO_PRODUCCION_CAPITAL, bonoDefensa: BONO_DEFENSA_CAPITAL,
        costoMover: COSTO_MOVER_CAPITAL, rondasSinProducir: RONDAS_SIN_PRODUCIR_MUDANZA,
      },
      cabecera: { bonoProduccion: BONO_PRODUCCION_CABECERA, descuentoResolucion: DESCUENTO_RESOLUCION_CABECERA },
      moneda: {
        porDefecto: MONEDA_POR_DEFECTO, largoNombre: LARGO_MAXIMO_NOMBRE_MONEDA, largoSimbolo: LARGO_MAXIMO_SIMBOLO_MONEDA,
      },
      acunacion: ACUNACION,
    });
  });

  // POST /api/map - crear una partida nueva
  router.post('/', async (req, res) => {
    try {
      const { nombre, semilla, config, contraIA, dificultadIA, bots } = req.body ?? {};
      const resultado = await servicio.crearPartida({
        nombre, semilla, config, contraIA: Boolean(contraIA), dificultadIA, bots,
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
      res.status(200).json(partidas.filter(p => !esSalaAbandonada(p)));
    } catch (err) {
      manejarError(err, res);
    }
  });

  // POST /api/map/:id/unirse
  router.post('/:id/unirse', async (req, res) => {
    try {
      const { id, nombre, civilizacion, raza } = req.body ?? {};
      const resultado = await servicio.unirse(req.params.id, { id, nombre, civilizacion, raza });
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
