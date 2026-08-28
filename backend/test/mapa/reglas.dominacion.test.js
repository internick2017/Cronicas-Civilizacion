import { describe, it, expect } from 'vitest';
import { crearEstado } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { controlTerritorial, rivalesDominantes } from '../../src/domain/mapa/reglas/dominacion.js';
import { vistaJugador } from '../../src/domain/mapa/reglas/visibilidad.js';
import {
  PORCENTAJE_VICTORIA_DOMINACION,
  UMBRAL_AVISO_DOMINACION,
} from '../../src/domain/mapa/constantes.js';

const j = (n) => ({ id: `p${n}`, nombre: `J${n}`, civilizacion: `Civ${n}` });

// Mapa 3x3 controlado a mano: la generacion por ruido no permite fijar cuanta
// agua hay, y el denominador (solo tierra) es justamente lo que hay que probar.
function partida3x3() {
  const e = crearEstado({ nombre: 'T', semilla: 's1' });
  // El tamano minimo valido es 10, asi que el mapa chico se arma a mano despues
  // de crear el estado (mismo truco que test/mapa/reglas.turnos.test.js).
  e.config.tamanoMapa = 3;
  e.mapa = [];
  for (let y = 0; y < 3; y++) {
    for (let x = 0; x < 3; x++) {
      e.mapa.push({ x, y, terreno: 'plains', recurso: null, dueno: null, ciudad: null, ejercito: null, descubiertoPor: [] });
    }
  }
  aplicar(e, unirse(e, j(1)));
  aplicar(e, unirse(e, j(2)));
  aplicar(e, iniciar(e));
  for (const tile of e.mapa) {
    tile.ciudad = null;
    tile.dueno = null;
  }
  return e;
}

const poseer = (e, jugadorId, coords) => {
  for (const [x, y] of coords) {
    e.mapa.find(t => t.x === x && t.y === y).dueno = jugadorId;
  }
};

describe('controlTerritorial', () => {
  it('mide sobre la tierra, no sobre el mapa completo: el agua no entra en el denominador', () => {
    const e = partida3x3();
    e.mapa.find(t => t.x === 2 && t.y === 0).terreno = 'water';
    e.mapa.find(t => t.x === 2 && t.y === 1).terreno = 'water';
    poseer(e, 'p1', [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]]);

    const control = controlTerritorial(e, 'p1');
    expect(control.totalTierra).toBe(7);
    expect(control.tiles).toBe(5);
    expect(control.porcentaje).toBeCloseTo(5 / 7);
    // Contra el mapa entero daria 5/9 = 0.55, por debajo del umbral: si algun dia
    // el denominador cambia a "todo el mapa", este numero lo delata.
    expect(control.porcentaje).not.toBeCloseTo(5 / 9);
  });

  it('un jugador sin territorio da 0, no NaN ni division por cero', () => {
    const e = partida3x3();
    expect(controlTerritorial(e, 'p2').porcentaje).toBe(0);
    expect(controlTerritorial(e, 'p2').tiles).toBe(0);
  });

  it('el agua nunca cuenta como territorio propio aunque tenga dueno cargado', () => {
    const e = partida3x3();
    const mar = e.mapa.find(t => t.x === 2 && t.y === 2);
    mar.terreno = 'water';
    mar.dueno = 'p1';
    expect(controlTerritorial(e, 'p1').tiles).toBe(0);
  });
});

describe('rivalesDominantes (aviso de rival peligroso)', () => {
  it('avisa del rival que cruza el umbral, sin decir DONDE esta su territorio', () => {
    const e = partida3x3();
    // 4 de 9 = 44% >= 40%, pero < 60%: alarma sin victoria todavia.
    poseer(e, 'p2', [[0, 0], [1, 0], [2, 0], [0, 1]]);
    expect(4 / 9).toBeGreaterThanOrEqual(UMBRAL_AVISO_DOMINACION);
    expect(4 / 9).toBeLessThan(PORCENTAJE_VICTORIA_DOMINACION);

    const avisos = rivalesDominantes(e, 'p1');
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toEqual({
      id: 'p2',
      nombre: 'J2',
      civilizacion: 'Civ2',
      porcentaje: 4 / 9,
    });
    // Lo unico que se filtra es "cuanto", nunca "donde": la niebla sigue en pie.
    expect(Object.keys(avisos[0])).not.toContain('tiles');
  });

  it('no avisa por debajo del umbral', () => {
    const e = partida3x3();
    poseer(e, 'p2', [[0, 0], [1, 0]]); // 2/9 = 22%
    expect(rivalesDominantes(e, 'p1')).toEqual([]);
  });

  it('nunca se avisa a si mismo: el propio porcentaje ya lo ve en su panel', () => {
    const e = partida3x3();
    poseer(e, 'p1', [[0, 0], [1, 0], [2, 0], [0, 1]]);
    expect(rivalesDominantes(e, 'p1')).toEqual([]);
  });

  it('ignora a los jugadores eliminados', () => {
    const e = partida3x3();
    poseer(e, 'p2', [[0, 0], [1, 0], [2, 0], [0, 1]]);
    e.jugadores.find(x => x.id === 'p2').activo = false;
    expect(rivalesDominantes(e, 'p1')).toEqual([]);
  });
});

describe('la vista expone la dominacion igual que la produccion', () => {
  it('el jugador propio ve su control territorial', () => {
    const e = partida3x3();
    poseer(e, 'p1', [[0, 0], [1, 0]]);
    const yo = vistaJugador(e, 'p1').jugadores.find(x => x.id === 'p1');
    expect(yo.dominacion).toEqual({ tiles: 2, totalTierra: 9, porcentaje: 2 / 9 });
  });

  it('NO expone el control territorial de los demas (filtraria el mapa oculto)', () => {
    const e = partida3x3();
    poseer(e, 'p2', [[0, 0], [1, 0]]);
    const ajeno = vistaJugador(e, 'p1').jugadores.find(x => x.id === 'p2');
    expect(ajeno).not.toHaveProperty('dominacion');
  });

  it('el aviso de rival dominante viaja en la raiz de la vista', () => {
    const e = partida3x3();
    poseer(e, 'p2', [[0, 0], [1, 0], [2, 0], [0, 1]]);
    expect(vistaJugador(e, 'p1').dominacionRivales).toEqual([
      { id: 'p2', nombre: 'J2', civilizacion: 'Civ2', porcentaje: 4 / 9 },
    ]);
    expect(vistaJugador(e, 'p2').dominacionRivales).toEqual([]);
  });

  // La razon de ser del modulo: lo que muestra la barra y lo que decide la
  // victoria tienen que salir del MISMO calculo (mismo patron que produccion).
  it('el porcentaje mostrado es el que dispara la victoria en el mismo umbral', () => {
    const e = partida3x3();
    poseer(e, 'p1', [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1], [2, 1]]); // 6/9 = 66%
    const yo = vistaJugador(e, 'p1').jugadores.find(x => x.id === 'p1');
    expect(yo.dominacion.porcentaje).toBeGreaterThanOrEqual(PORCENTAJE_VICTORIA_DOMINACION);
  });
});
