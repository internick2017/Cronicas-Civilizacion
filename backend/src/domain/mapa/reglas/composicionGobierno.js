import {
  GOBIERNOS, EJES_GOBIERNO, INCOMPATIBLES, RESPETO, BONO_PRODUCCION_GOBIERNO, PODERES_SEPARADOS, PREFERENCIAS,
  GRUPOS_DE_APOYO,
} from '../constantes.js';
import { ReglaError } from '../errores.js';

// Un gobierno es una COMBINACION de hasta tres piezas, una por eje (Forma,
// Sistema, Regimen; ver EJES_GOBIERNO). Se guarda como una clave de texto
// `forma+sistema+regimen` con las piezas en ese orden, y una sola pieza es la
// clave de siempre ('monarquia'): asi las partidas viejas y la API siguen valiendo.
// Los efectos de cada pieza se SUMAN; lo que no se suma esta documentado abajo.

const ORDEN = Object.keys(EJES_GOBIERNO);
const EJE_DE = Object.fromEntries(
  Object.entries(EJES_GOBIERNO).flatMap(([eje, piezas]) => piezas.map(p => [p, eje])));

export const GOBIERNO_POR_DEFECTO = 'despotismo';

// Las piezas de una clave, validas y en el orden de los ejes; null si algo no existe
// o si hay dos del mismo eje.
export function piezasDeClave(clave) {
  if (typeof clave !== 'string' || clave === '') return null;
  const piezas = clave.split('+');
  const ejes = new Set();
  for (const p of piezas) {
    // hasOwn y no `in`: `in` aceptaria 'toString' o 'constructor' como pieza.
    if (!Object.hasOwn(GOBIERNOS, p) || !EJE_DE[p] || ejes.has(EJE_DE[p])) return null;
    ejes.add(EJE_DE[p]);
  }
  return [...piezas].sort((a, b) => ORDEN.indexOf(EJE_DE[a]) - ORDEN.indexOf(EJE_DE[b]));
}

export const claveDePiezas = (piezas) => piezas.join('+');

// La primera pareja contradictoria de la combinacion, o null.
export function contradiccionEntre(piezas) {
  return INCOMPATIBLES.find(([a, b]) => piezas.includes(a) && piezas.includes(b)) ?? null;
}

// Para validar lo que PROPONE un jugador: devuelve la clave canonica o lanza.
export function validarClaveDeGobierno(clave) {
  const piezas = piezasDeClave(clave);
  if (!piezas) throw new ReglaError('GOBIERNO_INVALIDO', 'Gobierno inválido');
  const choque = contradiccionEntre(piezas);
  if (choque) {
    throw new ReglaError('COMBINACION_INVALIDA',
      `${GOBIERNOS[choque[0]].nombre} y ${GOBIERNOS[choque[1]].nombre} se contradicen y no pueden ir juntos`);
  }
  return claveDePiezas(piezas);
}

export const nombreDeGobierno = (clave) =>
  (piezasDeClave(clave) ?? [GOBIERNO_POR_DEFECTO]).map(p => GOBIERNOS[p].nombre).join(' + ');

const sumar = (a, b) => {
  for (const [k, v] of Object.entries(b ?? {})) a[k] = (a[k] ?? 0) + v;
  return a;
};

const memoria = new Map();

// Todo lo que el resto de las reglas necesita saber de un gobierno, ya mezclado.
//  - respeto y bono de produccion: suma de las piezas.
//  - poderes independientes: union.
//  - electorado: el primero que no sea `jugador`, mirando Regimen, Sistema y Forma.
//  - sostenidoPor: los militares si CUALQUIER pieza se apoya en ellos.
//  - inmortal: el Despotismo que nadie vota nunca pierde el poder.
//  - republica: hay elecciones (Regimen democratico); monarquia: hay sucesion.
export function perfilDeGobierno(clave) {
  const piezas = piezasDeClave(clave) ?? [GOBIERNO_POR_DEFECTO];
  const id = claveDePiezas(piezas);
  if (memoria.has(id)) return memoria.get(id);

  const porEje = [...piezas].sort((a, b) => ORDEN.indexOf(EJE_DE[b]) - ORDEN.indexOf(EJE_DE[a]));
  const electorado = porEje.map(p => GOBIERNOS[p].electorado).find(e => e !== 'jugador') ?? 'jugador';
  const perfil = {
    clave: id,
    piezas,
    nombre: nombreDeGobierno(id),
    electorado,
    sostenidoPor: piezas.some(p => GOBIERNOS[p].sostenidoPor === 'militares') ? 'militares' : 'lideres',
    respeto: piezas.reduce((acc, p) => sumar(acc, RESPETO[p]), {}),
    bono: piezas.reduce((acc, p) => sumar(acc, BONO_PRODUCCION_GOBIERNO[p]), {}),
    poderes: [...new Set(piezas.flatMap(p => PODERES_SEPARADOS[p] ?? []))],
    republica: piezas.some(p => p.startsWith('republica_')),
    monarquia: piezas.includes('monarquia'),
    inmortal: piezas.includes('despotismo') && electorado === 'jugador',
  };
  memoria.set(id, perfil);
  return perfil;
}

// Lo que cada grupo piensa de una combinacion: el promedio de sus piezas.
export function preferenciaDe(clave, grupo) {
  const piezas = piezasDeClave(clave) ?? [GOBIERNO_POR_DEFECTO];
  return piezas.reduce((s, p) => s + PREFERENCIAS[grupo][p], 0) / piezas.length;
}

export { GRUPOS_DE_APOYO };
