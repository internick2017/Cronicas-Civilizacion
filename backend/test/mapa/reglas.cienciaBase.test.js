import { describe, it, expect } from 'vitest';
import { crearEstado } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { terminarTurno, producirParaJugador } from '../../src/domain/mapa/reglas/turnos.js';
import { vistaJugador } from '../../src/domain/mapa/reglas/visibilidad.js';
import { PRODUCCION_BASE_CIUDAD, EDIFICIOS, TECNOLOGIAS } from '../../src/domain/mapa/constantes.js';

function partida() {
  const e = crearEstado({ nombre: 'T', semilla: 'ciencia' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'X' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Y' }));
  aplicar(e, iniciar(e));
  return e;
}

const cerrarRonda = (e) => {
  for (const j of [...e.jugadores]) {
    if (e.estado === 'jugando' && e.jugadores[e.indiceJugadorActual].id === j.id) {
      aplicar(e, terminarTurno(e, j.id));
    }
  }
};

describe('la ciencia entra desde la primera ciudad', () => {
  // La razon del cambio: la cultura rendia desde el turno 1 y la ciencia solo
  // con una biblioteca de 40 de piedra, que es el mismo recurso que se come
  // fundar ciudades. Medido antes de esto: 8 de 9 partidas de 40 turnos
  // terminaban con CERO ciencia y cero tecnologias, o sea que media rama del
  // juego no existia en una partida normal.
  it('la produccion base de una ciudad incluye ciencia, igual que cultura', () => {
    expect(PRODUCCION_BASE_CIUDAD.science).toBeGreaterThan(0);
    expect(PRODUCCION_BASE_CIUDAD.culture).toBeGreaterThan(0);
  });

  it('un jugador con su capital ya produce ciencia al cerrar la ronda', () => {
    const e = partida();
    const antes = e.jugadores.find(j => j.id === 'p1').recursos.science;
    cerrarRonda(e);
    expect(e.jugadores.find(j => j.id === 'p1').recursos.science).toBeGreaterThan(antes);
  });

  // La base quedo en 2 (lo mismo que rinde la cultura) porque con 1 la ciencia
  // seguia sin alcanzar: normal y dificil terminaban partidas de 40 turnos con
  // 30 de ciencia y CERO tecnologias, a cinco de la mas barata. El precio es
  // que la biblioteca pasa de cuadruplicar a multiplicar por 2.5 la ciencia de
  // esa ciudad. Sigue siendo el mayor salto disponible, y por lejos.
  it('la biblioteca sigue siendo el mayor salto de ciencia disponible', () => {
    const base = PRODUCCION_BASE_CIUDAD.science;
    const conBiblioteca = base + EDIFICIOS.library.produccion.science;
    expect(conBiblioteca).toBeGreaterThanOrEqual(base * 2);
    // Es el mejor edificio de ciencia al que se puede llegar SIN tecnologia: la
    // universidad rinde mas (+4), pero exige filosofia, que a su vez se compra
    // con la ciencia que da la biblioteca. El orden del juego se sostiene.
    const mejorSinTecnologia = Math.max(...Object.entries(EDIFICIOS)
      .filter(([tipo, def]) => tipo !== "library" && !def.requiereTecnologia)
      .map(([, def]) => def.produccion?.science ?? 0));
    expect(EDIFICIOS.library.produccion.science).toBeGreaterThan(mejorSinTecnologia);
  });

  it('la tecnologia mas barata entra en una partida corta', () => {
    const e = partida();
    const masBarata = Math.min(...Object.values(TECNOLOGIAS).map(t => t.costo.science));
    // Con una sola ciudad (el peor caso posible) y 40 rondas.
    expect(PRODUCCION_BASE_CIUDAD.science * 40).toBeGreaterThanOrEqual(masBarata);
  });

  it('lo que la vista promete es lo que se suma (invariante de siempre)', () => {
    const e = partida();
    const prometido = vistaJugador(e, 'p1').jugadores.find(j => j.id === 'p1').produccion.science;
    expect(prometido).toBe(producirParaJugador(e, 'p1').science);

    const antes = e.jugadores.find(j => j.id === 'p1').recursos.science;
    cerrarRonda(e);
    expect(e.jugadores.find(j => j.id === 'p1').recursos.science).toBe(antes + prometido);
  });
});
