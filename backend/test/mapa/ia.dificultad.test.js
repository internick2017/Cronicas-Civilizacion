import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { jugarTurnoIA, DIFICULTADES_IA, DIFICULTAD_IA_DEFAULT } from '../../src/domain/mapa/ia.js';
import { crearRng } from '../../src/domain/mapa/rng.js';

function partidaCon(semilla, dificultadIA) {
  const e = crearEstado({ nombre: 'T', semilla });
  aplicar(e, unirse(e, { id: 'bot', nombre: 'La Máquina', civilizacion: 'Autómatas', esBot: true, dificultadIA }));
  aplicar(e, unirse(e, { id: 'h1', nombre: 'H1', civilizacion: 'Civ1' }));
  aplicar(e, iniciar(e));
  return e;
}

const jugarIA = (e, semilla = 'ia-1') => jugarTurnoIA(e, 'bot', crearRng(semilla));

describe('DIFICULTADES_IA', () => {
  it('expone las 3 dificultades y un default valido', () => {
    expect(DIFICULTADES_IA).toEqual(['facil', 'normal', 'dificil']);
    expect(DIFICULTADES_IA).toContain(DIFICULTAD_IA_DEFAULT);
  });
});

describe('la dificultad viaja con el jugador', () => {
  it('un valor invalido o ausente cae al default (normal), no rompe', () => {
    const e = crearEstado({ nombre: 'T', semilla: 's1' });
    aplicar(e, unirse(e, { id: 'bot', nombre: 'B', civilizacion: 'A', esBot: true, dificultadIA: 'imposible' }));
    aplicar(e, unirse(e, { id: 'h1', nombre: 'H', civilizacion: 'B' }));
    aplicar(e, iniciar(e));
    expect(() => jugarTurnoIA(e, 'bot', crearRng('x'))).not.toThrow();
  });
});

