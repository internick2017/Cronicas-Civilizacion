import { jugadorPorId } from '../MapGame.js';
import { ReglaError } from '../errores.js';
import {
  ACUNACION, MONEDA_POR_DEFECTO, LARGO_MAXIMO_NOMBRE_MONEDA, LARGO_MAXIMO_SIMBOLO_MONEDA,
} from '../constantes.js';
import { validarTurno, evento } from './comun.js';
import { jugadorQueNombra } from './pais.js';
import { exigirMecanica } from './modo.js';

// Accesores con valor por defecto: una partida guardada antes de la moneda no
// trae ninguno de estos campos.
export const monedaDe = (jugador) => ({ ...(jugador?.moneda ?? MONEDA_POR_DEFECTO) });
export const inflacionAcunadaDe = (jugador) => jugador?.inflacionAcunada ?? 0;
export const acunadoEnRonda = (jugador, turno) =>
  (jugador?.acunacion?.ronda === turno ? jugador.acunacion.oro : 0);

// Los puntos de inflacion se guardan con dos decimales: 0.2 * 3 no da 0.6 exacto.
const conDosDecimales = (n) => Math.round(n * 100) / 100;

// Un emoji compuesto (bandera, tono de piel) es UN simbolo aunque ocupe varios
// caracteres de JavaScript: se cuentan graficos, no unidades de texto.
const graficos = (texto) => [...new Intl.Segmenter('es', { granularity: 'grapheme' }).segment(texto)].length;

export function nombrarMoneda(estado, jugadorId, { nombre, simbolo }) {
  exigirMecanica(estado, 'moneda', 'moneda propia');
  jugadorQueNombra(estado, jugadorId);
  const limpio = typeof nombre === 'string' ? nombre.trim() : '';
  if (!limpio) throw new ReglaError('NOMBRE_INVALIDO', 'El nombre no puede estar vacío');
  if (limpio.length > LARGO_MAXIMO_NOMBRE_MONEDA) {
    throw new ReglaError('NOMBRE_INVALIDO', `El nombre admite hasta ${LARGO_MAXIMO_NOMBRE_MONEDA} caracteres`);
  }
  const signo = typeof simbolo === 'string' ? simbolo.trim() : '';
  if (!signo || graficos(signo) > LARGO_MAXIMO_SIMBOLO_MONEDA) {
    throw new ReglaError('SIMBOLO_INVALIDO', `El símbolo lleva de 1 a ${LARGO_MAXIMO_SIMBOLO_MONEDA} caracteres`);
  }
  return [evento('MonedaNombrada', estado, jugadorId, { nombre: limpio, simbolo: signo })];
}

// El techo se respeta rechazando, no recortando: si la inflacion se recortara al
// techo, en el techo acuñar daria oro sin costo alguno.
export function acunarMoneda(estado, jugadorId, { oro }) {
  exigirMecanica(estado, 'moneda', 'moneda propia');
  validarTurno(estado, jugadorId);
  const jugador = jugadorPorId(estado, jugadorId);
  const { maximoPorRonda, puntosPorOro, techo } = ACUNACION;
  if (!Number.isInteger(oro) || oro < 1 || oro > maximoPorRonda) {
    throw new ReglaError('ORO_INVALIDO', `Se acuñan de 1 a ${maximoPorRonda} de oro`);
  }
  const yaAcunado = acunadoEnRonda(jugador, estado.turno);
  if (yaAcunado + oro > maximoPorRonda) {
    throw new ReglaError('TOPE_ACUNACION', `Esta ronda podés acuñar ${maximoPorRonda - yaAcunado} de oro más`);
  }
  const inflacion = conDosDecimales(inflacionAcunadaDe(jugador) + oro * puntosPorOro);
  if (inflacion > techo) {
    throw new ReglaError('INFLACION_MAXIMA', `La inflación acuñada no puede pasar de ${techo}%`);
  }
  return [evento('MonedaAcunada', estado, jugadorId, { oro, inflacion })];
}

// Al cerrar la ronda la inflacion acuñada baja sola, hasta cero.
export const inflacionTrasRonda = (jugador) =>
  Math.max(0, conDosDecimales(inflacionAcunadaDe(jugador) - ACUNACION.bajadaPorRonda));
