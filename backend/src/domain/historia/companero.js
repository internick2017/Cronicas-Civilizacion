import { crearRng } from '../mapa/rng.js';
import { textosDe, vocabularioDe, rellenar, elegir } from './textos.js';

// El companero automatico del modo historia: un jugador atrevido que mete lios. Escribe su
// accion en primera persona, como cualquier jugador, con verbos que clasificarAccion reconoce
// (asi el narrador le da una consecuencia a medida) y con el vocabulario del genero.
// No lee la historia: elige por genero y por ronda. Funciones puras y deterministas.

// Nombre de jugador y personaje del companero, estables para una sesion.
export function nombreDelCompanero({ idioma, semilla }) {
  const { nombre, personajes } = textosDe(idioma).companero;
  return { nombre, personaje: elegir(personajes, crearRng(`${semilla}:companero:nombre`)) };
}

// `otros` son los personajes de los demas jugadores: algunas acciones se meten con uno por su nombre.
export function accionDelCompanero({ idioma, genero, ronda = 1, otros = [], semilla }) {
  const textos = textosDe(idioma);
  const posibles = textos.companero.acciones.filter(a => otros.length > 0 || !a.includes('{otro}'));
  // Arranca en una accion propia de la partida y avanza una por ronda: dos rondas seguidas no repiten.
  const inicio = Math.floor(crearRng(`${semilla}:companero`)() * posibles.length);
  const plantilla = posibles[(inicio + ronda) % posibles.length];
  const rng = crearRng(`${semilla}:companero:${ronda}`);
  return rellenar(plantilla, {
    objeto: elegir(vocabularioDe(textos, genero).objeto, rng),
    otro: otros.length > 0 ? elegir(otros, rng) : '',
  });
}
