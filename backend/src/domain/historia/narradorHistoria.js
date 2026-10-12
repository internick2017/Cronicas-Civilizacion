import { crearRng, entero } from '../mapa/rng.js';
import { clasificarAccion } from './clasificarAccion.js';
import { textosDe, vocabularioDe, rellenar, elegir } from './textos.js';

// Narrador local del modo historia: arma el texto con lo que escribieron los jugadores, sin
// llamar a ninguna IA. Son funciones puras: la misma entrada da siempre el mismo texto (la
// semilla se arma con la sesion y la ronda), asi se prueban y no cuestan nada.
// No entiende el significado de las frases: las cita, deduce de que tipo de accion se trata
// (clasificarAccion) y le agrega una consecuencia con el vocabulario del genero.
const LARGO_MAXIMO_FRASE = 140;
const RONDAS_DE_CIERRE = 2;
const MAXIMO_EN_EPILOGO = 6;

const esActivo = (modo) => modo !== 'colaborativo';

// Una frase de jugador lista para citarla: sin comillas ni saltos de linea, sin el punto final
// y recortada en el limite de una palabra.
function limpiar(texto) {
  const plano = String(texto ?? '').replace(/[«»"“”]/g, '').replace(/\s+/g, ' ').trim().replace(/[.!?…]+$/, '');
  if (plano.length <= LARGO_MAXIMO_FRASE) return plano;
  const corte = plano.slice(0, LARGO_MAXIMO_FRASE);
  const ultimoEspacio = corte.lastIndexOf(' ');
  return `${corte.slice(0, ultimoEspacio > 20 ? ultimoEspacio : LARGO_MAXIMO_FRASE)}…`;
}

// Parte de una frase al azar y sigue por orden: dos usos seguidos de la misma lista no repiten.
const ciclo = (lista, rng) => { let i = entero(rng, lista.length); return () => lista[i++ % lista.length]; };
const unir = (nombres, y) => (nombres.length <= 1 ? nombres.join('') : `${nombres.slice(0, -1).join(', ')}${y}${nombres.at(-1)}`);
const accionesConTexto = (acciones) => (acciones ?? []).filter(a => limpiar(a.texto));

function recuerdoDe(textos, rng, actuales, anteriores) {
  const quienes = new Set(actuales.map(a => a.personaje));
  const previa = [...(anteriores ?? [])].reverse().find(a => limpiar(a.texto) && quienes.has(a.personaje));
  return previa && rellenar(elegir(textos.recuerdo, rng), { n: previa.personaje, frase: limpiar(previa.texto) });
}

function finalDeRonda({ textos, vocabulario, modo, ronda, rondasRestantes, personajes }, rng) {
  if (rondasRestantes !== null && rondasRestantes !== undefined && rondasRestantes <= RONDAS_DE_CIERRE) {
    return rondasRestantes <= 1 ? textos.ultimaRonda : elegir(textos.cierre, rng);
  }
  if (!esActivo(modo)) return elegir(textos.invitacion, rng);
  const peligro = elegir(vocabulario.peligro, rng);
  // Rondas pares: un peligro para todos. Impares: apunta a un personaje, rotando entre ellos.
  if (ronda % 2 === 0 || personajes.length === 0) return rellenar(elegir(textos.ganchoGlobal, rng), { peligro });
  return rellenar(elegir(textos.ganchoDirigido, rng), { peligro, n: personajes[(ronda - 1) % personajes.length] });
}

export function narrarRonda({ idioma, genero, modo, acciones, anteriores = [], ronda = 1, rondasRestantes = null, semilla }) {
  const textos = textosDe(idioma);
  const vocabulario = vocabularioDe(textos, genero);
  const rng = crearRng(`${semilla}:ronda${ronda}`);
  const hechas = accionesConTexto(acciones);
  if (hechas.length === 0) return textos.sinAcciones;

  const partes = [];
  const recuerdo = recuerdoDe(textos, rng, hechas, anteriores);
  if (recuerdo) partes.push(recuerdo);
  const siguienteIntencion = ciclo(textos.intencion, rng);
  const siguienteConector = ciclo(textos.conectores, rng);
  const siguienteHallazgo = ciclo(vocabulario.hallazgo, rng);
  const consecuenciaPorTipo = {};
  hechas.forEach((accion, i) => {
    const n = accion.personaje;
    const tipo = clasificarAccion(accion.texto);
    consecuenciaPorTipo[tipo] ??= ciclo(textos.consecuencias[tipo], rng);
    const intencion = rellenar(siguienteIntencion(), { n, frase: limpiar(accion.texto) });
    const conector = i === 0 ? '' : `${siguienteConector()} `;
    const consecuencia = rellenar(consecuenciaPorTipo[tipo](), { n, hallazgo: siguienteHallazgo() });
    partes.push(`${conector}${intencion} ${consecuencia}`);
  });
  partes.push(finalDeRonda(
    { textos, vocabulario, modo, ronda, rondasRestantes, personajes: hechas.map(a => a.personaje) },
    rng,
  ));
  return partes.join(' ');
}

export function apertura({ idioma, genero, modo, personajes = [], semilla }) {
  const textos = textosDe(idioma);
  const vocabulario = vocabularioDe(textos, genero);
  const rng = crearRng(`${semilla}:apertura`);
  const escena = rellenar(textos.apertura, { lugar: elegir(vocabulario.lugar, rng), nombres: unir(personajes, textos.union) });
  const cierre = esActivo(modo)
    ? rellenar(textos.aperturaGancho, { peligro: elegir(vocabulario.peligro, rng) })
    : textos.aperturaColaborativa;
  return `${escena} ${cierre}`;
}

// Lo ultimo que hizo cada personaje, en el orden en que aparecio por primera vez.
export function epilogo({ idioma, genero, acciones = [], semilla }) {
  const textos = textosDe(idioma);
  const vocabulario = vocabularioDe(textos, genero);
  const rng = crearRng(`${semilla}:epilogo`);
  const ultimaPorPersonaje = new Map();
  for (const a of accionesConTexto(acciones)) ultimaPorPersonaje.set(a.personaje, a.texto);
  const siguienteRecuerdo = ciclo(textos.epilogoRecuerdo, rng);
  const recuerdos = [...ultimaPorPersonaje].slice(0, MAXIMO_EN_EPILOGO)
    .map(([n, texto]) => rellenar(siguienteRecuerdo(), { n, frase: limpiar(texto) }));
  return [textos.epilogoInicio, ...recuerdos, rellenar(textos.epilogoCierre, { final: elegir(vocabulario.final, rng) })].join(' ');
}
