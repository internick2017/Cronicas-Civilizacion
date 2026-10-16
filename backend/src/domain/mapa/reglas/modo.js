import { ReglaError } from '../errores.js';
import { PROBLEMAS, RECURSOS, MECANICAS } from '../constantes.js';

// Que existe en la partida segun las mecanicas elegidas al crearla (config.mecanicas). Es el
// UNICO lugar que lee esa config (y la vieja config.guerraPura): las reglas, la IA y la vista
// preguntan aca, no por el nombre de cada opcion.
//
// Un guardado viejo nunca se reescribe, la traduccion es solo al leer: sin `mecanicas`, una
// partida con `guerraPura: true` tiene ciencia y cultura apagadas; sin ninguno de los dos
// campos, todo esta prendido.
export function mecanicasDe(estado) {
  const config = estado?.config;
  const prendidas = Object.fromEntries(MECANICAS.map(m => [m, true]));
  if (config?.mecanicas) return { ...prendidas, ...config.mecanicas };
  if (config?.guerraPura === true) return { ...prendidas, ciencia: false, cultura: false };
  return prendidas;
}

export const mecanicaActiva = (estado, nombre) => mecanicasDe(estado)[nombre] === true;

// Para las acciones de una mecanica (investigar, adoptar un rasgo, mejorar una ciudad...).
export function exigirMecanica(estado, nombre, que) {
  if (!mecanicaActiva(estado, nombre)) throw new ReglaError('MECANICA_APAGADA', `En esta partida no hay ${que}`);
}

// Cada recurso civil depende de su propia mecanica.
const MECANICA_DEL_RECURSO = { science: 'ciencia', culture: 'cultura' };

export const recursoApagado = (estado, recurso) => {
  const mecanica = MECANICA_DEL_RECURSO[recurso];
  return mecanica !== undefined && !mecanicaActiva(estado, mecanica);
};

// Un edificio que solo rinde recursos apagados no tiene para que existir.
export const edificioApagado = (estado, definicion) => {
  const recursos = Object.keys(definicion?.produccion ?? {});
  return recursos.length > 0 && recursos.every(r => recursoApagado(estado, r));
};

// Un problema social cuyo unico efecto recae sobre un recurso apagado no se genera: el
// jugador pagaria oro por resolver algo que no hace nada (ver PROBLEMAS[tipo].recurso).
export const problemaApagado = (estado, tipo) => recursoApagado(estado, PROBLEMAS[tipo]?.recurso);

// Lo que la interfaz necesita saber para no ofrecer lo apagado, sin conocer las opciones.
export function reglasDelModo(estado) {
  const m = mecanicasDe(estado);
  return {
    tecnologias: m.ciencia,
    rasgos: m.cultura,
    mejorasCiudad: m.ciencia,
    recursosActivos: RECURSOS.filter(r => !recursoApagado(estado, r)),
    armada: m.armada,
    alianzas: m.alianzas,
    moneda: m.moneda,
    capital: m.capital,
  };
}
