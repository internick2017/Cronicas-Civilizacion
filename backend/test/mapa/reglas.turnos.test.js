import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado, jugadorPorId } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { terminarTurno } from '../../src/domain/mapa/reglas/turnos.js';
import { PRODUCCION_BASE_CIUDAD, BONO_TERRENO_PRODUCCION, EDIFICIOS } from '../../src/domain/mapa/constantes.js';

// Mapa chico 3x3 armado a mano: tile (0,0) plains con ciudad de p1 (con granary),
// tile (1,0) forest sin dueno, resto plains sin dueno/ciudad.
function mapaChico() {
  const tiles = [];
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      tiles.push({ x, y, terreno: 'plains', recurso: null, dueno: null, ciudad: null, ejercito: null, descubiertoPor: [] });
    }
  }
  return tiles;
}

let e;
beforeEach(() => {
  e = crearEstado({ nombre: 'T', semilla: 's1' });
  e.config.tamanoMapa = 3;
  e.mapa = mapaChico();
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e)); // iniciar() funda una capital automatica por jugador; la limpiamos abajo
  // para tener control total sobre ciudades/dueños en cada test.
  for (const t of e.mapa) {
    t.ciudad = null;
    t.dueno = null;
  }
});

function fundarACiudad(estado, jugadorId, x, y, { terreno = 'plains', edificios = [] } = {}) {
  const t = estado.mapa[y * estado.config.tamanoMapa + x];
  t.terreno = terreno;
  t.dueno = jugadorId;
  t.ciudad = { nombre: 'C', nivel: 1, poblacion: 500, edificios };
}

