import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { atacar } from '../../src/domain/mapa/reglas/combate.js';
import { produccionConResto, producirParaJugador } from '../../src/domain/mapa/reglas/turnos.js';
import { radioVision } from '../../src/domain/mapa/reglas/cultura.js';
import {
  validarRaza, bonoAtaquePorRaza, bonoDefensaUnidadPorRaza, visionExtraPorRaza,
  multiplicadorDefensaCiudadPorRaza, produccionPorcentualDeRaza,
} from '../../src/domain/mapa/reglas/razas.js';
import { vistaJugador } from '../../src/domain/mapa/reglas/visibilidad.js';
import { evento } from '../../src/domain/mapa/reglas/comun.js';
import { crearRng } from '../../src/domain/mapa/rng.js';
import { RAZAS } from '../../src/domain/mapa/constantes.js';
import { ReglaError } from '../../src/domain/mapa/errores.js';

function crearPartida(razaP1 = null) {
  const e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas', raza: razaP1 }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  return e;
}

const jugadorDe = (e, id) => e.jugadores.find(j => j.id === id);

describe('elegir raza al unirse', () => {
  it('guarda la raza elegida en el jugador', () => {
    expect(jugadorDe(crearPartida('orcos'), 'p1').raza).toBe('orcos');
  });

  it('sin raza el jugador queda sin ninguna (comportamiento de antes)', () => {
    expect(jugadorDe(crearPartida(), 'p1').raza).toBeNull();
  });

  it('rechaza una raza que no existe', () => {
    const e = crearEstado({ nombre: 'T', semilla: 's1' });
    expect(() => unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'X', raza: 'dragones' }))
      .toThrow(ReglaError);
  });

  it('rechaza nombres heredados del prototipo como "toString" o "constructor"', () => {
    for (const raza of ['toString', 'constructor', '__proto__']) {
      expect(() => validarRaza(raza), raza).toThrow(ReglaError);
    }
  });

  it('hay exactamente cuatro razas, cada una con nombre, icono y descripción', () => {
    expect(Object.keys(RAZAS)).toHaveLength(4);
    for (const [id, raza] of Object.entries(RAZAS)) {
      expect(raza.nombre, id).toBeTruthy();
      expect(raza.icono, id).toBeTruthy();
      expect(raza.descripcion, id).toBeTruthy();
    }
  });
});

describe('partidas viejas, sin raza', () => {
  it('no tienen ningún bono ni penalización', () => {
    const jugador = { id: 'viejo' }; // ni siquiera trae el campo
    expect(bonoAtaquePorRaza(jugador)).toBe(0);
    expect(bonoDefensaUnidadPorRaza(jugador)).toBe(0);
    expect(visionExtraPorRaza(jugador)).toBe(0);
    expect(multiplicadorDefensaCiudadPorRaza(jugador)).toBe(1);
    expect(produccionPorcentualDeRaza(jugador, 'gold')).toBe(0);
    expect(radioVision(jugador)).toBe(1);
  });

  it('una raza guardada que ya no existe tampoco rompe nada', () => {
    expect(bonoAtaquePorRaza({ raza: 'borrada' })).toBe(0);
  });
});

describe('producción', () => {
  let e;
  beforeEach(() => { e = crearPartida(); });

  it('humanos: +15% de oro sobre el mismo mapa y la misma semilla', () => {
    const base = producirParaJugador(e, 'p1').gold;
    const conRaza = crearPartida('humanos');
    expect(producirParaJugador(conRaza, 'p1').gold).toBe(Math.floor(base * 1.15 + 1e-9));
  });

  it('orcos: -25% de ciencia, y el decimal que se pierde queda de resto para el turno siguiente', () => {
    const base = producirParaJugador(e, 'p1').science;
    const orcos = crearPartida('orcos');
    const { produccion, resto } = produccionConResto(orcos, 'p1');
    expect(produccion.science).toBe(Math.floor(base * 0.75 + 1e-9));
    // Sin el resto, un -25% sobre 1 de ciencia se perdia entero cada turno.
    expect(resto.science).toBeCloseTo(base * 0.75 - produccion.science);
  });

  it('una raza no toca los recursos que no menciona', () => {
    const base = producirParaJugador(e, 'p1');
    const enanos = producirParaJugador(crearPartida('enanos'), 'p1');
    expect(enanos.gold).toBe(base.gold);
    expect(enanos.culture).toBe(base.culture);
  });

  it('enanos: pagan comida (-15%) a cambio de piedra', () => {
    const base = producirParaJugador(e, 'p1');
    const enanos = producirParaJugador(crearPartida('enanos'), 'p1');
    expect(enanos.food).toBeLessThan(base.food);
    expect(produccionPorcentualDeRaza({ raza: 'enanos' }, 'stone')).toBeCloseTo(0.25);
  });
});

