import crypto from 'crypto';
import { crearEstado } from '../domain/mapa/MapGame.js';
import { aplicar } from '../domain/mapa/aplicar.js';
import { crearRng } from '../domain/mapa/rng.js';
import { ReglaError } from '../domain/mapa/errores.js';
import { unirse as unirseRegla, iniciar as iniciarRegla } from '../domain/mapa/reglas/partida.js';
import { fundarCiudad, construir } from '../domain/mapa/reglas/ciudades.js';
import { reclutar } from '../domain/mapa/reglas/militar.js';
import { adoptarRasgo } from '../domain/mapa/reglas/cultura.js';
import { abandonar } from '../domain/mapa/reglas/abandono.js';
import { moverEjercito } from '../domain/mapa/reglas/movimiento.js';
import { atacar } from '../domain/mapa/reglas/combate.js';
import { terminarTurno } from '../domain/mapa/reglas/turnos.js';
import { vistaJugador } from '../domain/mapa/reglas/visibilidad.js';
import logger from '../utils/logger.js';

// Sin caracteres ambiguos necesarios: codigo corto, solo mayusculas y digitos.
const ALFABETO_CODIGO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

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
  adoptarRasgo: (estado, jugadorId, accion) => adoptarRasgo(estado, jugadorId, accion),
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

  async crearPartida({ nombre, semilla, config }) {
    const codigo = await this._generarCodigoUnico();
    const estado = crearEstado({ nombre, semilla: semilla ?? codigo, config });
    estado.codigo = codigo;
    await this._persistir(estado);
    return { id: estado.id, codigo };
  }

  async unirse(idOCodigo, jugador) {
    return this._conCandado(await this._idCanonico(idOCodigo), () => this._unirse(idOCodigo, jugador));
  }

  async _unirse(idOCodigo, { id, nombre, civilizacion }) {
    const original = await this._resolver(idOCodigo);
    if (!original) throw new ReglaError('PARTIDA_NO_ENCONTRADA', 'Partida no encontrada');

    // Se muta un CLON, nunca el objeto que vive en el cache: si la persistencia
    // falla mas abajo, el cache no debe quedar con un estado que la DB no tiene.
    const estado = structuredClone(original);
    const eventos = unirseRegla(estado, { id, nombre, civilizacion });
    aplicar(estado, eventos);
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

    let eventos;
    if (accion.tipo === 'atacar') {
      const eventosPrevios = (await this.repo.eventosDe(estado.id)).length;
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
    await this._persistir(estado, eventos);

    const cerroRonda = eventos.some(e => e.tipo === 'RondaCompletada');
    if (cerroRonda && this.narrador) {
      const turnoRonda = eventos.find(e => e.tipo === 'RondaCompletada').turno;
      // Se narra la RONDA completa, no solo la ultima accion: esta ultima siempre
      // es terminarTurno (eventos de contabilidad, que el narrador no narra), y
      // todo lo interesante (fundaciones, construcciones, combates) ocurrio en
      // acciones anteriores de la misma ronda. Esa lectura a la DB queda DENTRO
      // de esta cadena protegida por el .catch de abajo: si falla, se cae al
      // mismo lugar que un fallo de narracion y nunca rompe la partida.
      Promise.resolve(this.repo.eventosDeRonda(estado.id, turnoRonda))
        .then(eventosRonda => this.narrador(eventosRonda, estado.jugadores))
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

    return { vista: { ...vistaJugador(estado, jugadorId), narrativas }, eventos };
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
