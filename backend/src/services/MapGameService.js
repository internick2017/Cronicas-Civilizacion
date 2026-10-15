import crypto from 'crypto';
import { crearEstado } from '../domain/mapa/MapGame.js';
import { aplicar } from '../domain/mapa/aplicar.js';
import { crearRng } from '../domain/mapa/rng.js';
import { ReglaError } from '../domain/mapa/errores.js';
import { unirse as unirseRegla, iniciar as iniciarRegla, sumarMaquina } from '../domain/mapa/reglas/partida.js';
import { proponerGobierno, cambiarFormaEstado, darVentajas, estaEnPoder } from '../domain/mapa/reglas/gobierno.js';
import {
  crearSubdivision, quitarSubdivision, renombrarSubdivision, asignarCiudades, desasignarCiudades, elegirCabecera,
} from '../domain/mapa/reglas/subdivisiones.js';
import { fundarCiudad, construir, mejorarCiudad, renombrarCiudad } from '../domain/mapa/reglas/ciudades.js';
import { reclutar } from '../domain/mapa/reglas/militar.js';
import { adoptarRasgo } from '../domain/mapa/reglas/cultura.js';
import { investigar } from '../domain/mapa/reglas/tecnologia.js';
import { abandonar } from '../domain/mapa/reglas/abandono.js';
import { proponerAlianza, responderAlianza, romperAlianza, regalarRecursos } from '../domain/mapa/reglas/alianzas.js';
import { renombrarPais } from '../domain/mapa/reglas/pais.js';
import { moverCapital } from '../domain/mapa/reglas/capital.js';
import { jugarTurnoIA } from '../domain/mapa/ia.js';
import { DIFICULTADES_IA, DIFICULTAD_IA_DEFAULT, RAZAS } from '../domain/mapa/constantes.js';
import { moverEjercito } from '../domain/mapa/reglas/movimiento.js';
import { embarcar, desembarcar } from '../domain/mapa/reglas/transporte.js';
import { atacar } from '../domain/mapa/reglas/combate.js';
import { terminarTurno, terminarSinHumanos } from '../domain/mapa/reglas/turnos.js';
import { vistaJugador } from '../domain/mapa/reglas/visibilidad.js';
import { esSimultaneo, listosDe } from '../domain/mapa/reglas/comun.js';
import logger from '../utils/logger.js';

// Sin caracteres ambiguos necesarios: codigo corto, solo mayusculas y digitos.
const ALFABETO_CODIGO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

// Ids fijos por posicion: los bots se agregan una sola vez (al unirse el primer
// humano) y nunca chocan con un id de jugador humano (esos los genera el
// frontend con crypto.randomUUID()/un fallback propio). El primero conserva el
// id y el nombre de cuando solo podia haber uno.
const ID_BOT = 'bot-ia';
const NOMBRE_BOT = 'La Máquina';
const idBot = (i) => (i === 0 ? ID_BOT : `${ID_BOT}-${i + 1}`);
const nombreBot = (i) => (i === 0 ? NOMBRE_BOT : `${NOMBRE_BOT} ${i + 1}`);
// Una civilizacion por bot, sin repetir: tiene que haber al menos BOTS_MAXIMOS.
const CIVILIZACIONES_BOT = ['Autómatas', 'El Enjambre', 'La Colmena', 'Los Engranajes', 'Los Relojeros', 'La Forja'];
const BOTS_MAXIMOS = CIVILIZACIONES_BOT.length;
const JUGADORES_MAXIMOS = 8; // el tope de config.maxJugadores (ver MapGame.js)
const LUGARES_PARA_PERSONAS = 4; // el maxJugadores por defecto (ver MapGame.js)

// Cuantos bots lleva la partida. "Contra la maquina" siempre tiene al menos uno;
// cualquier valor raro que llegue por HTTP cae al default en vez de romper.
function cantidadDeBots(bots, contraIA) {
  const minimo = contraIA ? 1 : 0;
  if (!Number.isInteger(bots)) return minimo;
  return Math.min(BOTS_MAXIMOS, Math.max(minimo, bots));
}