describe('terminarTurno', () => {
  it('p1 termina turno: solo TurnoAvanzado a p2, sin produccion (ronda no cierra)', () => {
    const evs = terminarTurno(e, 'p1');
    expect(evs.map(ev => ev.tipo)).toEqual(['TurnoAvanzado']);
    expect(evs[0].datos).toEqual({ indiceJugadorActual: 1, turno: 1 });
  });

  it('p2 termina turno: cierra la ronda con produccion, RondaCompletada y turno incrementado', () => {
    fundarACiudad(e, 'p1', 0, 0, { terreno: 'forest', edificios: ['granary'] });
    fundarACiudad(e, 'p2', 2, 2, { terreno: 'plains' });

    aplicar(e, terminarTurno(e, 'p1')); // ahora es turno de p2
    const evs = terminarTurno(e, 'p2');

    expect(evs.map(ev => ev.tipo)).toEqual([
      'TurnoAvanzado', 'RecursosProducidos', 'RecursosProducidos', 'RondaCompletada',
    ]);
    expect(evs[0].datos).toEqual({ indiceJugadorActual: 0, turno: 2 });

    // Produccion exacta de p1: base + bono de forest + produccion de granary.
    const producidoP1 = evs.find(ev => ev.tipo === 'RecursosProducidos' && ev.datos.jugadorId === 'p1').datos.produccion;
    const esperadoP1 = {};
    for (const [r, c] of Object.entries(PRODUCCION_BASE_CIUDAD)) esperadoP1[r] = (esperadoP1[r] ?? 0) + c;
    for (const [r, c] of Object.entries(BONO_TERRENO_PRODUCCION.forest)) esperadoP1[r] = (esperadoP1[r] ?? 0) + c;
    for (const [r, c] of Object.entries(EDIFICIOS.granary.produccion)) esperadoP1[r] = (esperadoP1[r] ?? 0) + c;
    expect(producidoP1).toEqual(esperadoP1);
    // Verificacion concreta contra las constantes reales del proyecto.
    expect(producidoP1).toEqual({ food: 5 + 1 + 3, gold: 3, culture: 2, wood: 3 });

    // Produccion exacta de p2: base + bono de plains, sin edificios.
    const producidoP2 = evs.find(ev => ev.tipo === 'RecursosProducidos' && ev.datos.jugadorId === 'p2').datos.produccion;
    expect(producidoP2).toEqual({ food: 5 + 2, gold: 3 + 1, culture: 2 });
  });

  it('jugador sin ciudades queda eliminado al cierre y el orden de turnos lo saltea', () => {
    // Un tercer jugador con ciudad propia se mantiene activo para que la eliminacion de p2
    // no dispare 'ultimo_en_pie' y este test se enfoque solo en la eliminacion + el salteo de turno.
    const e3 = crearEstado({ nombre: 'T3', semilla: 's3' });
    e3.config.tamanoMapa = 3;
    e3.mapa = mapaChico();
    aplicar(e3, unirse(e3, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
    aplicar(e3, unirse(e3, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
    aplicar(e3, unirse(e3, { id: 'p3', nombre: 'C', civilizacion: 'Aztecas' }));
    aplicar(e3, iniciar(e3));
    for (const t of e3.mapa) { t.ciudad = null; t.dueno = null; }

    fundarACiudad(e3, 'p1', 0, 0); // p2 no tiene ciudades
    fundarACiudad(e3, 'p3', 1, 1);

    aplicar(e3, terminarTurno(e3, 'p1')); // turno de p2
    aplicar(e3, terminarTurno(e3, 'p2')); // turno de p3
    const evsCierre = terminarTurno(e3, 'p3'); // cierra la ronda, vuelve a p1
    // p2 sigue activo al momento de producir (la eliminacion se evalua despues), asi que
    // todos los jugadores activos reciben su evento de produccion (el de p2 queda vacio).
    expect(evsCierre.map(ev => ev.tipo)).toEqual([
      'TurnoAvanzado', 'RecursosProducidos', 'RecursosProducidos', 'RecursosProducidos', 'JugadorEliminado', 'RondaCompletada',
    ]);
    const produccionesPorJugador = evsCierre
      .filter(ev => ev.tipo === 'RecursosProducidos')
      .map(ev => ev.datos.jugadorId);
    expect(produccionesPorJugador).toEqual(['p1', 'p2', 'p3']);
    expect(evsCierre.find(ev => ev.tipo === 'RecursosProducidos' && ev.datos.jugadorId === 'p2').datos.produccion).toEqual({});
    expect(evsCierre.find(ev => ev.tipo === 'JugadorEliminado').datos.jugadorId).toBe('p2');

    aplicar(e3, evsCierre);
    expect(jugadorPorId(e3, 'p2').activo).toBe(false);

    // p1 vuelve a jugar; al terminar su turno, se saltea a p2 (eliminado) y avanza a p3.
    const evsSiguiente = terminarTurno(e3, 'p1');
    expect(evsSiguiente[0].datos.indiceJugadorActual).toBe(2);
  });

  it('p1 dueno del 60% de la TIERRA (no del mapa total, agua no cuenta) -> PartidaTerminada dominacion en el turno correcto (regresion M5 + ruling tierra-only)', () => {
    // 2 de los 9 tiles son agua (nunca son de nadie): (2,0) y (2,1).
    // Tierra = 7 tiles. p1 posee 5 tiles de tierra -> 5/7 ≈ 71.4% >= 60%.
    // A proposito, 5/9 (total del mapa) = 55.6% < 60%: si el calculo usara el mapa
    // completo en vez de solo tierra, esta victoria NO deberia disparar. Este test
    // verifica explicitamente que el denominador es la tierra, no el mapa entero.
    e.mapa[0 * 3 + 2].terreno = 'water'; // (2,0)
    e.mapa[1 * 3 + 2].terreno = 'water'; // (2,1)
    const tilesDeTierra = e.mapa.filter(t => t.terreno !== 'water');
    expect(tilesDeTierra.length).toBe(7);

    fundarACiudad(e, 'p1', 0, 0);
    fundarACiudad(e, 'p2', 1, 2);
    const coordsP1 = [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]]; // 5 tiles de tierra
    for (const [x, y] of coordsP1) {
      e.mapa[y * 3 + x].dueno = 'p1';
    }
    expect(5 / 9).toBeLessThan(0.6); // no alcanzaria el umbral contra el mapa total
    expect(5 / 7).toBeGreaterThanOrEqual(0.6); // si alcanza el umbral contra la tierra

    aplicar(e, terminarTurno(e, 'p1')); // turno de p2, ronda 1 sigue activa (indice 0->1)
    const evsCierre = terminarTurno(e, 'p2'); // cierra ronda: turno actual (1) -> nuevo turno 2

    const evVictoria = evsCierre.find(ev => ev.tipo === 'PartidaTerminada');
    expect(evVictoria).toBeDefined();
    expect(evVictoria.datos.ganador).toEqual({ jugadorId: 'p1', tipoVictoria: 'dominacion', turno: 1 });
    expect(evsCierre[0].datos.turno).toBe(2); // TurnoAvanzado ya con el turno incrementado
  });

  it('eliminar a p2 (unico jugador activo restante) da PartidaTerminada ultimo_en_pie', () => {
    fundarACiudad(e, 'p1', 0, 0); // p2 sin ciudades -> se elimina al cerrar ronda

    aplicar(e, terminarTurno(e, 'p1'));
    const evsCierre = terminarTurno(e, 'p2');

    expect(evsCierre.map(ev => ev.tipo)).toEqual([
      'TurnoAvanzado', 'RecursosProducidos', 'RecursosProducidos', 'JugadorEliminado', 'RondaCompletada', 'PartidaTerminada',
    ]);
    const evVictoria = evsCierre.find(ev => ev.tipo === 'PartidaTerminada');
    expect(evVictoria.datos.ganador).toEqual({ jugadorId: 'p1', tipoVictoria: 'ultimo_en_pie', turno: 1 });
  });

  it('REGRESION: el jugador del indice 0 eliminado en el mismo cierre no deja el turno trabado', () => {
    // p1 (indice 0) llega al cierre de ronda sin ciudades y se elimina en ese mismo cierre.
    // El indice guardado en TurnoAvanzado debe saltear a p1 y apuntar a alguien activo,
    // para que la partida no quede trabada (nadie podria volver a jugar si quedara en p1).
    const e3 = crearEstado({ nombre: 'T4', semilla: 's4' });
    e3.config.tamanoMapa = 3;
    e3.mapa = mapaChico();
    aplicar(e3, unirse(e3, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
    aplicar(e3, unirse(e3, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
    aplicar(e3, unirse(e3, { id: 'p3', nombre: 'C', civilizacion: 'Aztecas' }));
    aplicar(e3, iniciar(e3));
    for (const t of e3.mapa) { t.ciudad = null; t.dueno = null; }

    // p1 sin ciudades; p2 y p3 con ciudades para que la partida siga (2 activos post-cierre).
    fundarACiudad(e3, 'p2', 1, 0);
    fundarACiudad(e3, 'p3', 2, 0);

    aplicar(e3, terminarTurno(e3, 'p1')); // turno de p2
    aplicar(e3, terminarTurno(e3, 'p2')); // turno de p3
    const evsCierre = terminarTurno(e3, 'p3'); // cierra ronda: el avance naive apuntaria a p1 (indice 0), que se elimina aca mismo

    expect(evsCierre.map(ev => ev.tipo)).toEqual([
      'TurnoAvanzado', 'RecursosProducidos', 'RecursosProducidos', 'RecursosProducidos', 'JugadorEliminado', 'RondaCompletada',
    ]);
    expect(evsCierre.find(ev => ev.tipo === 'JugadorEliminado').datos.jugadorId).toBe('p1');

    const indiceFinal = evsCierre[0].datos.indiceJugadorActual;
    aplicar(e3, evsCierre);

    // (a) el indice guardado apunta a un jugador activo, no al recien eliminado p1.
    const jugadorFinal = e3.jugadores[indiceFinal];
    expect(jugadorFinal.id).not.toBe('p1');
    expect(jugadorFinal.activo).toBe(true);

    // (b) ese jugador puede efectivamente terminar su turno (no da NO_ES_TU_TURNO / soft-lock).
    expect(() => terminarTurno(e3, jugadorFinal.id)).not.toThrow();
  });

  it('sin jugadores activos tras las eliminaciones del cierre -> PartidaTerminada como empate (ganador null)', () => {
    // Ningun jugador fundo ciudad: al cerrar la primera ronda, ambos quedan sin ciudades
    // y se eliminan en el mismo cierre. No debe quedar la partida "jugando" en silencio:
    // debe terminar explicitamente como empate.
    aplicar(e, terminarTurno(e, 'p1')); // turno de p2
    const evsCierre = terminarTurno(e, 'p2'); // cierra ronda; p1 y p2 sin ciudades

    expect(evsCierre.map(ev => ev.tipo)).toEqual([
      'TurnoAvanzado', 'RecursosProducidos', 'RecursosProducidos', 'JugadorEliminado', 'JugadorEliminado', 'RondaCompletada', 'PartidaTerminada',
    ]);
    const evVictoria = evsCierre.find(ev => ev.tipo === 'PartidaTerminada');
    expect(evVictoria.datos.ganador).toBeNull();

    aplicar(e, evsCierre);
    expect(e.estado).toBe('terminado');
    expect(e.ganador).toBeNull();
  });

  it('terminar turno con partida no activa da PARTIDA_NO_ACTIVA', () => {
    const e2 = crearEstado({ nombre: 'T2', semilla: 's2' });
    aplicar(e2, unirse(e2, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
    expect(() => terminarTurno(e2, 'p1')).toThrowError(expect.objectContaining({ codigo: 'PARTIDA_NO_ACTIVA' }));
  });

  it('terminar turno fuera de turno da NO_ES_TU_TURNO', () => {
    expect(() => terminarTurno(e, 'p2')).toThrowError(expect.objectContaining({ codigo: 'NO_ES_TU_TURNO' }));
  });
});