describe('facil vs dificil: se nota en las decisiones, no solo en un numero', () => {
  it('facil ataca aunque pierda claramente; dificil evita esa pelea', () => {
    // Mismo escenario perdedor para las dos: catapulta propia (atq 25) contra
    // un lancero (def 15) parado en montaña Y en su propia ciudad: con los
    // bonos de terreno (1.25) y ciudad (1.5) el poder defensivo estimado
    // (15 * 1.25 * 1.5 = 28.125) supera claramente el ataque de 25.
    const construirEscenario = (dificultadIA) => {
      const e = partidaCon('dificultad-1', dificultadIA);
      const capital = e.mapa.find((t) => t.ciudad && t.dueno === 'bot');
      const objetivo = tileEn(e, capital.x, capital.y - 1) ?? tileEn(e, capital.x, capital.y + 1);
      objetivo.terreno = 'mountains';
      objetivo.dueno = 'h1';
      objetivo.ciudad = { nombre: 'Rival', nivel: 1, poblacion: 1, edificios: [] };
      objetivo.ejercito = { tipo: 'spearman', dueno: 'h1', salud: 90, movimientoRestante: 2 };
      aplicar(e, [{
        tipo: 'UnidadReclutada', turno: e.turno, jugadorId: 'bot',
        datos: { x: capital.x, y: capital.y, tipo: 'catapult' },
      }]);
      return e;
    };

    const facil = construirEscenario('facil');
    const eventosFacil = jugarTurnoIA(facil, 'bot', crearRng('ataque-1'));
    expect(eventosFacil.some((ev) => ev.tipo === 'CombateResuelto')).toBe(true);

    const dificil = construirEscenario('dificil');
    const eventosDificil = jugarTurnoIA(dificil, 'bot', crearRng('ataque-1'));
    expect(eventosDificil.some((ev) => ev.tipo === 'CombateResuelto')).toBe(false);
  });

  it('facil no prioriza aserradero/cantera; dificil (y normal) sí', () => {
    const construirEscenario = (dificultadIA) => {
      const e = partidaCon('dificultad-2', dificultadIA);
      const capital = e.mapa.find((t) => t.ciudad && t.dueno === 'bot');
      capital.terreno = 'plains'; // sin madera/piedra propia, el escenario problematico
      e.jugadores.find((j) => j.id === 'bot').recursos =
        { food: 500, gold: 500, wood: 500, stone: 500, science: 0, culture: 0 };
      return { e, capital };
    };

    const { e: eDificil, capital: capDificil } = construirEscenario('dificil');
    jugarIA(eDificil);
    expect(capDificil.ciudad.edificios[0]).toMatch(/sawmill|quarry/);

    const { e: eFacil, capital: capFacil } = construirEscenario('facil');
    jugarIA(eFacil);
    // El orden "de fabrica" empieza por granary, no por sawmill/quarry.
    expect(capFacil.ciudad.edificios[0]).toBe('granary');
  });

  it('facil se queda solo con guerreros; dificil recluta caballeria si tiene cuartel', () => {
    const construirEscenario = (dificultadIA) => {
      const e = partidaCon('dificultad-3', dificultadIA);
      const capital = e.mapa.find((t) => t.ciudad && t.dueno === 'bot');
      capital.ciudad.edificios.push('barracks');
      e.jugadores.find((j) => j.id === 'bot').recursos =
        { food: 1000, gold: 1000, wood: 1000, stone: 1000, science: 0, culture: 0 };
      return { e, capital };
    };

    const { e: eDificil } = construirEscenario('dificil');
    const eventosDificil = jugarIA(eDificil);
    expect(eventosDificil.some((ev) => ev.tipo === 'UnidadReclutada' && ev.datos.tipo === 'cavalry')).toBe(true);

    const { e: eFacil } = construirEscenario('facil');
    const eventosFacil = jugarIA(eFacil);
    const reclutadas = eventosFacil.filter((ev) => ev.tipo === 'UnidadReclutada').map((ev) => ev.datos.tipo);
    expect(reclutadas.every((tipo) => tipo === 'warrior')).toBe(true);
  });

  it('facil a veces no hace nada en un paso (juega "menos"): con la misma semilla, facil genera menos eventos que dificil', () => {
    const eFacil = partidaCon('dificultad-4', 'facil');
    const eDificil = partidaCon('dificultad-4', 'dificil');
    // Mismos recursos de sobra para las dos, misma semilla de decisiones:
    // la UNICA diferencia es el perfil de dificultad.
    for (const e of [eFacil, eDificil]) {
      e.jugadores.find((j) => j.id === 'bot').recursos =
        { food: 2000, gold: 2000, wood: 2000, stone: 2000, science: 0, culture: 0 };
    }
    const eventosFacil = jugarTurnoIA(eFacil, 'bot', crearRng('mismo-rng'));
    const eventosDificil = jugarTurnoIA(eDificil, 'bot', crearRng('mismo-rng'));
    expect(eventosFacil.length).toBeLessThan(eventosDificil.length);
  });

  it('dificil funda en el mejor terreno disponible; facil funda donde caiga', () => {
    const e = partidaCon('dificultad-5', 'dificil');
    const jugador = e.jugadores.find((j) => j.id === 'bot');
    jugador.recursos = { food: 500, gold: 0, wood: 500, stone: 500, science: 0, culture: 0 };

    // Dos candidatas SIN dueño (fundarCiudad rechaza cualquier tile con
    // dueño, incluso el propio) pero YA descubiertas: una llanura (bono
    // bajo) y una montaña (bono alto).
    const capital = e.mapa.find((t) => t.ciudad && t.dueno === 'bot');
    const a = tileEn(e, capital.x + 1, capital.y);
    const b = tileEn(e, capital.x - 1, capital.y);
    [a, b].forEach((t) => { t.dueno = null; t.ciudad = null; t.descubiertoPor = ['bot']; });
    a.terreno = 'plains';
    b.terreno = 'mountains';

    const eventos = jugarTurnoIA(e, 'bot', crearRng('fundar-1'));
    const fundacion = eventos.find((ev) => ev.tipo === 'CiudadFundada');
    expect(fundacion).toBeTruthy();
    expect(fundacion.datos).toMatchObject({ x: b.x, y: b.y }); // eligio la montaña, no al azar
  });
});

describe('todas las dificultades siguen siendo robustas', () => {
  it('nunca tira excepcion, para ninguna dificultad, en varios terrenos', () => {
    for (const dificultadIA of DIFICULTADES_IA) {
      for (const semilla of ['a', 'b', 'c']) {
        const e = partidaCon(semilla, dificultadIA);
        expect(() => jugarTurnoIA(e, 'bot', crearRng(semilla))).not.toThrow();
      }
    }
  });

  it('siempre termina el turno sin importar la dificultad', () => {
    for (const dificultadIA of DIFICULTADES_IA) {
      const e = partidaCon('cierre-1', dificultadIA);
      jugarTurnoIA(e, 'bot', crearRng('cierre-1'));
      expect(e.jugadores[e.indiceJugadorActual].id).not.toBe('bot');
    }
  });
});
