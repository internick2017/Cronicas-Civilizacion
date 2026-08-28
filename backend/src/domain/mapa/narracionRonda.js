// Bisagra entre la narracion por IA (Gemini) y el narrador local del modo
// mapa. Vive en su propio modulo (y no en server-dynamic.js, donde estaba
// originalmente) para poder testearla de forma aislada: server-dynamic.js
// tiene efectos secundarios al importarlo (levanta Express, crea el server
// HTTP y el server de Socket.io al nivel del modulo), lo que impide
// importarlo limpiamente desde un test.
import { narrarRonda, nombreDe } from './narradorLocal.js';

// Los jugadores van por NOMBRE, nunca por id. Metiendo e.jugadorId crudo, la IA
// escribia el identificador interno tal cual en la cronica: "los ejercitos del
// bot-ia se movieron como sombras furtivas" (visto jugando). Un id es un dato de
// la maquina, no un personaje de la historia.
function resumirEventos(eventos, jugadores) {
  return eventos
    .map(e => `${e.tipo}${e.jugadorId ? ` (${nombreDe(jugadores, e.jugadorId)})` : ''}`)
    .join(', ');
}

/**
 * Narrador simple para el modo mapa: resume los eventos de la ronda en un
 * prompt corto y lo manda al servicio de IA recibido por parametro. Si la IA
 * no esta configurada (devuelve null/falsy) o falla (tira excepcion), cae al
 * narrador local - MapGameService ya garantiza que un narrador que falla
 * nunca rompe una accion (ver `.catch()` en el servicio).
 *
 * `servicioIA` se recibe por parametro (en vez de importar el singleton de
 * AIService.js directamente) para poder inyectar un doble en los tests sin
 * pegarle a la API real de Gemini.
 */
export async function narrarRondaMapa(eventos, jugadores = [], servicioIA) {
  const prompt = `Resumi en un parrafo breve, en prosa narrativa, lo que paso en esta ronda de una partida de estrategia por turnos. Eventos: ${resumirEventos(eventos, jugadores)}`;
  try {
    const conIa = await servicioIA.generateStoryNarrative(prompt, { mode: 'mapa' });
    if (conIa) return conIa;
  } catch {
    // sin conexion o sin cuota: cae al narrador local
  }
  // Sin GEMINI_API_KEY el modo mapa igual narra. Una sola voz por ronda.
  return narrarRonda(eventos, jugadores);
}