function mezclar(lista) {
  const copia = [...lista];
  for (let i = copia.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}

const quedanHumanos = (estado) => estado.jugadores.some(j => j.activo && !j.esBot);

// Tope de rondas de IA resueltas EN CADENA dentro de una misma llamada (p.ej.
// un humano abandona y deja solo bots, o hay varios bots seguidos en el orden
// de turno). Muy por encima de lo que 1 bot + humanos necesita en la
// practica: es un backstop contra un bug que deje el turno sin avanzar nunca
// hacia un jugador NO bot, que colgaria el request para siempre.
const VUELTAS_IA_MAXIMAS = 10;

// Quien perdio el poder (ver reglas/gobierno.js) solo puede dar ventajas para
// recuperar apoyo, pasar el turno o abandonar: el resto de las acciones del
// mapa las juega por el la maquina. Renombrar el pais no es una orden.
const ACCIONES_SIN_PODER = new Set(['darVentajas', 'terminarTurno', 'abandonar', 'renombrarPais']);

// El apoyo y la administracion de subdivisiones de un jugador son privados,
// igual que sus recursos (ver visibilidad.js): un humano no los recibe dentro de
// la lista de eventos de la accion de otro. La capital nueva tampoco: sus
// coordenadas revelarian una ciudad que el rival quizas no descubrio.
const EVENTOS_PRIVADOS_DE_GOBIERNO = new Set(['ApoyoActualizado', 'SubdivisionCreada', 'SubdivisionQuitada', 'SubdivisionRenombrada', 'CiudadesAsignadas', 'CiudadesDesasignadas', 'CabeceraElegida',
  'MedidoresActualizados', 'ProblemaSurgido', 'ProblemaAgravado', 'ProblemaResuelto', 'ProblemasDescartados', 'PoblacionAjustada',
  'CapitalMovida']);
const eventosVisiblesPara = (eventos, jugadorId) =>
  eventos.filter(e => !EVENTOS_PRIVADOS_DE_GOBIERNO.has(e.tipo) || e.jugadorId === jugadorId);

function generarCodigo() {
  let codigo = '';
  for (let i = 0; i < 6; i++) codigo += ALFABETO_CODIGO[crypto.randomInt(ALFABETO_CODIGO.length)];
  return codigo;
}

const REGLAS_POR_TIPO = {
  fundarCiudad: (estado, jugadorId, accion) => fundarCiudad(estado, jugadorId, accion),
  construir: (estado, jugadorId, accion) => construir(estado, jugadorId, accion),
  reclutar: (estado, jugadorId, accion) => reclutar(estado, jugadorId, accion),
  moverEjercito: (estado, jugadorId, accion) => moverEjercito(estado, jugadorId, accion),
  embarcar: (estado, jugadorId, accion) => embarcar(estado, jugadorId, accion),
  desembarcar: (estado, jugadorId, accion) => desembarcar(estado, jugadorId, accion),
  adoptarRasgo: (estado, jugadorId, accion) => adoptarRasgo(estado, jugadorId, accion),
  investigar: (estado, jugadorId, accion) => investigar(estado, jugadorId, accion),
  mejorarCiudad: (estado, jugadorId, accion) => mejorarCiudad(estado, jugadorId, accion),
  renombrarCiudad: (estado, jugadorId, accion) => renombrarCiudad(estado, jugadorId, accion),
  moverCapital: (estado, jugadorId, accion) => moverCapital(estado, jugadorId, accion),
  proponerGobierno: (estado, jugadorId, accion) => proponerGobierno(estado, jugadorId, accion),
  cambiarFormaEstado: (estado, jugadorId, accion) => cambiarFormaEstado(estado, jugadorId, accion),
  darVentajas: (estado, jugadorId, accion) => darVentajas(estado, jugadorId, accion),
  crearSubdivision: (estado, jugadorId, accion) => crearSubdivision(estado, jugadorId, accion),
  quitarSubdivision: (estado, jugadorId, accion) => quitarSubdivision(estado, jugadorId, accion),
  renombrarSubdivision: (estado, jugadorId, accion) => renombrarSubdivision(estado, jugadorId, accion),
  asignarCiudades: (estado, jugadorId, accion) => asignarCiudades(estado, jugadorId, accion),
  desasignarCiudades: (estado, jugadorId, accion) => desasignarCiudades(estado, jugadorId, accion),
  elegirCabecera: (estado, jugadorId, accion) => elegirCabecera(estado, jugadorId, accion),
  proponerAlianza: (estado, jugadorId, accion) => proponerAlianza(estado, jugadorId, accion),
  responderAlianza: (estado, jugadorId, accion) => responderAlianza(estado, jugadorId, accion),
  romperAlianza: (estado, jugadorId) => romperAlianza(estado, jugadorId),
  regalarRecursos: (estado, jugadorId, accion) => regalarRecursos(estado, jugadorId, accion),
  renombrarPais: (estado, jugadorId, accion) => renombrarPais(estado, jugadorId, accion),
  abandonar: (estado, jugadorId) => abandonar(estado, jugadorId),
  terminarTurno: (estado, jugadorId) => terminarTurno(estado, jugadorId),
};

/**
 * Orquesta el dominio puro de mapa (Tasks 4-12) con la persistencia (Task 13),
 * la narracion de IA y los sockets. El dominio no conoce nada de esto: la
 * dependencia siempre va servicio -> dominio, nunca al reves.
 *
 * La DB es la fuente de verdad; el Map en memoria es solo un cache. Una
 * instancia nueva del servicio, apuntando a la misma DB, ve exactamente la
 * misma partida (la partida sobrevive a un reinicio del backend).
 */
export class MapGameService {
  constructor({ repo, narrador = null, emitir = null }) {
    this.repo = repo;
    this.narrador = narrador;
    this.emitir = emitir;
    this.cache = new Map(); // id -> estado (solo aceleracion; la DB manda)
    this.candados = new Map(); // id -> Promise (cola de operaciones mutantes)
  }

  /**
   * Serializa las operaciones MUTANTES por partida. `_resolver` + clonar +
   * `_persistir` es un read-modify-write: sin esto, dos requests concurrentes
   * sobre la misma partida leen el mismo estado base y la segunda escritura
   * pisa a la primera (dos jugadores tocando "Unirse" a la vez = uno
   * desaparece). Una cadena de promesas en memoria alcanza porque el server
   * es un solo proceso.
   *
   * La cadena guardada es siempre una promesa YA neutralizada (catch a noop),
   * asi un rechazo no envenena las operaciones siguientes de esa partida.
   */
  _conCandado(id, fn) {
    const previo = this.candados.get(id) ?? Promise.resolve();
    const resultado = previo.then(fn, fn); // corre igual si la anterior fallo
    const cola = resultado.then(() => {}, () => {});
    this.candados.set(id, cola);
    // Evita que el Map crezca sin limite: si nadie encolo despues, se limpia.
    cola.then(() => {
      if (this.candados.get(id) === cola) this.candados.delete(id);
    });
    return resultado;
  }

  /**
   * El candado tiene que ser por PARTIDA, no por la clave que uso el cliente:
   * `unirse` acepta id o codigo, y dos claves distintas de la misma partida
   * deben compartir la misma cola.
   */
  async _idCanonico(idOCodigo) {
    const estado = await this._resolver(idOCodigo);
    return estado ? estado.id : idOCodigo;
  }

  /**
   * Verifica el token de sesion de un jugador antes de dejarlo leer su vista
   * o actuar en su nombre. El secreto vive fuera del dominio (tabla
   * `map_game_tokens`, gestionada por MapGameRepo) precisamente para que
   * vistaJugador() no tenga forma de filtrarlo por accidente: nunca esta en
   * lo que esa funcion recorre.
   */
  async verificarToken(gameId, jugadorId, token) {
    const valido = await this.repo.verificarToken(gameId, jugadorId, token);
    if (!valido) throw new ReglaError('TOKEN_INVALIDO', 'Token invalido o ausente');
  }

  async _generarCodigoUnico() {
    for (let intento = 0; intento < 50; intento++) {
      const codigo = generarCodigo();
      const existente = await this.repo.cargarPorCodigo(codigo);
      if (!existente) return codigo;
    }
    throw new Error('No se pudo generar un codigo de partida unico');
  }

  async _resolver(idOCodigo) {
    if (this.cache.has(idOCodigo)) return this.cache.get(idOCodigo);
    let estado = await this.repo.cargar(idOCodigo);
    if (!estado) estado = await this.repo.cargarPorCodigo(idOCodigo);
    if (estado) this.cache.set(estado.id, estado);
    return estado;
  }

  /**
   * Persiste `estado` (y opcionalmente sus eventos) y SOLO si ambas escrituras
   * tienen exito actualiza el cache. Si `repo.guardar` o `repo.agregarEventos`
   * tiran, el cache queda intacto (todavia con la version vieja, igual que la
   * DB) en vez de quedar "adelantado" respecto de una escritura que fallo.
   */
  async _persistir(estado, eventos = null) {
    await this.repo.guardar(estado, estado.codigo);
    if (eventos) await this.repo.agregarEventos(estado.id, eventos);
    this.cache.set(estado.id, estado);
  }

  async crearPartida({ nombre, semilla, config, contraIA, dificultadIA, bots }) {
    const codigo = await this._generarCodigoUnico();
    // dificultadIA se valida ACA (contra la lista blanca) y no en el dominio:
    // es una preferencia de configuracion, no una regla de juego, y asi
    // cualquier valor raro que llegue por HTTP nunca pisa el default.
    const dificultad = DIFICULTADES_IA.includes(dificultadIA) ? dificultadIA : DIFICULTAD_IA_DEFAULT;
    const cantidadBots = cantidadDeBots(bots, contraIA);
    const cfg = { ...(config ?? {}) };
    if (contraIA) {
      // maxJugadores se fuerza a creador + bots: una partida "contra la
      // maquina" es de UN humano, no una invitacion a que se sume gente.
      Object.assign(cfg, { contraIA: true, dificultadIA: dificultad, cantidadBots, maxJugadores: 1 + cantidadBots });
    } else if (cantidadBots > 0) {
      // Humanos Y bots: los bots no le pueden sacar el lugar a la gente, asi que
      // se suman ARRIBA de los lugares para personas (hasta el tope de la mesa).
      const lugares = (cfg.maxJugadores ?? LUGARES_PARA_PERSONAS) + cantidadBots;
      Object.assign(cfg, { dificultadIA: dificultad, cantidadBots, maxJugadores: Math.min(JUGADORES_MAXIMOS, lugares) });
    }
    const estado = crearEstado({ nombre, semilla: semilla ?? codigo, config: cfg });
    estado.codigo = codigo;
    // El bot NO se agrega aca: si se agregara antes de que exista un humano,
    // cualquiera que vea el codigo en el lobby publico podria unirse primero
    // y quedarse con el lugar que le corresponde al creador. Se agrega recien
    // en `_unirse`, en la MISMA operacion que el primer humano se une.
    await this._persistir(estado);
    return { id: estado.id, codigo, contraIA: Boolean(contraIA) };
  }

  /**
   * Resuelve, EN CADENA, los turnos de todos los bots que le toquen jugar a
   * partir del estado actual (muta `estado`, aplicando cada evento igual que
   * una accion humana). Se llama despues de cualquier operacion que pueda
   * dejar el turno en manos de un bot: iniciar la partida, o cualquier accion
   * humana que cierre su turno (incluido abandonar).
   *
   * Sin esto la partida se trabaria esperando una accion HTTP que nunca va a
   * llegar, porque nadie controla al bot desde afuera.
   */
  _resolverTurnosIA(estado) {
    const eventos = esSimultaneo(estado)
      ? this._resolverRondaSimultaneaIA(estado)
      : this._resolverTurnosSecuencialesIA(estado);
    // Con varios bots puede no quedar ningun humano (abandonaron o los
    // conquistaron) y seguir habiendo partida: nadie la mira ni la mueve, asi
    // que se termina aca en vez de quedar "jugando" para siempre.
    const cierre = terminarSinHumanos(estado);
    aplicar(estado, cierre);
    eventos.push(...cierre);
    return eventos;
  }

  _resolverTurnosSecuencialesIA(estado) {
    const eventos = [];
    for (let vuelta = 0; vuelta < VUELTAS_IA_MAXIMAS; vuelta++) {
      if (estado.estado !== 'jugando' || !quedanHumanos(estado)) break;
      const actual = estado.jugadores[estado.indiceJugadorActual];
      // La maquina juega por el bot Y por el humano que perdio el poder.
      if (!actual || !(actual.esBot || !estaEnPoder(actual))) break;

      // Semilla determinista: misma partida + mismo turno + misma vuelta =
      // mismas decisiones, igual que el resto del dominio (combate, mapa).
      const rng = crearRng(`ia:${estado.semilla}:${estado.turno}:${actual.id}:${vuelta}`);
      eventos.push(...jugarTurnoIA(estado, actual.id, rng));
    }
    return eventos;
  }

  /**
   * Turno simultaneo: los bots juegan recien cuando TODOS los humanos
   * terminaron la ronda (el ultimo bot en terminar la cierra, por la misma
   * regla que un humano). Mientras falte un humano no se toca nada.
   */
  _resolverRondaSimultaneaIA(estado) {
    const eventos = [];
    for (let vuelta = 0; vuelta < VUELTAS_IA_MAXIMAS; vuelta++) {
      if (estado.estado !== 'jugando' || !quedanHumanos(estado)) break;
      const pendientes = estado.jugadores.filter(j => j.activo && !listosDe(estado).includes(j.id));
      if (pendientes.length === 0 || pendientes.some(j => !j.esBot)) break;
      for (const bot of pendientes) {
        if (estado.estado !== 'jugando') break;
        eventos.push(...this._jugarPorLaMaquina(estado, bot.id, vuelta));
      }
    }
    return eventos;
  }

  /**
   * Identidad de una maquina que entra con la partida empezada: el primer id
   * libre y una civilizacion que nadie este usando.
   */
  _datosDeNuevaMaquina(estado, dificultadIA) {
    const cantidad = estado.jugadores.filter(j => j.esBot).length;
    if (cantidad >= BOTS_MAXIMOS || estado.jugadores.length >= JUGADORES_MAXIMOS) {
      throw new ReglaError('PARTIDA_LLENA', 'No entran más máquinas en esta partida');
    }
    const usados = new Set(estado.jugadores.map(j => j.id));
    let indice = 0;
    while (usados.has(idBot(indice))) indice++;
    const enUso = new Set(estado.jugadores.map(j => j.civilizacion));
    const civilizacion = mezclar(CIVILIZACIONES_BOT).find(c => !enUso.has(c)) ?? `${NOMBRE_BOT} ${indice + 1}`;
    const razas = Object.keys(RAZAS);
    return {
      id: idBot(indice), nombre: nombreBot(indice), civilizacion,
      raza: razas[crypto.randomInt(razas.length)],
      dificultadIA: DIFICULTADES_IA.includes(dificultadIA)
        ? dificultadIA
        : (estado.config.dificultadIA ?? DIFICULTAD_IA_DEFAULT),
    };
  }

  _jugarPorLaMaquina(estado, jugadorId, vuelta = 0) {
    const rng = crearRng(`ia:${estado.semilla}:${estado.turno}:${jugadorId}:${vuelta}`);
    return jugarTurnoIA(estado, jugadorId, rng);
  }

  async unirse(idOCodigo, jugador) {
    return this._conCandado(await this._idCanonico(idOCodigo), () => this._unirse(idOCodigo, jugador));
  }

  async _unirse(idOCodigo, { id, nombre, civilizacion, raza }) {
    const original = await this._resolver(idOCodigo);
    if (!original) throw new ReglaError('PARTIDA_NO_ENCONTRADA', 'Partida no encontrada');

    // Se muta un CLON, nunca el objeto que vive en el cache: si la persistencia
    // falla mas abajo, el cache no debe quedar con un estado que la DB no tiene.
    const estado = structuredClone(original);
    const eventos = unirseRegla(estado, { id, nombre, civilizacion, raza });
    aplicar(estado, eventos);

    // El bot se suma en la MISMA operacion que el primer humano se une (ver
    // el comentario en crearPartida): asi es atomico bajo el candado de esta
    // partida y no hay ventana donde un tercero pueda robarle el lugar.
    // Una partida guardada antes de que hubiera varios bots no trae cantidadBots.
    const cantidadBots = estado.config.cantidadBots ?? (estado.config.contraIA ? 1 : 0);
    if (cantidadBots > 0 && estado.jugadores.length === 1) {
      const civilizaciones = mezclar(CIVILIZACIONES_BOT);
      const razasDisponibles = Object.keys(RAZAS);
      for (let i = 0; i < cantidadBots; i++) {
        // Cada bot recibe una raza al azar, como su civilizacion: sin ella
        // jugaria sin bonos contra un humano que si los tiene.
        const razaBot = razasDisponibles[crypto.randomInt(razasDisponibles.length)];
        const eventosBot = unirseRegla(estado, {
          id: idBot(i), nombre: nombreBot(i), civilizacion: civilizaciones[i], raza: razaBot, esBot: true,
          dificultadIA: estado.config.dificultadIA ?? DIFICULTAD_IA_DEFAULT,
        });
        aplicar(estado, eventosBot);
        eventos.push(...eventosBot);
      }
    }

    await this._persistir(estado, eventos);

    const token = crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    await this.repo.guardarToken(estado.id, id, hash);

    return { vista: vistaJugador(estado, id), token };
  }

  async iniciar(id) {
    return this._conCandado(await this._idCanonico(id), () => this._iniciar(id));
  }

  async _iniciar(id) {
    const original = await this._resolver(id);
    if (!original) throw new ReglaError('PARTIDA_NO_ENCONTRADA', 'Partida no encontrada');

    const estado = structuredClone(original);
    const eventos = iniciarRegla(estado);
    aplicar(estado, eventos);
    // Si el primer jugador en el orden de turno es el bot (partidas "contra
    // la maquina": se agrega al crear, antes que el humano), su apertura se
    // resuelve aca mismo: para cuando el humano pide el estado, ya es su
    // turno. No se narra aca (igual que el resto de _iniciar): se narra
    // junto con el resto de la ronda 1 cuando esta cierra en _accion.
    eventos.push(...this._resolverTurnosIA(estado));
    await this._persistir(estado, eventos);

    // OJO: nunca devolver vistaJugador(estado, X) aca. Este endpoint no exige
    // token (arrancar la partida es una accion de "sala de espera", no de un
    // jugador puntual) y devolver la vista privada de un jugador (aunque sea
    // solo la del jugador de turno) filtraria mapa descubierto y recursos
    // ajenos a quien sea que llame a /iniciar, sin credenciales. El frontend
    // vuelve a pedir el estado via GET /:id (con token) despues de iniciar,
    // asi que alcanza con una confirmacion minima sin datos de juego.
    return { iniciada: true, turno: estado.turno };
  }

  async accion(id, jugadorId, accion, token) {
    const estado = await this._resolver(id);
    if (!estado) throw new ReglaError('PARTIDA_NO_ENCONTRADA', 'Partida no encontrada');
    await this.verificarToken(estado.id, jugadorId, token);
    return this._conCandado(estado.id, () => this._accion(id, jugadorId, accion));
  }

  async _accion(id, jugadorId, accion) {
    const original = await this._resolver(id);
    if (!original) throw new ReglaError('PARTIDA_NO_ENCONTRADA', 'Partida no encontrada');

    const estado = structuredClone(original);

    // Antes de cualquier regla, incluido atacar: quien perdio el poder no manda.
    const actor = estado.jugadores.find(j => j.id === jugadorId);
    if (actor && !estaEnPoder(actor) && !ACCIONES_SIN_PODER.has(accion.tipo)) {
      throw new ReglaError('SIN_PODER', 'Perdiste el poder: no podés dar órdenes hasta recuperarlo');
    }

    let eventos;
    if (actor && !estaEnPoder(actor) && accion.tipo === 'terminarTurno') {
      // "Terminar turno" de quien no manda es PASAR: no se ejecuta la regla (no
      // le toca decidir) y la maquina juega su turno y los siguientes, abajo.
      // Sin esto, el tope de vueltas de _resolverTurnosIA podia dejar el turno
      // parado en un bot o en el propio jugador sin forma de seguir.
      eventos = [];
    } else if (accion.tipo === 'sumarMaquina') {
      eventos = sumarMaquina(estado, this._datosDeNuevaMaquina(estado, accion.dificultadIA));
    } else if (accion.tipo === 'atacar') {
      // Contar, no traer: esta semilla solo necesita CUANTOS eventos hubo, y
      // leer el log completo en cada ataque escala con la duracion de la
      // partida (ver MapGameRepo#contarEventos).
      const eventosPrevios = await this.repo.contarEventos(estado.id);
      const rng = crearRng(`combate:${estado.semilla}:${estado.turno}:${eventosPrevios}`);
      eventos = atacar(estado, jugadorId, accion, rng);
    } else {
      const regla = REGLAS_POR_TIPO[accion.tipo];
      if (!regla) throw new ReglaError('ACCION_DESCONOCIDA', `Accion desconocida: ${accion.tipo}`);
      eventos = regla(estado, jugadorId, accion);
    }

    // Si la regla tiro ReglaError, nunca llegamos aca: nada se aplico ni se persistio,
    // y el clon descartado no dejo rastro (el cache sigue apuntando al `original`).
    aplicar(estado, eventos);
    // Turno simultaneo: no hay "cuando le toque" para quien perdio el poder, asi
    // que su pasar es jugar AHORA: la maquina hace su turno y lo deja listo.
    if (actor && !estaEnPoder(actor) && accion.tipo === 'terminarTurno' && esSimultaneo(estado)) {
      if (listosDe(estado).includes(jugadorId)) {
        throw new ReglaError('YA_TERMINASTE', 'Ya terminaste tu turno: esperá a que terminen los demás');
      }
      eventos.push(...this._jugarPorLaMaquina(estado, jugadorId));
    }
    // Si esta accion humana deja el turno en manos de un bot (terminarTurno,
    // o abandonar si le tocaba a el), se resuelve aca mismo, ANTES de
    // persistir: asi el propio jugador que actuo ya ve, en la respuesta de
    // esta misma llamada, que volvio a ser su turno (o el resultado de la
    // partida si el bot gano/perdio en el camino).
    eventos.push(...this._resolverTurnosIA(estado));
    await this._persistir(estado, eventos);

    // UNA narracion por cada ronda cerrada en esta llamada: ahora una sola
    // peticion puede cerrar varias (la maquina juega por quien perdio el poder).
    const rondasCerradas = this.narrador
      ? eventos.filter(e => e.tipo === 'RondaCompletada').map(e => e.turno)
      : [];
    for (const turnoRonda of rondasCerradas) {
      // Se narra la RONDA completa, no solo la ultima accion: esta ultima siempre
      // es terminarTurno (eventos de contabilidad, que el narrador no narra), y
      // todo lo interesante (fundaciones, construcciones, combates) ocurrio en
      // acciones anteriores de la misma ronda. Esa lectura a la DB queda DENTRO
      // de esta cadena protegida por el .catch de abajo: si falla, se cae al
      // mismo lugar que un fallo de narracion y nunca rompe la partida.
      Promise.resolve(this.repo.eventosDeRonda(estado.id, turnoRonda))
        // El texto de la crónica lo ven TODOS los jugadores: los eventos privados no entran.
        .then(eventosRonda => this.narrador(eventosRonda.filter(e => !EVENTOS_PRIVADOS_DE_GOBIERNO.has(e.tipo)), estado.jugadores))
        .then(async (narrativa) => {
          if (!narrativa) return;
          await this.repo.guardarNarrativa(estado.id, turnoRonda, narrativa);
          // La narracion tarda (puede pegarle a la IA), asi que llega despues
          // de la emision del estado. Se avisa por su propio evento para que
          // el jugador la vea en esta ronda y no en la siguiente.
          if (this.emitir) {
            for (const jugador of estado.jugadores) {
              this.emitir(id, jugador.id, 'narrativa', { ronda: turnoRonda, texto: narrativa });
            }
          }
        })
        .catch((error) => {
          // Se loguea antes de tragar el error: la narracion nunca puede
          // romper la partida, pero un fallo silencioso es invisible en
          // produccion. El invariante (nunca romper) se mantiene: seguimos
          // devolviendo null / sin propagar la excepcion.
          logger.error('Fallo al narrar/guardar la narrativa de la ronda de mapa:', error);
          return null;
        });
    }

    // Una emision POR JUGADOR, con SOLO su vista. Antes se mandaba un unico
    // payload { p1: vista1, p2: vista2 } a la sala de la partida: cualquier
    // socket de la sala recibia la niebla, ciudades y recursos de todos los
    // demas, reintroduciendo por socket la fuga que el dominio ya evitaba.
    // Invariante: un socket del jugador X nunca recibe la vista de Y.
    // Se adjuntan las narrativas tambien aca para que la vista emitida por
    // socket sea consistente con la que devuelve `vista()` (misma forma).
    // UNA sola lectura de narrativas por accion, reutilizada para TODOS los
    // jugadores (loop de abajo) y para el `return` de mas abajo: no se hace
    // una lectura extra por jugador emitido (N jugadores => 1 lectura, no N).
    const narrativas = await this.repo.narrativasDe(estado.id);
    if (this.emitir) {
      for (const jugador of estado.jugadores) {
        this.emitir(id, jugador.id, 'estado', { ...vistaJugador(estado, jugador.id), narrativas });
      }
    }

    return { vista: { ...vistaJugador(estado, jugadorId), narrativas }, eventos: eventosVisiblesPara(eventos, jugadorId) };
  }

  async vista(id, jugadorId, token) {
    const estado = await this._resolver(id);
    if (!estado) throw new ReglaError('PARTIDA_NO_ENCONTRADA', 'Partida no encontrada');
    await this.verificarToken(estado.id, jugadorId, token);
    // Las narrativas se adjuntan aca y no en `vistaJugador`: esa funcion es
    // dominio puro y no tiene acceso al repo.
    const narrativas = await this.repo.narrativasDe(estado.id);
    return { ...vistaJugador(estado, jugadorId), narrativas };
  }
}
