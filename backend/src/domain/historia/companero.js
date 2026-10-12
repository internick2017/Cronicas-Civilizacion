import { crearRng } from '../mapa/rng.js';
import { textosDe, vocabularioDe, rellenar, elegir } from './textos.js';

// El companero automatico del modo historia: un jugador atrevido que mete lios. Escribe su
// accion en primera persona, como cualquier jugador, con verbos que clasificarAccion reconoce
// (asi el narrador le da una consecuencia a medida) y con el vocabulario del genero.
// Si la ultima narracion menciona un hallazgo o un peligro del genero, reacciona a eso; si no, elige
// por genero y por ronda. Funciones puras y deterministas.

// Nombre de jugador y personaje del companero, estables para una sesion.
export function nombreDelCompanero({ idioma, semilla }) {
  const { nombre, personajes } = textosDe(idioma).companero;
  return { nombre, personaje: elegir(personajes, crearRng(`${semilla}:companero:nombre`)) };
}

// De los elementos del genero (hallazgo, peligro), el que la narracion menciona. El hallazgo
// gana si estan los dos: es lo mas especifico y lo que mas ganas da de quitarle a los demas.
// Lo que el companero ya tocaba en su accion anterior se salta: el narrador repite el mismo hallazgo
// ronda tras ronda, y sin esto el companero se pasaria la historia con el mismo cofre.
function loMencionado(narracion, vocabulario, anterior) {
  const texto = narracion.toLowerCase();
  const yaTocado = anterior.toLowerCase();
  for (const clave of ['hallazgo', 'peligro']) {
    const frase = vocabulario[clave].find(f => texto.includes(f.toLowerCase()) && !yaTocado.includes(f.toLowerCase()));
    if (frase) return { clave, frase };
  }
  return null;
}

// `otros` son los personajes de los demas jugadores: algunas acciones se meten con uno por su nombre.
// `narracion` es el texto de la ultima narracion del narrador y `anterior` la ultima accion del propio
// companero (vacios si todavia no hubo).
export function accionDelCompanero({ idioma, genero, ronda = 1, otros = [], semilla, narracion = '', anterior = '' }) {
  const textos = textosDe(idioma);
  const vocabulario = vocabularioDe(textos, genero);
  const mencion = loMencionado(narracion, vocabulario, anterior);
  if (mencion) {
    const reacciones = textos.companero.reacciones[mencion.clave];
    const inicio = Math.floor(crearRng(`${semilla}:companero:reaccion`)() * reacciones.length);
    return rellenar(reacciones[(inicio + ronda) % reacciones.length], { [mencion.clave]: mencion.frase });
  }
  const posibles = textos.companero.acciones.filter(a => otros.length > 0 || !a.includes('{otro}'));
  // Arranca en una accion propia de la partida y avanza una por ronda: dos rondas seguidas no repiten.
  const inicio = Math.floor(crearRng(`${semilla}:companero`)() * posibles.length);
  const plantilla = posibles[(inicio + ronda) % posibles.length];
  const rng = crearRng(`${semilla}:companero:${ronda}`);
  return rellenar(plantilla, {
    objeto: elegir(vocabulario.objeto, rng),
    otro: otros.length > 0 ? elegir(otros, rng) : '',
  });
}
