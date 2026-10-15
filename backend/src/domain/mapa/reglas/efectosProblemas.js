import { EFECTOS_PROBLEMAS, ESCALA_GRAVEDAD } from '../constantes.js';
import { inflacionAcunadaDe } from './moneda.js';

// Como cada problema social castiga mientras esta ACTIVO (ver problemas.js). Todas
// puras, aceptan un jugador viejo sin el campo y devuelven la identidad (1 o 0) si
// no hay problema, asi un Estado sin problemas juega exactamente como antes.
// El efecto crece con la gravedad: 1x en gravedad 1, 1,5x en 2, 2x en 3.
const escala = (gravedad) => 1 + ESCALA_GRAVEDAD * (gravedad - 1);
const activos = (jugador, tipo) => (jugador?.problemas ?? []).filter(p => p.tipo === tipo);
const enCiudad = (p, x, y) => p.ciudades.some(c => c.x === x && c.y === y);

export const problemasActivosEn = (jugador, x, y) => (jugador?.problemas ?? []).filter(p => enCiudad(p, x, y));

// Cuanto multiplica la produccion de UN recurso en UNA ciudad.
export function factorProduccionCiudad(jugador, x, y, recurso) {
  let factor = 1;
  for (const p of problemasActivosEn(jugador, x, y)) {
    const e = EFECTOS_PROBLEMAS[p.tipo];
    if (p.tipo === 'desempleo') factor *= 1 - e * escala(p.gravedad);
    else if (p.tipo === 'educacion' && recurso === 'science') factor *= 1 - e * escala(p.gravedad);
    else if (p.tipo === 'clima' && recurso === 'food') factor *= 1 - e * escala(p.gravedad);
  }
  return Math.max(0.1, factor);
}

const sumaPorCiudad = (jugador, tipo) =>
  Math.round(activos(jugador, tipo).reduce((s, p) => s + EFECTOS_PROBLEMAS[tipo] * escala(p.gravedad) * p.ciudades.length, 0));

// Corrupcion: se pierde oro fijo por ciudad afectada y por ronda.
export const perdidaFijaOro = (jugador) => sumaPorCiudad(jugador, 'corrupcion');
// Inmigracion: mas gente que mantener, o sea comida que se va.
export const consumoExtraComida = (jugador) => sumaPorCiudad(jugador, 'inmigracion');

// Inseguridad e infraestructura: la ciudad se defiende peor (menos defensa PLANA,
// que es lo mismo que perder un nivel de ciudad: defensaCiudad sube 2 por nivel).
export function penalizacionDefensa(jugador, x, y) {
  return Math.round(problemasActivosEn(jugador, x, y)
    .filter(p => p.tipo === 'inseguridad' || p.tipo === 'infraestructura')
    .reduce((s, p) => s + EFECTOS_PROBLEMAS[p.tipo] * escala(p.gravedad), 0));
}

// Inflacion: construir, reclutar y mejorar cuestan mas, en TODAS las ciudades. La
// del problema social (solo federal) y la de acuñar moneda (cualquier Estado) se multiplican.
export function multiplicadorCostos(jugador) {
  const gravedades = activos(jugador, 'inflacion').map(p => p.gravedad);
  const porProblema = gravedades.length === 0 ? 1 : 1 + EFECTOS_PROBLEMAS.inflacion * escala(Math.max(...gravedades));
  return porProblema * (1 + inflacionAcunadaDe(jugador) / 100);
}

// Redondea hacia ARRIBA: nunca baja un costo y nunca regala un recurso.
export function escalarCosto(costo, multiplicador) {
  if (multiplicador === 1) return { ...costo };
  return Object.fromEntries(Object.entries(costo).map(([r, m]) => [r, Math.ceil(m * multiplicador - 1e-9)]));
}

// Salud: la ciudad pierde poblacion cada ronda (con piso, ver aplicar.js).
export const perdidaPoblacion = (jugador, x, y) =>
  Math.round(activos(jugador, 'salud').filter(p => enCiudad(p, x, y))
    .reduce((s, p) => s + EFECTOS_PROBLEMAS.salud * escala(p.gravedad), 0));

// Pobreza: el pueblo te apoya cada vez menos (se descuenta en cerrarRondaGobierno).
export const caidaApoyoPueblo = (jugador) =>
  Math.round(activos(jugador, 'pobreza').reduce((s, p) => s + EFECTOS_PROBLEMAS.pobreza * escala(p.gravedad), 0));
