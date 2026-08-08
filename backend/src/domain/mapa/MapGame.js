import { randomUUID } from 'crypto';
import { generarMapa } from './generarMapa.js';
import { RECURSOS } from './constantes.js';
import { ReglaError } from './errores.js';

const CONFIG_DEFAULT = { tamanoMapa: 20, maxJugadores: 4, modoTurno: 'secuencial' };

// Limites duros de la config. Viven en el DOMINIO (no solo en el borde HTTP)
// porque `generarMapa` asigna tamanoMapa^2 objetos: sin cota, un `config`
// arbitrario (venga de una request, de un test o de otro servicio) puede
// tumbar el proceso entero. El limite es una regla del juego, no una
// validacion de transporte.
const LIMITES_CONFIG = {
  tamanoMapa: { min: 10, max: 60 },
  maxJugadores: { min: 2, max: 8 },
};
const MODOS_TURNO = ['secuencial']; // unico modo implementado

function validarEntero(cfg, clave) {
  const { min, max } = LIMITES_CONFIG[clave];
  const valor = cfg[clave];
  if (!Number.isInteger(valor) || valor < min || valor > max) {
    throw new ReglaError(
      'CONFIG_INVALIDA',
      `config.${clave} debe ser un entero entre ${min} y ${max} (recibido: ${JSON.stringify(valor)})`
    );
  }
}

export function validarConfig(cfg) {
  validarEntero(cfg, 'tamanoMapa');
  validarEntero(cfg, 'maxJugadores');
  if (!MODOS_TURNO.includes(cfg.modoTurno)) {
    throw new ReglaError(
      'CONFIG_INVALIDA',
      `config.modoTurno debe ser uno de: ${MODOS_TURNO.join(', ')} (recibido: ${JSON.stringify(cfg.modoTurno)})`
    );
  }
  return cfg;
}

export function crearEstado({ nombre, semilla, config = {} }) {
  const cfg = { ...CONFIG_DEFAULT, ...(config ?? {}) };
  validarConfig(cfg); // antes de generarMapa: nunca asignamos nada sin cota
  return {
    id: randomUUID(),
    nombre,
    estado: 'esperando',
    versionEsquema: 1,
    semilla: String(semilla),
    turno: 0,
    indiceJugadorActual: 0,
    config: cfg,
    jugadores: [],
    mapa: generarMapa(semilla, cfg.tamanoMapa),
    ganador: null,
  };
}

// El estado ya es un objeto plano serializable; estas funciones fijan el contrato.
export const toJSON = (estado) => structuredClone(estado);
export const fromJSON = (json) => structuredClone(json);

export function tileEn(estado, x, y) {
  const t = estado.config.tamanoMapa;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= t || y < 0 || y >= t) return null;
  return estado.mapa[y * t + x];
}

export const jugadorPorId = (estado, id) => estado.jugadores.find(j => j.id === id) ?? null;

export function puedePagar(jugador, costo) {
  for (const [recurso, cantidad] of Object.entries(costo)) {
    if (!RECURSOS.includes(recurso)) {
      throw new ReglaError('RECURSO_DESCONOCIDO', `Recurso desconocido: ${recurso}`);
    }
    if ((jugador.recursos[recurso] ?? 0) < cantidad) return false;
  }
  return true;
}
