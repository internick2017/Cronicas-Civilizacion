import { describe, it, expect } from 'vitest';
import { crearEstado } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { jugarTurnoIA, PERFILES_DIFICULTAD, NIVEL_CIUDAD_INCAPTURABLE } from '../../src/domain/mapa/ia.js';
import { crearRng } from '../../src/domain/mapa/rng.js';
import { UNIDADES, defensaCiudad, CUARTEL, BONO_DEFENSA_CIUDAD, TECNOLOGIAS } from '../../src/domain/mapa/constantes.js';

describe('tope de mejora de ciudad de la IA', () => {
  // Deja constancia en un test del calculo que motiva el tope, para que si
  // alguien toca la formula de defensa o el ataque de las unidades, se entere
  // de que el numero cambio en vez de descubrirlo en una partida eterna.
  it('a partir de cierto nivel una ciudad es matematicamente incapturable', () => {
    const mejorAtaque = Math.max(...Object.values(UNIDADES).map(u => u.ataque));
    const bonoTec = Math.max(...Object.values(TECNOLOGIAS).map(t => t.bonoAtaqueUnidades ?? 0));
    const ataqueMaximo = (mejorAtaque + bonoTec) * 1.2; // 1.2 = mejor tirada posible
    // Defensa MINIMA de la ciudad: peor tirada (0.8), con cuartel, en colinas (1.25).
    const defensaMinima = (nivel) =>
      (defensaCiudad(nivel) + CUARTEL.bonoDefensaCiudad) * 0.8 * BONO_DEFENSA_CIUDAD * 1.25;

    expect(defensaMinima(NIVEL_CIUDAD_INCAPTURABLE)).toBeGreaterThan(ataqueMaximo);
    expect(defensaMinima(NIVEL_CIUDAD_INCAPTURABLE - 1)).toBeLessThan(ataqueMaximo);
  });

  it('la IA no sube ninguna ciudad hasta volverla incapturable', () => {
    const e = crearEstado({ nombre: 'T', semilla: 'tope-1' });
    aplicar(e, unirse(e, { id: 'bot', nombre: 'M', civilizacion: 'A', esBot: true, dificultadIA: 'dificil' }));
    aplicar(e, unirse(e, { id: 'h1', nombre: 'H', civilizacion: 'B' }));
    aplicar(e, iniciar(e));
    const jugador = e.jugadores.find(j => j.id === 'bot');
    jugador.tecnologias = Object.keys(TECNOLOGIAS);

    for (let i = 0; i < 15; i++) {
      jugador.recursos = { food: 9000, gold: 9000, wood: 9000, stone: 9000, science: 9000, culture: 0 };
      jugarTurnoIA(e, 'bot', crearRng(`tope-${i}`));
      const otro = e.jugadores[e.indiceJugadorActual];
      if (otro.id !== 'bot' && e.estado === 'jugando') {
        aplicar(e, [{ tipo: 'TurnoAvanzado', turno: e.turno, jugadorId: otro.id, datos: { indiceJugadorActual: 0, turno: e.turno } }]);
      }
    }

    const niveles = e.mapa.filter(t => t.ciudad && t.dueno === 'bot').map(t => t.ciudad.nivel);
    expect(Math.max(...niveles)).toBeLessThan(NIVEL_CIUDAD_INCAPTURABLE);
    expect(Math.max(...niveles)).toBeLessThanOrEqual(PERFILES_DIFICULTAD.dificil.nivelMaximoCiudad);
    // Y de hecho mejora alguna: el tope no puede ser una excusa para no mejorar.
    expect(Math.max(...niveles)).toBeGreaterThan(1);
  });

  it('con una ciudad en nivel 3 y otra nueva en nivel 1, sube primero la de nivel 3', () => {
    const e = crearEstado({ nombre: 'T', semilla: 'tope-2' });
    aplicar(e, unirse(e, { id: 'bot', nombre: 'M', civilizacion: 'A', esBot: true, dificultadIA: 'dificil' }));
    aplicar(e, unirse(e, { id: 'h1', nombre: 'H', civilizacion: 'B' }));
    aplicar(e, iniciar(e));
    const capital = e.mapa.find(t => t.ciudad && t.dueno === 'bot');
    capital.ciudad.nivel = 3;
    const libre = e.mapa.find(t => t.terreno === 'plains' && !t.ciudad && !t.dueno);
    libre.ciudad = { nombre: 'Nueva', nivel: 1, poblacion: 100, edificios: [] };
    libre.dueno = 'bot';
    const jugador = e.jugadores.find(j => j.id === 'bot');
    jugador.tecnologias = Object.keys(TECNOLOGIAS);
    // Ciencia justa para UNA mejora de 3 a 4 (15 * 3): la mejora de menor nivel la gastaria en otra.
    jugador.recursos = { food: 9000, gold: 9000, wood: 9000, stone: 9000, science: 45, culture: 0 };
    e.indiceJugadorActual = e.jugadores.indexOf(jugador);

    jugarTurnoIA(e, 'bot', crearRng('tope-2'));
    // La de nivel 3 pasa de 3 (hasta donde llega sola la administracion): la mejora primero.
    expect(capital.ciudad.nivel).toBeGreaterThan(3);
  });
});
