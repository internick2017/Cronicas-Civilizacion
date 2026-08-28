import { jugadorPorId, puedePagar } from '../MapGame.js';
import { TECNOLOGIAS } from '../constantes.js';
import { ReglaError } from '../errores.js';
import { validarTurno, evento } from './comun.js';

// Las tecnologias son de la CIVILIZACION (como los rasgos culturales): se
// investigan una vez y valen para siempre, sin requisitos entre ellas (nada
// de arbolito). A diferencia de los rasgos, no rinden por ciudad: mejoran
// unidades o desbloquean cosas.
export function investigar(estado, jugadorId, { tecnologia }) {
  validarTurno(estado, jugadorId);

  const definicion = TECNOLOGIAS[tecnologia];
  if (!definicion) throw new ReglaError('TECNOLOGIA_DESCONOCIDA', `Tecnología desconocida: ${tecnologia}`);

  const jugador = jugadorPorId(estado, jugadorId);
  if (tecnologiasDe(jugador).includes(tecnologia)) {
    throw new ReglaError('TECNOLOGIA_YA_INVESTIGADA', 'Ya investigaste esa tecnología');
  }
  if (!puedePagar(jugador, definicion.costo)) {
    throw new ReglaError('RECURSOS_INSUFICIENTES', 'Ciencia insuficiente');
  }

  return [
    evento('RecursosGastados', estado, jugadorId, { costo: definicion.costo }),
    evento('TecnologiaInvestigada', estado, jugadorId, { tecnologia }),
  ];
}

// Las partidas guardadas ANTES de que existieran las tecnologias no tienen el
// campo. Se lee siempre por aca para que una partida vieja no reviente.
export function tecnologiasDe(jugador) {
  return jugador?.tecnologias ?? [];
}

// Bono plano de ataque a TODAS las unidades del jugador (metalurgia).
export function bonoAtaquePorTecnologias(jugador) {
  return tecnologiasDe(jugador).reduce(
    (extra, t) => extra + (TECNOLOGIAS[t]?.bonoAtaqueUnidades ?? 0), 0);
}

// Bono plano de defensa a las UNIDADES del jugador (fortificacion). Distinto
// de bonoDefensaPorRasgos (cultura), que es un multiplicador y solo aplica a
// ciudades: este es una suma y aplica a un ejercito, no a un edificio.
export function bonoDefensaUnidadPorTecnologias(jugador) {
  return tecnologiasDe(jugador).reduce(
    (extra, t) => extra + (TECNOLOGIAS[t]?.bonoDefensaUnidades ?? 0), 0);
}

// Aplica los bonos porcentuales de produccion (irrigacion, mineria) sobre un
// objeto {recurso: cantidad} ya calculado (base + terreno + edificios +
// rasgos). Se aplica AL FINAL, sobre el total, no recurso por recurso a
// mitad de camino: asi el porcentaje se calcula sobre todo lo que ya se junto
// para ese recurso, sin importar de donde vino cada parte.
export function aplicarBonosPorcentuales(produccion, jugador) {
  const porcentajes = {};
  for (const t of tecnologiasDe(jugador)) {
    for (const [recurso, fraccion] of Object.entries(TECNOLOGIAS[t]?.produccionPorcentual ?? {})) {
      porcentajes[recurso] = (porcentajes[recurso] ?? 0) + fraccion;
    }
  }
  const resultado = { ...produccion };
  for (const [recurso, fraccion] of Object.entries(porcentajes)) {
    if (resultado[recurso]) resultado[recurso] = Math.round(resultado[recurso] * (1 + fraccion));
  }
  return resultado;
}

// true si el jugador puede reclutar/construir algo que pide una tecnologia
// concreta (o si no pide ninguna: la mayoria de unidades/edificios no la
// necesitan y no deberian bloquearse por esto).
export function tieneTecnologiaRequerida(jugador, requiereTecnologia) {
  return !requiereTecnologia || tecnologiasDe(jugador).includes(requiereTecnologia);
}
