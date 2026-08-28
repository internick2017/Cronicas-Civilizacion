import { describe, it, expect } from 'vitest';
import { crearEstado, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { terminarTurno } from '../../src/domain/mapa/reglas/turnos.js';
import { vistaJugador } from '../../src/domain/mapa/reglas/visibilidad.js';
import { PRODUCCION_BASE_CIUDAD, BONO_TERRENO_PRODUCCION } from '../../src/domain/mapa/constantes.js';

const j = (n) => ({ id: `p${n}`, nombre: `J${n}`, civilizacion: `Civ${n}` });

function partidaIniciada() {
  const e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, j(1)));
  aplicar(e, unirse(e, j(2)));
  aplicar(e, iniciar(e));
  return e;
}

describe('produccion por turno en la vista', () => {
  it('la expone al jugador propio y la calcula con base + terreno de su capital', () => {
    const e = partidaIniciada();
    const capital = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
    const bono = BONO_TERRENO_PRODUCCION[capital.terreno] ?? {};

    const esperada = { ...PRODUCCION_BASE_CIUDAD };
    for (const [recurso, cantidad] of Object.entries(bono)) {
      esperada[recurso] = (esperada[recurso] ?? 0) + cantidad;
    }

    expect(vistaJugador(e, 'p1').jugadores.find(x => x.id === 'p1').produccion).toEqual(esperada);
  });

  it('NO expone la produccion de los demas, igual que los recursos', () => {
    const e = partidaIniciada();
    const ajeno = vistaJugador(e, 'p1').jugadores.find(x => x.id === 'p2');
    expect(ajeno).not.toHaveProperty('produccion');
    expect(ajeno).not.toHaveProperty('recursos');
  });

  // La razon de ser de todo esto: el numero que se muestra tiene que ser el
  // mismo que despues se suma de verdad. Si algun dia se toca una formula y no
  // la otra, este test lo caza.
  it('lo mostrado coincide con lo que efectivamente se suma al cerrar el turno', () => {
    const e = partidaIniciada();
    const antesVista = vistaJugador(e, 'p1').jugadores.find(x => x.id === 'p1');
    const anunciada = antesVista.produccion;
    const recursosAntes = { ...antesVista.recursos };

    // El turno cierra recien cuando pasaron todos los jugadores.
    aplicar(e, terminarTurno(e, 'p1'));
    aplicar(e, terminarTurno(e, 'p2'));

    const recursosDespues = vistaJugador(e, 'p1').jugadores.find(x => x.id === 'p1').recursos;
    for (const [recurso, cantidad] of Object.entries(anunciada)) {
      expect(recursosDespues[recurso] - (recursosAntes[recurso] ?? 0)).toBe(cantidad);
    }
  });

  it('crece al fundar una segunda ciudad', () => {
    const e = partidaIniciada();
    const antes = vistaJugador(e, 'p1').jugadores.find(x => x.id === 'p1').produccion;

    // Se agrega una ciudad a mano sobre una casilla descubierta y libre: lo que
    // se prueba es el calculo de la vista, no la regla de fundar.
    const libre = e.mapa.find(t =>
      t.descubiertoPor.includes('p1') && !t.ciudad && t.terreno !== 'water');
    const tile = tileEn(e, libre.x, libre.y);
    tile.ciudad = { nombre: 'Segunda', nivel: 1, poblacion: 1, edificios: [] };
    tile.dueno = 'p1';

    const despues = vistaJugador(e, 'p1').jugadores.find(x => x.id === 'p1').produccion;
    expect(despues.food).toBeGreaterThan(antes.food);
  });
});
