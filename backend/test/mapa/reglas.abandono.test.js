import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { abandonar } from '../../src/domain/mapa/reglas/abandono.js';
import { terminarTurno } from '../../src/domain/mapa/reglas/turnos.js';
import { ReglaError } from '../../src/domain/mapa/errores.js';

const j = (n) => ({ id: `p${n}`, nombre: `J${n}`, civilizacion: `Civ${n}` });

function partidaCon(cantidad) {
  const e = crearEstado({ nombre: 'T', semilla: 's1' });
  for (let i = 1; i <= cantidad; i++) aplicar(e, unirse(e, j(i)));
  aplicar(e, iniciar(e));
  return e;
}

const turnoDe = (e) => e.jugadores[e.indiceJugadorActual].id;

let e;
beforeEach(() => { e = partidaCon(3); });

describe('abandonar la partida', () => {
  it('deja al jugador inactivo', () => {
    aplicar(e, abandonar(e, 'p2'));
    expect(e.jugadores.find(x => x.id === 'p2').activo).toBe(false);
  });

  it('se puede abandonar aunque NO sea tu turno', () => {
    expect(turnoDe(e)).toBe('p1');
    expect(() => aplicar(e, abandonar(e, 'p3'))).not.toThrow();
    expect(e.jugadores.find(x => x.id === 'p3').activo).toBe(false);
    // El turno de quien estaba jugando no se toca.
    expect(turnoDe(e)).toBe('p1');
  });

  it('si se va en su propio turno, el turno pasa al siguiente', () => {
    expect(turnoDe(e)).toBe('p1');
    aplicar(e, abandonar(e, 'p1'));
    expect(turnoDe(e)).toBe('p2');
  });

  // La razon de ser de esta regla: sin esto, el que se va deja la partida
  // trabada esperando a alguien que no vuelve nunca.
  it('los que quedan pueden seguir jugando despues del abandono', () => {
    aplicar(e, abandonar(e, 'p1'));
    expect(() => aplicar(e, terminarTurno(e, 'p2'))).not.toThrow();
    expect(turnoDe(e)).toBe('p3');
    expect(() => aplicar(e, terminarTurno(e, 'p3'))).not.toThrow();
    expect(turnoDe(e)).toBe('p2'); // saltea a p1, que ya no juega
  });

  it('si queda un solo jugador, la partida termina y ese gana', () => {
    aplicar(e, abandonar(e, 'p2'));
    expect(e.estado).toBe('jugando');

    aplicar(e, abandonar(e, 'p3'));
    expect(e.estado).toBe('terminado');
    expect(e.ganador).toMatchObject({ jugadorId: 'p1', tipoVictoria: 'ultimo_en_pie' });
  });

  it('no se puede abandonar dos veces', () => {
    aplicar(e, abandonar(e, 'p2'));
    expect(() => abandonar(e, 'p2')).toThrow(ReglaError);
  });

  it('no se puede abandonar una partida que todavia no empezo', () => {
    const sinIniciar = crearEstado({ nombre: 'T', semilla: 's1' });
    aplicar(sinIniciar, unirse(sinIniciar, j(1)));
    expect(() => abandonar(sinIniciar, 'p1')).toThrow(ReglaError);
  });

  it('rechaza a un jugador que no esta en la partida', () => {
    expect(() => abandonar(e, 'fantasma')).toThrow(ReglaError);
  });
});
