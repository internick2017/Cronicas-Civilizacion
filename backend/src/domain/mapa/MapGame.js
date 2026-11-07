import { randomUUID } from 'crypto';
import { generarMapa } from './generarMapa.js';
import { RECURSOS, MECANICAS, PODERES_ELEGIBLES, CRITERIOS_FINALES } from './constantes.js';
import { ReglaError } from './errores.js';

const CONFIG_DEFAULT = {
  tamanoMapa: 20,
  // Alto del mapa. `tamanoMapa` es el ANCHO; null = cuadrado (alto igual al ancho).
  // Se resuelve al LEER con altoDe, asi una partida guardada antes de que existiera
  // (sin el campo) y un estado armado a mano cambiando solo el ancho siguen siendo cuadrados.
  altoMapa: null,
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
  // Quien gana al llegar al limite de rondas: ver CRITERIOS_FINALES.
  criterioFinal: 'territorio',
  // Reparte las capitales entre islas distintas en vez de todas en el mismo
  // continente. Apagado por defecto: solo tiene sentido cuando hay transportes
  // Y la maquina sabe usarlos, asi que el default lo decide la medicion, no el
  // entusiasmo. Si la semilla no da dos masas de tierra jugables, la partida
  // arranca como siempre (ver generarMapa.js#posicionesIniciales).
  islas: false,
  // Cada cuantas rondas hay elecciones en las republicas (ver reglas/gobierno.js).
  rondasEntreElecciones: 8,
  // Mecanicas que se pueden apagar al crear la partida (ver reglas/modo.js). Ciencia y
  // cultura apagadas: ni se producen ni se gastan, sin tecnologias, rasgos ni mejoras de
  // ciudad. Gobierno apagado: nadie tiene apoyo, elecciones, impuestos ni Estado federal.
  // Todas prendidas por defecto: una partida sin tocar nada se juega como siempre.
  mecanicas: Object.fromEntries(MECANICAS.map(m => [m, true])),
  // Que poderes existen en la partida (ver reglas/modo.js#poderesApagadosDe).
  poderes: Object.fromEntries(PODERES_ELEGIBLES.map(p => [p, true])),
};

// Limites duros de la config. Viven en el DOMINIO (no solo en el borde HTTP)
// porque `generarMapa` asigna tamanoMapa * altoMapa objetos: sin cota, un `config`
// arbitrario (venga de una request, de un test o de otro servicio) puede
// tumbar el proceso entero. El limite es una regla del juego, no una
// validacion de transporte.
export const LIMITES_CONFIG = {
  tamanoMapa: { min: 10, max: 60 },
  altoMapa: { min: 10, max: 60 },
  maxJugadores: { min: 2, max: 8 },
  // Menos del 10% seria ganar casi sin jugar. El 100% se permite (lo pidio el
  // usuario) pero hay que ganarlo todo: con varios jugadores la partida puede no
  // terminar nunca, para eso existe el limite de rondas.
  porcentajeVictoria: { min: 10, max: 100 },
  // El limite es opcional (null), pero si se fija tiene que dar para una
  // partida de verdad: 5 rondas no alcanzan ni para fundar la segunda ciudad.
  limiteRondas: { min: 10, max: 500 },
  rondasEntreElecciones: { min: 2, max: 50 },
};
// El alto de una partida, incluso de una guardada antes de que hubiera mapas rectangulares.
export const altoDe = (config) => config.altoMapa ?? config.tamanoMapa;
const MODOS_TURNO = ['secuencial', 'simultaneo'];

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

const esObjetoPlano = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function validarCasillas(campo, casillas, validas) {
  const invalida = (detalle) => new ReglaError(
    'CONFIG_INVALIDA',
    `config.${campo} ${detalle} (recibido: ${JSON.stringify(casillas)})`
  );
  if (!esObjetoPlano(casillas)) throw invalida('debe ser un objeto');
  for (const [clave, valor] of Object.entries(casillas)) {
    if (!validas.includes(clave)) throw invalida(`no admite la clave ${clave}`);
    if (typeof valor !== 'boolean') throw invalida(`.${clave} debe ser booleano`);
  }
}

export function validarConfig(cfg) {
  validarEntero(cfg, 'tamanoMapa');
  if (cfg.altoMapa !== null && cfg.altoMapa !== undefined) validarEntero(cfg, 'altoMapa');
  validarEntero(cfg, 'maxJugadores');
  validarEntero(cfg, 'porcentajeVictoria');
  validarEntero(cfg, 'rondasEntreElecciones');
  // null es un valor valido y significa "sin limite"; cualquier otra cosa se
  // valida como entero en rango.
  if (cfg.limiteRondas !== null && cfg.limiteRondas !== undefined) {
    validarEntero(cfg, 'limiteRondas');
  }
  if (!CRITERIOS_FINALES.includes(cfg.criterioFinal)) {
    throw new ReglaError(
      'CONFIG_INVALIDA',
      `config.criterioFinal debe ser uno de: ${CRITERIOS_FINALES.join(', ')} (recibido: ${JSON.stringify(cfg.criterioFinal)})`
    );
  }
  if (typeof cfg.islas !== 'boolean') {
    throw new ReglaError('CONFIG_INVALIDA', `config.islas debe ser booleano (recibido: ${JSON.stringify(cfg.islas)})`);
  }
  validarCasillas('mecanicas', cfg.mecanicas, MECANICAS);
  validarCasillas('poderes', cfg.poderes, PODERES_ELEGIBLES);
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
  // El spread de arriba pisaria el objeto entero: lo que falte se completa con true.
  // Cada partida con su propio objeto: nunca se comparte el de CONFIG_DEFAULT.
  if (esObjetoPlano(config?.mecanicas)) cfg.mecanicas = { ...CONFIG_DEFAULT.mecanicas, ...config.mecanicas };
  else if (config?.mecanicas === undefined) cfg.mecanicas = { ...CONFIG_DEFAULT.mecanicas };
  if (esObjetoPlano(config?.poderes)) cfg.poderes = { ...CONFIG_DEFAULT.poderes, ...config.poderes };
  else if (config?.poderes === undefined) cfg.poderes = { ...CONFIG_DEFAULT.poderes };
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
    mapa: generarMapa(semilla, cfg.tamanoMapa, { islas: cfg.islas === true, alto: altoDe(cfg) }),
    ganador: null,
  };
}

// El estado ya es un objeto plano serializable; estas funciones fijan el contrato.
export const toJSON = (estado) => structuredClone(estado);
export const fromJSON = (json) => structuredClone(json);

export function tileEn(estado, x, y) {
  const ancho = estado.config.tamanoMapa;
  if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || x >= ancho || y < 0 || y >= altoDe(estado.config)) return null;
  return estado.mapa[y * ancho + x];
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
