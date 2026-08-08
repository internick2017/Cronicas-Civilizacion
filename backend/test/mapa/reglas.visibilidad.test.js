import { describe, it, expect } from 'vitest';
import { crearEstado } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { vistaJugador } from '../../src/domain/mapa/reglas/visibilidad.js';

const j = (n) => ({ id: `p${n}`, nombre: `J${n}`, civilizacion: `Civ${n}` });

function partidaIniciada() {
  const e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, j(1)));
  aplicar(e, unirse(e, j(2)));
  aplicar(e, iniciar(e));
  return e;
}

describe('vistaJugador', () => {
  it('muestra el area inicial propia y oculta la capital de p2 (regresion A2)', () => {
    const e = partidaIniciada();
    const vista = vistaJugador(e, 'p1');
    const capital1 = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
    const tileVista1 = vista.mapa.find(t => t.x === capital1.x && t.y === capital1.y);
    expect(tileVista1.descubierto).toBe(true);
    expect(tileVista1.ciudad.nombre).toBe(capital1.ciudad.nombre);

    const capital2 = e.mapa.find(t => t.ciudad && t.dueno === 'p2');
    const tileVista2 = vista.mapa.find(t => t.x === capital2.x && t.y === capital2.y);
    expect(tileVista2.descubierto).toBe(false);
    expect(tileVista2).not.toHaveProperty('ciudad');
    expect(tileVista2).not.toHaveProperty('dueno');
    expect(tileVista2).not.toHaveProperty('terreno');
    expect(tileVista2).not.toHaveProperty('recurso');
    expect(tileVista2).not.toHaveProperty('ejercito');
    expect(Object.keys(tileVista2).sort()).toEqual(['descubierto', 'x', 'y']);
  });

  it('ningun tile no descubierto filtra terreno ni ciudad, estructuralmente', () => {
    const e = partidaIniciada();
    const vista = vistaJugador(e, 'p1');
    for (const t of vista.mapa) {
      if (!t.descubierto) {
        expect(Object.keys(t).sort()).toEqual(['descubierto', 'x', 'y']);
      }
    }
  });

  it('tiles descubiertos no exponen descubiertoPor', () => {
    const e = partidaIniciada();
    const vista = vistaJugador(e, 'p1');
    for (const t of vista.mapa) {
      if (t.descubierto) {
        expect(t).not.toHaveProperty('descubiertoPor');
      }
    }
  });

  it('los recursos de p2 no aparecen en la vista de p1, en ningun lugar del JSON', () => {
    const e = partidaIniciada();
    aplicar(e, [{ tipo: 'RecursosProducidos', turno: 1, jugadorId: null, datos: { jugadorId: 'p2', produccion: { oro: 12345 } } }]);
    const vista = vistaJugador(e, 'p1');
    const jp2 = vista.jugadores.find(x => x.id === 'p2');
    expect(jp2).not.toHaveProperty('recursos');
    expect(JSON.stringify(vista)).not.toContain('12345');

    const jp1 = vista.jugadores.find(x => x.id === 'p1');
    expect(jp1).toHaveProperty('recursos');
  });

  it('la vista de p1 no revela en ningun campo la civilizacion de p2 fuera de jugadores publicos permitidos', () => {
    const e = partidaIniciada();
    const vista = vistaJugador(e, 'p1');
    // civilizacion es informacion publica permitida en jugadores, pero NO debe filtrarse
    // dentro de un tile no descubierto (p.ej. via ciudad.nombre que incluye la civ).
    const capital2 = e.mapa.find(t => t.ciudad && t.dueno === 'p2');
    const tileVista2 = vista.mapa.find(t => t.x === capital2.x && t.y === capital2.y);
    expect(JSON.stringify(tileVista2)).not.toContain('Civ2');
  });

  it('jugadores: el propio conserva recursos, id/nombre/civilizacion/activo pasan siempre', () => {
    const e = partidaIniciada();
    const vista = vistaJugador(e, 'p1');
    expect(vista.jugadores).toHaveLength(2);
    for (const jug of vista.jugadores) {
      expect(jug).toHaveProperty('id');
      expect(jug).toHaveProperty('nombre');
      expect(jug).toHaveProperty('civilizacion');
      expect(jug).toHaveProperty('activo');
    }
  });

  it('lanza JUGADOR_DESCONOCIDO si el id no esta en la partida', () => {
    const e = partidaIniciada();
    expect(() => vistaJugador(e, 'nadie')).toThrowError(expect.objectContaining({ codigo: 'JUGADOR_DESCONOCIDO' }));
  });

  it('resto del estado pasa intacto', () => {
    const e = partidaIniciada();
    const vista = vistaJugador(e, 'p1');
    expect(vista.id).toBe(e.id);
    expect(vista.nombre).toBe(e.nombre);
    expect(vista.estado).toBe(e.estado);
    expect(vista.turno).toBe(e.turno);
    expect(vista.indiceJugadorActual).toBe(e.indiceJugadorActual);
    expect(vista.config).toEqual(e.config);
    expect(vista.ganador).toBe(e.ganador);
    expect(vista.versionEsquema).toBe(e.versionEsquema);
  });

  it('no incluye semilla (permite recrear posiciones iniciales de rivales offline)', () => {
    const e = partidaIniciada();
    const vista = vistaJugador(e, 'p1');
    expect('semilla' in vista).toBe(false);
  });

  it('la semilla no aparece en ningun lugar del JSON de la vista', () => {
    const e = crearEstado({ nombre: 'T', semilla: 'semilla-secreta-xyz' });
    aplicar(e, unirse(e, j(1)));
    aplicar(e, unirse(e, j(2)));
    aplicar(e, iniciar(e));
    const vista = vistaJugador(e, 'p1');
    expect(JSON.stringify(vista)).not.toContain('semilla-secreta-xyz');
  });

  it('no muta el estado original', () => {
    const e = partidaIniciada();
    const snapshot = JSON.stringify(e);
    const vista = vistaJugador(e, 'p1');
    vista.mapa[0].x = 999;
    vista.jugadores[0].nombre = 'HACKED';
    if (vista.mapa[0].ciudad) vista.mapa[0].ciudad.nombre = 'HACKED';
    expect(JSON.stringify(e)).toBe(snapshot);
  });
});
