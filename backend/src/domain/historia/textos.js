import { entero } from '../mapa/rng.js';
import { TEXTOS_ES } from './textos.es.js';
import { TEXTOS_PT } from './textos.pt.js';

// Lo que comparten el narrador local y el companero automatico: elegir el idioma y el
// vocabulario del genero, y rellenar las plantillas con sus huecos {asi}.
const TEXTOS_POR_IDIOMA = { es: TEXTOS_ES, pt: TEXTOS_PT };
const GENERO_POR_DEFECTO = 'fantasy';

export const textosDe = (idioma) => TEXTOS_POR_IDIOMA[idioma] ?? TEXTOS_ES;
export const vocabularioDe = (textos, genero) => textos.generos[genero] ?? textos.generos[GENERO_POR_DEFECTO];

const mayuscula = (texto) => texto.charAt(0).toUpperCase() + texto.slice(1);
export const rellenar = (plantilla, datos) => mayuscula(plantilla.replace(/\{(\w+)\}/g, (_, clave) => datos[clave] ?? ''));
export const elegir = (lista, rng) => lista[entero(rng, lista.length)];
