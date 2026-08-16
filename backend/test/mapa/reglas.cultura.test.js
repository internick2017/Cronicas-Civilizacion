import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { adoptarRasgo, radioVision, bonoDefensaPorRasgos, rasgosDe } from '../../src/domain/mapa/reglas/cultura.js';
import { producirParaJugador } from '../../src/domain/mapa/reglas/turnos.js';
import { vistaJugador } from '../../src/domain/mapa/reglas/visibilidad.js';
import { moverEjercito } from '../../src/domain/mapa/reglas/movimiento.js';
import { evento } from '../../src/domain/mapa/reglas/comun.js';
import { RASGOS_CULTURALES } from '../../src/domain/mapa/constantes.js';
import { ReglaError } from '../../src/domain/mapa/errores.js';

function crearPartida() {
  const e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  return e;
}

let e;
beforeEach(() => { e = crearPartida(); });

const darCultura = (jugadorId, cantidad) => {
  e.jugadores.find(j => j.id === jugadorId).recursos.culture = cantidad;
};

describe('adoptar rasgos culturales', () => {
  it('cobra la cultura y deja el rasgo adoptado', () => {
    darCultura('p1', 100);
    aplicar(e, adoptarRasgo(e, 'p1', { rasgo: 'gastronomia' }));

    const jugador = e.jugadores.find(j => j.id === 'p1');
    expect(rasgosDe(jugador)).toContain('gastronomia');
    expect(jugador.recursos.culture).toBe(100 - RASGOS_CULTURALES.gastronomia.costo);
  });

  it('no se puede adoptar sin cultura suficiente', () => {
    darCultura('p1', 0);
    expect(() => adoptarRasgo(e, 'p1', { rasgo: 'gastronomia' })).toThrow(ReglaError);
  });

  it('no se puede adoptar dos veces el mismo rasgo', () => {
    darCultura('p1', 500);
    aplicar(e, adoptarRasgo(e, 'p1', { rasgo: 'teatro' }));
    expect(() => adoptarRasgo(e, 'p1', { rasgo: 'teatro' })).toThrow(ReglaError);
  });

  it('rechaza un rasgo inexistente', () => {
    darCultura('p1', 500);
    expect(() => adoptarRasgo(e, 'p1', { rasgo: 'brujeria' })).toThrow(ReglaError);
  });

  it('son acumulativos: se pueden tener todos', () => {
    darCultura('p1', 1000);
    for (const rasgo of Object.keys(RASGOS_CULTURALES)) {
      aplicar(e, adoptarRasgo(e, 'p1', { rasgo }));
    }
    expect(rasgosDe(e.jugadores.find(j => j.id === 'p1'))).toHaveLength(Object.keys(RASGOS_CULTURALES).length);
  });
});

describe('efectos de los rasgos', () => {
  it('gastronomia suma comida POR ciudad', () => {
    darCultura('p1', 100);
    const antes = producirParaJugador(e, 'p1').food;
    aplicar(e, adoptarRasgo(e, 'p1', { rasgo: 'gastronomia' }));
    const despues = producirParaJugador(e, 'p1').food;

    expect(despues - antes).toBe(RASGOS_CULTURALES.gastronomia.produccionCiudad.food);
  });

  it('teatro hace que la cultura alimente mas cultura', () => {
    darCultura('p1', 100);
    const antes = producirParaJugador(e, 'p1').culture;
    aplicar(e, adoptarRasgo(e, 'p1', { rasgo: 'teatro' }));
    expect(producirParaJugador(e, 'p1').culture).toBeGreaterThan(antes);
  });

  it('el idioma agranda el radio de vision', () => {
    const jugador = e.jugadores.find(j => j.id === 'p1');
    expect(radioVision(jugador)).toBe(1);
    darCultura('p1', 100);
    aplicar(e, adoptarRasgo(e, 'p1', { rasgo: 'idioma' }));
    expect(radioVision(jugador)).toBe(2);
  });

  it('con idioma, mover descubre mas casillas de una vez', () => {
    const capital = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
    const destino = { x: capital.x, y: capital.y + 1 };
    // Terreno caminable y sin dueño para que el movimiento sea valido.
    tileEn(e, destino.x, destino.y).terreno = 'plains';
    aplicar(e, [evento('UnidadReclutada', e, 'p1', { x: capital.x, y: capital.y, tipo: 'warrior' })]);

    const sinIdioma = moverEjercito(e, 'p1', { desde: { x: capital.x, y: capital.y }, hasta: destino })
      .find(ev => ev.tipo === 'TerritorioDescubierto').datos.tiles.length;

    darCultura('p1', 100);
    aplicar(e, adoptarRasgo(e, 'p1', { rasgo: 'idioma' }));
    const conIdioma = moverEjercito(e, 'p1', { desde: { x: capital.x, y: capital.y }, hasta: destino })
      .find(ev => ev.tipo === 'TerritorioDescubierto').datos.tiles.length;

    expect(sinIdioma).toBe(9);   // 3x3
    expect(conIdioma).toBe(25);  // 5x5
  });

  it('el arte sube la defensa de las ciudades propias', () => {
    const jugador = e.jugadores.find(j => j.id === 'p1');
    expect(bonoDefensaPorRasgos(jugador)).toBe(1);
    darCultura('p1', 100);
    aplicar(e, adoptarRasgo(e, 'p1', { rasgo: 'arte' }));
    expect(bonoDefensaPorRasgos(jugador)).toBe(1 + RASGOS_CULTURALES.arte.bonoDefensaCiudad);
  });
});

describe('los rasgos en la vista', () => {
  it('el jugador ve los suyos y no los ajenos', () => {
    darCultura('p1', 100);
    aplicar(e, adoptarRasgo(e, 'p1', { rasgo: 'gastronomia' }));

    const vista = vistaJugador(e, 'p1');
    expect(vista.jugadores.find(j => j.id === 'p1').rasgos).toEqual(['gastronomia']);
    expect(vista.jugadores.find(j => j.id === 'p2')).not.toHaveProperty('rasgos');
  });
});

describe('compatibilidad con partidas viejas', () => {
  // Las partidas guardadas antes de que existieran los rasgos no tienen el
  // campo. Nada debe reventar al leerlas.
  it('un jugador sin el campo rasgos se comporta como si no tuviera ninguno', () => {
    const jugador = e.jugadores.find(j => j.id === 'p1');
    delete jugador.rasgos;

    expect(rasgosDe(jugador)).toEqual([]);
    expect(radioVision(jugador)).toBe(1);
    expect(bonoDefensaPorRasgos(jugador)).toBe(1);
    expect(() => producirParaJugador(e, 'p1')).not.toThrow();
    expect(() => vistaJugador(e, 'p1')).not.toThrow();

    darCultura('p1', 100);
    expect(() => aplicar(e, adoptarRasgo(e, 'p1', { rasgo: 'arte' }))).not.toThrow();
    expect(rasgosDe(jugador)).toEqual(['arte']);
  });
});
