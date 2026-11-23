import { describe, it, expect } from 'vitest';
import { crearEstado } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { terminarTurno } from '../../src/domain/mapa/reglas/turnos.js';
import { responderEvento, cerrarRondaEventos, EVENTOS_RONDA } from '../../src/domain/mapa/reglas/eventosRonda.js';
import { mecanicaActiva } from '../../src/domain/mapa/reglas/modo.js';

function partida(mecanicas) {
  const e = crearEstado({ nombre: 'ev', semilla: 'ev-1', config: { tamanoMapa: 20, modoTurno: 'secuencial', ...(mecanicas && { mecanicas }) } });
  aplicar(e, unirse(e, { id: 'a', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'b', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  return e;
}

describe('eventos de ronda', () => {
  it('empiezan apagados y no pasa nada si nadie los prende', () => {
    const e = partida();
    expect(mecanicaActiva(e, 'eventos')).toBe(false);
    expect(cerrarRondaEventos(e, 'a', () => 0)).toEqual([]);
  });

  it('prendidos, llega un evento y queda esperando respuesta', () => {
    const e = partida({ eventos: true });
    const evs = cerrarRondaEventos(e, 'a', () => 0); // rng 0: siempre ocurre, al primer jugador, primer tipo
    expect(evs).toHaveLength(1);
    aplicar(e, evs);
    expect(e.jugadores[0].eventoPendiente.tipo).toBe('peste');
  });

  it('pagar y aceptar mueven los recursos que dice la tabla, sin bajar de cero', () => {
    const e = partida({ eventos: true });
    aplicar(e, cerrarRondaEventos(e, 'a', () => 0));
    const j = e.jugadores[0];
    j.recursos = { ...j.recursos, gold: 100, food: 10 };
    aplicar(e, responderEvento(e, 'a', { opcion: 'aceptar' }));
    expect(j.recursos.food).toBe(0); // la peste pide 30 y solo habia 10
    expect(j.recursos.gold).toBe(80);
    expect(j.eventoPendiente).toBeUndefined();
  });

  it('no se puede pagar sin plata ni responder sin evento', () => {
    const e = partida({ eventos: true });
    expect(() => responderEvento(e, 'a', { opcion: 'pagar' })).toThrow(/ningún evento/);
    aplicar(e, cerrarRondaEventos(e, 'a', () => 0));
    e.jugadores[0].recursos.gold = 0;
    expect(() => responderEvento(e, 'a', { opcion: 'pagar' })).toThrow(/insuficientes/);
    expect(() => responderEvento(e, 'a', { opcion: 'x' })).toThrow(/opción/);
  });

  it('lo no contestado se acepta al cerrar la ronda siguiente', () => {
    const e = partida({ eventos: true });
    aplicar(e, cerrarRondaEventos(e, 'a', () => 0));
    const evs = cerrarRondaEventos(e, 'a', () => 0.99); // sin evento nuevo
    expect(evs.map(x => x.tipo)).toEqual(['EventoResuelto', 'EventoResuelto'].slice(0, 1));
    expect(evs[0].datos.opcion).toBe('aceptar');
  });

  it('toda opción de la tabla es un cambio de recursos conocido', () => {
    for (const o of Object.values(EVENTOS_RONDA)) {
      for (const op of [o.pagar, o.aceptar]) {
        for (const r of Object.keys(op)) expect(['food', 'gold', 'wood', 'stone']).toContain(r);
      }
    }
  });

  it('cerrar rondas de verdad con la mecánica prendida no rompe la partida', () => {
    const e = partida({ eventos: true });
    for (let i = 0; i < 30 && e.estado === 'jugando'; i++) {
      const id = e.jugadores[e.indiceJugadorActual].id;
      aplicar(e, terminarTurno(e, id));
    }
    expect(e.jugadores.every(j => Object.values(j.recursos).every(v => v >= 0))).toBe(true);
  });
});
