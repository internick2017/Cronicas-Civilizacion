// Bisagra entre la narracion por IA (Gemini) y el narrador local del modo
// mapa. Vive en su propio modulo (y no en server-dynamic.js, donde estaba
// originalmente) para poder testearla de forma aislada: server-dynamic.js
// tiene efectos secundarios al importarlo (levanta Express, crea el server
// HTTP y el server de Socket.io al nivel del modulo), lo que impide
// importarlo limpiamente desde un test.
import { narrarRonda, nombreDe, resumirTerritorio } from './narradorLocal.js';

// Los jugadores van por NOMBRE, nunca por id. Metiendo e.jugadorId crudo, la IA
// escribia el identificador interno tal cual en la cronica: "los ejercitos del
// bot-ia se movieron como sombras furtivas" (visto jugando). Un id es un dato de
// la maquina, no un personaje de la historia.
function resumirEventos(eventos, jugadores) {
  // Los cambios de territorio se resumen aparte y agregados, con la MISMA
  // funcion que usa el narrador local. Enumerarlos uno por uno llenaba el
  // prompt de decenas de lineas identicas (un ejercito reclama una casilla por
  // paso) y aun asi la IA no podia decir a quien se las quitaron, porque el
  // dato no viajaba en el evento.
  const territorio = resumirTerritorio(eventos).map(c => c.duenoAnterior
    ? `${nombreDe(jugadores, c.jugadorId)} le quito ${c.casillas} casillas a ${nombreDe(jugadores, c.duenoAnterior)}`
    : `${nombreDe(jugadores, c.jugadorId)} ocupo ${c.casillas} casillas sin dueño`);

  const resto = eventos
    .filter(e => e.tipo !== 'TerritorioReclamado' && e.tipo !== 'TerritorioAnexado')
    .map(e => `${e.tipo}${e.jugadorId ? ` (${nombreDe(jugadores, e.jugadorId)})` : ''}`);

  return [...resto, ...territorio].join(', ');
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
