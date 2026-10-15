import { jugadorPorId } from '../MapGame.js';
import { ReglaError } from '../errores.js';
import { evento } from './comun.js';

export const LARGO_MAXIMO_NOMBRE_PAIS = 30;

const sinMayusculas = (texto) => texto.toLocaleLowerCase('es');

// Quien puede ponerle nombre a algo suyo (pais, moneda, gobierno): es gratis y no
// exige turno ni partida iniciada, porque es una etiqueta y no una jugada.
export function jugadorQueNombra(estado, jugadorId) {
  if (estado.estado === 'terminado') throw new ReglaError('PARTIDA_TERMINADA', 'La partida ya terminó');
  const jugador = jugadorPorId(estado, jugadorId);
  if (!jugador) throw new ReglaError('JUGADOR_DESCONOCIDO', `Jugador desconocido: ${jugadorId}`);
  if (!jugador.activo) throw new ReglaError('JUGADOR_INACTIVO', 'Ya no estás en la partida');
  return jugador;
}

// El nombre del pais es `jugador.civilizacion`. Las ciudades ya fundadas
// ("Incas Capital") conservan su nombre: se renombran aparte.
export function renombrarPais(estado, jugadorId, { nombre }) {
  jugadorQueNombra(estado, jugadorId);

  const limpio = typeof nombre === 'string' ? nombre.trim() : '';
  if (!limpio) throw new ReglaError('NOMBRE_INVALIDO', 'El nombre no puede estar vacío');
  if (limpio.length > LARGO_MAXIMO_NOMBRE_PAIS) {
    throw new ReglaError('NOMBRE_INVALIDO', `El nombre admite hasta ${LARGO_MAXIMO_NOMBRE_PAIS} caracteres`);
  }
  // Los avisos ("Incas domina el 40% del mundo") nombran al pais sin el jugador:
  // dos paises con el mismo nombre no se podrian distinguir.
  const repetido = estado.jugadores.some(j =>
    j.id !== jugadorId && sinMayusculas(j.civilizacion ?? '') === sinMayusculas(limpio));
  if (repetido) throw new ReglaError('NOMBRE_REPETIDO', 'Otro país ya usa ese nombre');

  return [evento('PaisRenombrado', estado, jugadorId, { nombre: limpio })];
}
