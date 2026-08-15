import { describe, it, expect } from 'vitest';
import { narrarRonda } from '../../src/domain/mapa/narradorLocal.js';

const JUGADORES = [
  { id: 'j1', nombre: 'Ana', civilizacion: 'Romanos' },
  { id: 'j2', nombre: 'Beto', civilizacion: 'Egipcios' }
];

describe('narrarRonda', () => {
  it('nombra al jugador que funda una ciudad', () => {
    const texto = narrarRonda(
      [{ tipo: 'CiudadFundada', jugadorId: 'j1', datos: { nombre: 'Roma', x: 3, y: 4 } }],
      JUGADORES
    );
    expect(texto).toContain('Ana');
    expect(texto).toContain('Roma');
  });

  it('describe una construccion', () => {
    const texto = narrarRonda(
      [{ tipo: 'EdificioConstruido', jugadorId: 'j2', datos: { edificio: 'granary', x: 1, y: 1 } }],
      JUGADORES
    );
    expect(texto).toContain('Beto');
    expect(texto.toLowerCase()).toContain('granero');
  });

  it('describe un reclutamiento', () => {
    // El campo real del evento es `tipo` (no `unidad`), ver reglas/militar.js:reclutar.
    const texto = narrarRonda(
      [{ tipo: 'UnidadReclutada', jugadorId: 'j1', datos: { tipo: 'archer', x: 2, y: 2 } }],
      JUGADORES
    );
    expect(texto).toContain('Ana');
    expect(texto.toLowerCase()).toContain('arquero');
  });

  it('describe un combate ganado por el atacante', () => {
    // Forma real (reglas/combate.js:atacar): jugadorId es siempre quien ataca; el evento
    // trae danoAtacante/danoDefensor/ganador, no un campo `dano` unico. El evento
    // UnidadDestruida solo trae {x, y}: no identifica al dueno de la unidad destruida,
    // asi que el narrador no puede nombrar al bando derrotado.
    const texto = narrarRonda(
      [
        {
          tipo: 'CombateResuelto',
          jugadorId: 'j1',
          datos: { desde: { x: 1, y: 1 }, hasta: { x: 1, y: 2 }, ganador: 'atacante', danoAtacante: 0, danoDefensor: 40 }
        },
        { tipo: 'UnidadDestruida', jugadorId: 'j1', datos: { x: 1, y: 2 } }
      ],
      JUGADORES
    );
    expect(texto).toContain('Ana');
  });

  it('describe un combate ganado por el defensor', () => {
    const texto = narrarRonda(
      [
        {
          tipo: 'CombateResuelto',
          jugadorId: 'j1',
          datos: { desde: { x: 1, y: 1 }, hasta: { x: 1, y: 2 }, ganador: 'defensor', danoAtacante: 30, danoDefensor: 0 }
        }
      ],
      JUGADORES
    );
    expect(texto).toContain('Ana');
  });

  it('destaca una ciudad capturada', () => {
    // Forma real (reglas/combate.js): datos solo trae {x, y}, sin `nombre` ni `anterior`.
    const texto = narrarRonda(
      [{ tipo: 'CiudadCapturada', jugadorId: 'j1', datos: { x: 5, y: 5 } }],
      JUGADORES
    );
    expect(texto).toContain('Ana');
  });

  it('anuncia la eliminacion de un jugador', () => {
    // Forma real (reglas/turnos.js:terminarTurno): jugadorId del evento es quien cerro el
    // turno, no el eliminado; el eliminado va en datos.jugadorId.
    const texto = narrarRonda(
      [{ tipo: 'JugadorEliminado', jugadorId: 'j1', datos: { jugadorId: 'j2' } }],
      JUGADORES
    );
    expect(texto).toContain('Beto');
  });

  it('anuncia el fin de la partida por dominacion', () => {
    // Forma real (reglas/turnos.js:evaluarVictoria): datos.ganador es un objeto
    // { jugadorId, tipoVictoria, turno } o null, no un id de jugador plano.
    const texto = narrarRonda(
      [{ tipo: 'PartidaTerminada', datos: { ganador: { jugadorId: 'j1', tipoVictoria: 'dominacion', turno: 12 } } }],
      JUGADORES
    );
    expect(texto).toContain('Ana');
  });

  it('anuncia el fin de la partida sin vencedores', () => {
    const texto = narrarRonda(
      [{ tipo: 'PartidaTerminada', datos: { ganador: null } }],
      JUGADORES
    );
    expect(typeof texto).toBe('string');
    expect(texto.length).toBeGreaterThan(0);
  });

  it('una ronda sin eventos relevantes devuelve una linea de transicion, nunca vacio', () => {
    const texto = narrarRonda([{ tipo: 'RondaCompletada', jugadorId: 'j1', datos: {} }], JUGADORES);
    expect(typeof texto).toBe('string');
    expect(texto.length).toBeGreaterThan(0);
  });

  it('es determinista: mismos eventos => mismo texto', () => {
    const eventos = [{ tipo: 'CiudadFundada', jugadorId: 'j1', datos: { nombre: 'Roma', x: 3, y: 4 } }];
    expect(narrarRonda(eventos, JUGADORES)).toBe(narrarRonda(eventos, JUGADORES));
  });

  it('no rompe con un jugadorId desconocido', () => {
    const texto = narrarRonda(
      [{ tipo: 'CiudadFundada', jugadorId: 'fantasma', datos: { nombre: 'X', x: 0, y: 0 } }],
      JUGADORES
    );
    expect(typeof texto).toBe('string');
    expect(texto.length).toBeGreaterThan(0);
  });

  it('no rompe con datos ausentes', () => {
    const texto = narrarRonda(
      [{ tipo: 'CiudadFundada', jugadorId: 'j1' }],
      JUGADORES
    );
    expect(typeof texto).toBe('string');
    expect(texto.length).toBeGreaterThan(0);
  });

  it('no muta los eventos que recibe', () => {
    const eventos = [{ tipo: 'CiudadFundada', jugadorId: 'j1', datos: { nombre: 'Roma', x: 1, y: 1 } }];
    const copia = structuredClone(eventos);
    narrarRonda(eventos, JUGADORES);
    expect(eventos).toEqual(copia);
  });
});
