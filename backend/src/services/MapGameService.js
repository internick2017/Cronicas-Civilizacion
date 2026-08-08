import crypto from 'crypto';
import { crearEstado } from '../domain/mapa/MapGame.js';
import { aplicar } from '../domain/mapa/aplicar.js';
import { crearRng } from '../domain/mapa/rng.js';
import { ReglaError } from '../domain/mapa/errores.js';
import { unirse as unirseRegla, iniciar as iniciarRegla } from '../domain/mapa/reglas/partida.js';
import { fundarCiudad, construir } from '../domain/mapa/reglas/ciudades.js';
import { reclutar } from '../domain/mapa/reglas/militar.js';
import { moverEjercito } from '../domain/mapa/reglas/movimiento.js';
import { atacar } from '../domain/mapa/reglas/combate.js';
import { terminarTurno } from '../domain/mapa/reglas/turnos.js';
import { vistaJugador } from '../domain/mapa/reglas/visibilidad.js';

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

  async _guardar(estado) {
    this.cache.set(estado.id, estado);
    await this.repo.guardar(estado, estado.codigo);
  }

  async crearPartida({ nombre, semilla, config }) {
    const codigo = await this._generarCodigoUnico();
    const estado = crearEstado({ nombre, semilla: semilla ?? codigo, config });
    estado.codigo = codigo;
    await this._guardar(estado);
    return { id: estado.id, codigo };
  }

  async unirse(idOCodigo, { id, nombre, civilizacion }) {
    const estado = await this._resolver(idOCodigo);
    if (!estado) throw new ReglaError('PARTIDA_NO_ENCONTRADA', 'Partida no encontrada');

    const eventos = unirseRegla(estado, { id, nombre, civilizacion });
    aplicar(estado, eventos);
    await this._guardar(estado);
    await this.repo.agregarEventos(estado.id, eventos);

    return vistaJugador(estado, id);
  }

  async iniciar(id) {
    const estado = await this._resolver(id);
    if (!estado) throw new ReglaError('PARTIDA_NO_ENCONTRADA', 'Partida no encontrada');

    const eventos = iniciarRegla(estado);
    aplicar(estado, eventos);
    await this._guardar(estado);
    await this.repo.agregarEventos(estado.id, eventos);

    const jugadorActual = estado.jugadores[estado.indiceJugadorActual];
    return vistaJugador(estado, jugadorActual.id);
  }

  async accion(id, jugadorId, accion) {
    const estado = await this._resolver(id);
    if (!estado) throw new ReglaError('PARTIDA_NO_ENCONTRADA', 'Partida no encontrada');

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

    // Si la regla tiro ReglaError, nunca llegamos aca: nada se aplico ni se persistio.
    aplicar(estado, eventos);
    await this._guardar(estado);
    await this.repo.agregarEventos(estado.id, eventos);

    const cerroRonda = eventos.some(e => e.tipo === 'RondaCompletada');
    if (cerroRonda && this.narrador) {
      const turnoRonda = eventos.find(e => e.tipo === 'RondaCompletada').turno;
      Promise.resolve(this.narrador(eventos))
        .then(narrativa => this.repo.guardarNarrativa(estado.id, turnoRonda, narrativa))
        .catch(() => null); // la narracion nunca puede romper la partida
    }

    if (this.emitir) {
      const vistaPorJugador = {};
      for (const jugador of estado.jugadores) vistaPorJugador[jugador.id] = vistaJugador(estado, jugador.id);
      this.emitir(id, 'estado', vistaPorJugador);
    }

    return { vista: vistaJugador(estado, jugadorId), eventos };
  }

  async vista(id, jugadorId) {
    const estado = await this._resolver(id);
    if (!estado) throw new ReglaError('PARTIDA_NO_ENCONTRADA', 'Partida no encontrada');
    return vistaJugador(estado, jugadorId);
  }
}
