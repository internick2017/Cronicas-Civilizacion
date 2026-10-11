import { ReglaError } from '../errores.js';
import { PROBLEMAS, RECURSOS, RECURSOS_CIVILES, esEdificioCivil } from '../constantes.js';

// Que existe en la partida segun su modo. Es el UNICO lugar que sabe que "guerra pura"
// (config.guerraPura) apaga la ciencia y la cultura: las reglas, la IA y la vista preguntan
// aca, no por el nombre del modo. Las partidas guardadas antes del modo no traen el campo y
// se leen como "apagado".
export const esGuerraPura = (estado) => estado?.config?.guerraPura === true;

export const recursoApagado = (estado, recurso) =>
  esGuerraPura(estado) && RECURSOS_CIVILES.includes(recurso);

// Un edificio que solo rinde ciencia o cultura no tiene para que existir sin ellas.
export const edificioApagado = (estado, definicion) =>
  esGuerraPura(estado) && esEdificioCivil(definicion);

// Un problema social cuyo unico efecto recae sobre un recurso apagado no se genera: el
// jugador pagaria oro por resolver algo que no hace nada (ver PROBLEMAS[tipo].recurso).
export const problemaApagado = (estado, tipo) => recursoApagado(estado, PROBLEMAS[tipo]?.recurso);

// Para las acciones civiles (investigar, adoptar un rasgo, mejorar una ciudad).
export function exigirCivil(estado, que) {
  if (esGuerraPura(estado)) throw new ReglaError('GUERRA_PURA', `En guerra pura no hay ${que}`);
}

// Lo que la interfaz necesita saber para no ofrecer lo apagado, sin conocer el nombre del modo.
export function reglasDelModo(estado) {
  const civil = !esGuerraPura(estado);
  return {
    tecnologias: civil,
    rasgos: civil,
    mejorasCiudad: civil,
    recursosActivos: RECURSOS.filter(r => !recursoApagado(estado, r)),
  };
}
