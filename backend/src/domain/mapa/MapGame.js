import { randomUUID } from 'crypto';
import { generarMapa } from './generarMapa.js';
import { RECURSOS } from './constantes.js';
import { ReglaError } from './errores.js';

const CONFIG_DEFAULT = {
  tamanoMapa: 20,
  maxJugadores: 4,
  modoTurno: 'secuencial',
  // Cuanta tierra hay que controlar para ganar, en POR CIENTO entero (no
  // fraccion): es lo que el jugador elige en el lobby y lo que se le muestra,
  // asi que se guarda en la misma unidad para que no haya conversiones dando
  // vueltas. El default replica la constante historica (60%).
  porcentajeVictoria: 60,
  // Rondas antes del final forzado, o null para "sin limite". Con limite, al
  // llegar gana quien mas territorio tenga.
  limiteRondas: null,
};

// Limites duros de la config. Viven en el DOMINIO (no solo en el borde HTTP)
// porque `generarMapa` asigna tamanoMapa^2 objetos: sin cota, un `config`
// arbitrario (venga de una request, de un test o de otro servicio) puede
// tumbar el proceso entero. El limite es una regla del juego, no una
// validacion de transporte.
const LIMITES_CONFIG = {
  tamanoMapa: { min: 10, max: 60 },
  maxJugadores: { min: 2, max: 8 },
  // Menos del 30% seria ganar casi sin jugar; mas del 90% es practicamente
  // imposible con varios jugadores en el mapa.
  porcentajeVictoria: { min: 30, max: 90 },
  // El limite es opcional (null), pero si se fija tiene que dar para una
  // partida de verdad: 5 rondas no alcanzan ni para fundar la segunda ciudad.
  limiteRondas: { min: 10, max: 500 },
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
  validarEntero(cfg, 'porcentajeVictoria');
  // null es un valor valido y significa "sin limite"; cualquier otra cosa se
  // valida como entero en rango.
  if (cfg.limiteRondas !== null && cfg.limiteRondas !== undefined) {
    validarEntero(cfg, 'limiteRondas');
  }
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