describe('visión', () => {
  it('elfos ven una casilla más lejos y se suma al idioma propio', () => {
    expect(radioVision({ raza: 'elfos' })).toBe(2);
    expect(radioVision({ raza: 'humanos' })).toBe(1);
    expect(radioVision({ raza: 'elfos', rasgos: ['idioma'] })).toBe(3);
  });
});

describe('combate', () => {
  const POS = [{ desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } }];

  // Arqueros de los dos lados en llanura y el MISMO rng: lo unico que cambia es la raza.
  const escenario = ({ razaP1 = null, razaP2 = null, ciudad = false } = {}) => {
    const partida = crearPartida();
    jugadorDe(partida, 'p1').raza = razaP1;
    jugadorDe(partida, 'p2').raza = razaP2;
    aplicar(partida, [evento('UnidadReclutada', partida, 'p1', { x: 19, y: 1, tipo: 'archer' })]);
    if (ciudad) {
      const objetivo = tileEn(partida, 18, 1);
      objetivo.dueno = 'p2';
      objetivo.ciudad = { nombre: 'Rival', nivel: 1, poblacion: 1, edificios: [] };
    } else {
      aplicar(partida, [evento('UnidadReclutada', partida, 'p2', { x: 18, y: 1, tipo: 'archer' })]);
    }
    tileEn(partida, 18, 1).terreno = 'plains';
    return partida;
  };
  const dano = (partida) => atacar(partida, 'p1', ...POS, crearRng('raza-x'))[0].datos.danoDefensor;

  it('orcos (+2 ataque) hacen más daño que quien no tiene raza', () => {
    expect(dano(escenario({ razaP1: 'orcos' }))).toBeGreaterThan(dano(escenario()));
  });

  it('elfos (-1 ataque) hacen menos daño', () => {
    expect(dano(escenario({ razaP1: 'elfos' }))).toBeLessThan(dano(escenario()));
  });

  it('enanos defienden mejor sus unidades (+1 defensa): reciben menos daño', () => {
    expect(dano(escenario({ razaP2: 'enanos' }))).toBeLessThan(dano(escenario()));
  });

  it('humanos defienden peor sus unidades (-1 defensa): reciben más daño', () => {
    expect(dano(escenario({ razaP2: 'humanos' }))).toBeGreaterThan(dano(escenario()));
  });

  it('enanos defienden mejor sus ciudades (+25%)', () => {
    expect(dano(escenario({ razaP2: 'enanos', ciudad: true })))
      .toBeLessThan(dano(escenario({ ciudad: true })));
  });

  it('la defensa de unidades de la raza NO mejora una ciudad (la ciudad usa su propio bono)', () => {
    // Humanos tienen -1 de defensa de UNIDADES; contra una ciudad no cuenta.
    expect(dano(escenario({ razaP2: 'humanos', ciudad: true })))
      .toBe(dano(escenario({ ciudad: true })));
  });
});

describe('en la vista', () => {
  it('la raza es publica: la ve el dueño y los rivales', () => {
    const e = crearPartida('orcos');
    const propia = vistaJugador(e, 'p1').jugadores.find(j => j.id === 'p1');
    const ajena = vistaJugador(e, 'p2').jugadores.find(j => j.id === 'p1');
    expect(propia.raza).toBe('orcos');
    expect(ajena.raza).toBe('orcos');
  });

  it('un jugador sin raza sale con raza null', () => {
    const e = crearPartida();
    expect(vistaJugador(e, 'p1').jugadores.find(j => j.id === 'p1').raza).toBeNull();
  });
});
