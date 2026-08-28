import { describe, it, expect } from 'vitest';
import { crearEstado, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { terminarTurno } from '../../src/domain/mapa/reglas/turnos.js';
import { controlTerritorial } from '../../src/domain/mapa/reglas/dominacion.js';
import { jugarTurnoIA, PERFILES_DIFICULTAD } from '../../src/domain/mapa/ia.js';
import { crearRng } from '../../src/domain/mapa/rng.js';

const RICO = { food: 10000, gold: 10000, wood: 10000, stone: 10000, science: 0, culture: 0 };

function partidaConBot(semilla, dificultadIA = 'normal') {
  const e = crearEstado({ nombre: 'T', semilla });
  aplicar(e, unirse(e, { id: 'bot', nombre: 'La Máquina', civilizacion: 'Autómatas', esBot: true, dificultadIA }));
  aplicar(e, unirse(e, { id: 'h1', nombre: 'H1', civilizacion: 'Civ1' }));
  aplicar(e, iniciar(e));
  return e;
}

// El humano no hace nada: solo pasa el turno, para que la ronda cierre y el bot
// vuelva a jugar. Asi se puede medir a donde LLEGA la IA en varias rondas, que
// es lo unico que revela si persigue un objetivo o solo ejecuta pasos sueltos.
function jugarRondas(e, cantidad, semilla) {
  for (let i = 0; i < cantidad; i++) {
    const actual = e.jugadores[e.indiceJugadorActual].id;
    if (e.estado !== 'jugando') break;
    if (actual === 'bot') jugarTurnoIA(e, 'bot', crearRng(`${semilla}-${i}`));
    else aplicar(e, terminarTurno(e, actual));
  }
}

describe('la IA juega por dominacion territorial', () => {
  it('camina hacia la casilla SIN DUENO antes que hacia una ya propia', () => {
    const e = partidaConBot('territorio-1');
    const bot = e.jugadores.find(j => j.id === 'bot');
    bot.recursos = { food: 0, gold: 0, wood: 0, stone: 0, science: 0, culture: 0 }; // solo puede moverse
    const capital = e.mapa.find(t => t.ciudad && t.dueno === 'bot');

    // Vecinos controlados a mano: (izq) ya es del bot y esta explorada,
    // (der) es tierra de nadie. Las de arriba/abajo se sacan de la ecuacion
    // haciendolas agua, que es intransitable.
    const izq = tileEn(e, capital.x - 1, capital.y);
    const der = tileEn(e, capital.x + 1, capital.y);
    const arriba = tileEn(e, capital.x, capital.y - 1);
    const abajo = tileEn(e, capital.x, capital.y + 1);
    if (!izq || !der || !arriba || !abajo) return; // capital en el borde: escenario no aplicable
    for (const t of [izq, der]) t.terreno = 'plains';
    for (const t of [arriba, abajo]) t.terreno = 'water';
    izq.dueno = 'bot';
    izq.descubiertoPor = ['bot'];
    der.dueno = null;
    der.descubiertoPor = ['bot']; // ya explorada: lo unico que la hace atractiva es que no tiene dueño

    aplicar(e, [{ tipo: 'UnidadReclutada', turno: e.turno, jugadorId: 'bot', datos: { x: capital.x, y: capital.y, tipo: 'warrior' } }]);
    jugarTurnoIA(e, 'bot', crearRng('paso-1'));

    expect(der.dueno).toBe('bot');
  });

  it('su porcentaje de territorio CRECE a lo largo de varias rondas', () => {
    const e = partidaConBot('territorio-2');
    e.jugadores.find(j => j.id === 'bot').recursos = { ...RICO };
    const antes = controlTerritorial(e, 'bot').tiles;

    jugarRondas(e, 20, 'crecer');

    const despues = controlTerritorial(e, 'bot').tiles;
    // Arranca con 1 casilla (su capital). Si solo diera vueltas sobre lo propio
    // este numero no se moveria.
    expect(despues).toBeGreaterThan(antes);
    expect(despues).toBeGreaterThanOrEqual(5);
  });

  it('la dificil expande mas que la facil con las mismas rondas y semilla', () => {
    const facil = partidaConBot('territorio-3', 'facil');
    const dificil = partidaConBot('territorio-3', 'dificil');
    for (const e of [facil, dificil]) e.jugadores.find(j => j.id === 'bot').recursos = { ...RICO };

    jugarRondas(facil, 20, 'comparar');
    jugarRondas(dificil, 20, 'comparar');

    expect(controlTerritorial(dificil, 'bot').tiles)
      .toBeGreaterThan(controlTerritorial(facil, 'bot').tiles);
  });

  it('sigue respetando un tope de ejercitos: expandir no es gastar todo en tropa', () => {
    const e = partidaConBot('territorio-4', 'normal');
    e.jugadores.find(j => j.id === 'bot').recursos = { ...RICO };

    jugarRondas(e, 10, 'tope');

    const ejercitos = e.mapa.filter(t => t.ejercito && t.ejercito.dueno === 'bot').length;
    const ciudades = e.mapa.filter(t => t.ciudad && t.dueno === 'bot').length;
    expect(ejercitos).toBeLessThanOrEqual(ciudades + PERFILES_DIFICULTAD.normal.topeEjercitosExtra);
  });

  it('funda mas de una ciudad cuando le sobran recursos (fundar dejo de ser lo ultimo)', () => {
    const e = partidaConBot('territorio-5');
    e.jugadores.find(j => j.id === 'bot').recursos = { ...RICO };

    jugarRondas(e, 10, 'fundar');

    expect(e.mapa.filter(t => t.ciudad && t.dueno === 'bot').length).toBeGreaterThan(1);
  });
});
