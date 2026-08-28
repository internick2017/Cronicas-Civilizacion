import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import {
  investigar, tecnologiasDe, bonoAtaquePorTecnologias,
  bonoDefensaUnidadPorTecnologias, aplicarBonosPorcentuales
} from '../../src/domain/mapa/reglas/tecnologia.js';
import { construir, mejorarCiudad } from '../../src/domain/mapa/reglas/ciudades.js';
import { reclutar } from '../../src/domain/mapa/reglas/militar.js';
import { atacar } from '../../src/domain/mapa/reglas/combate.js';
import { producirParaJugador } from '../../src/domain/mapa/reglas/turnos.js';
import { vistaJugador } from '../../src/domain/mapa/reglas/visibilidad.js';
import { evento } from '../../src/domain/mapa/reglas/comun.js';
import { crearRng } from '../../src/domain/mapa/rng.js';
import { TECNOLOGIAS, COSTO_MEJORA_CIUDAD, defensaCiudad } from '../../src/domain/mapa/constantes.js';
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

const darCiencia = (jugadorId, cantidad) => {
  e.jugadores.find(j => j.id === jugadorId).recursos.science = cantidad;
};

describe('investigar tecnologías', () => {
  it('cobra la ciencia y deja la tecnología investigada', () => {
    darCiencia('p1', 100);
    aplicar(e, investigar(e, 'p1', { tecnologia: 'metalurgia' }));
    const jugador = e.jugadores.find(j => j.id === 'p1');
    expect(tecnologiasDe(jugador)).toContain('metalurgia');
    expect(jugador.recursos.science).toBe(100 - TECNOLOGIAS.metalurgia.costo.science);
  });

  it('no se puede investigar sin ciencia suficiente', () => {
    darCiencia('p1', 0);
    expect(() => investigar(e, 'p1', { tecnologia: 'metalurgia' })).toThrow(ReglaError);
  });

  it('no se puede investigar dos veces la misma tecnología', () => {
    darCiencia('p1', 500);
    aplicar(e, investigar(e, 'p1', { tecnologia: 'metalurgia' }));
    expect(() => investigar(e, 'p1', { tecnologia: 'metalurgia' })).toThrow(ReglaError);
  });

  it('rechaza una tecnología inexistente', () => {
    darCiencia('p1', 500);
    expect(() => investigar(e, 'p1', { tecnologia: 'alquimia' })).toThrow(ReglaError);
  });

  it('son independientes: se pueden investigar todas, sin requisitos entre ellas', () => {
    darCiencia('p1', 1000);
    for (const tecnologia of Object.keys(TECNOLOGIAS)) {
      aplicar(e, investigar(e, 'p1', { tecnologia }));
    }
    expect(tecnologiasDe(e.jugadores.find(j => j.id === 'p1'))).toHaveLength(Object.keys(TECNOLOGIAS).length);
  });
});

describe('efectos de las tecnologías', () => {
  it('irrigación suma 20% a la producción TOTAL de comida (no solo a la base)', () => {
    darCiencia('p1', 100);
    const antes = producirParaJugador(e, 'p1').food;
    aplicar(e, investigar(e, 'p1', { tecnologia: 'irrigacion' }));
    const despues = producirParaJugador(e, 'p1').food;
    expect(despues).toBe(Math.round(antes * 1.2));
  });

  it('minería NO afecta la comida (solo el oro)', () => {
    darCiencia('p1', 100);
    const antesFood = producirParaJugador(e, 'p1').food;
    aplicar(e, investigar(e, 'p1', { tecnologia: 'mineria' }));
    expect(producirParaJugador(e, 'p1').food).toBe(antesFood);
  });

  it('metalurgia suma ataque plano a las unidades, no un multiplicador', () => {
    const jugador = e.jugadores.find(j => j.id === 'p1');
    expect(bonoAtaquePorTecnologias(jugador)).toBe(0);
    darCiencia('p1', 100);
    aplicar(e, investigar(e, 'p1', { tecnologia: 'metalurgia' }));
    expect(bonoAtaquePorTecnologias(jugador)).toBe(TECNOLOGIAS.metalurgia.bonoAtaqueUnidades);
  });

  it('fortificación suma defensa plana a las unidades (no a las ciudades)', () => {
    const jugador = e.jugadores.find(j => j.id === 'p1');
    darCiencia('p1', 100);
    aplicar(e, investigar(e, 'p1', { tecnologia: 'fortificacion' }));
    expect(bonoDefensaUnidadPorTecnologias(jugador)).toBe(TECNOLOGIAS.fortificacion.bonoDefensaUnidades);
  });

  it('aplicarBonosPorcentuales no crea recursos que no estaban en el total (0 sigue en 0)', () => {
    darCiencia('p1', 100);
    aplicar(e, investigar(e, 'p1', { tecnologia: 'irrigacion' }));
    const jugador = e.jugadores.find(j => j.id === 'p1');
    expect(aplicarBonosPorcentuales({ wood: 0 }, jugador).wood).toBe(0);
  });
});

describe('desbloqueos por tecnología', () => {
  it('legionario requiere formacionMilitar: sin la tecnología, se rechaza', () => {
    const capital = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
    expect(() => reclutar(e, 'p1', { x: capital.x, y: capital.y, unidad: 'legionary' })).toThrow(ReglaError);
  });

  it('con formacionMilitar investigada, se puede reclutar legionario', () => {
    const capital = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
    darCiencia('p1', 200);
    aplicar(e, investigar(e, 'p1', { tecnologia: 'formacionMilitar' }));
    const jugador = e.jugadores.find(j => j.id === 'p1');
    jugador.recursos = { ...jugador.recursos, food: 100, gold: 100, wood: 100 };
    expect(() => aplicar(e, reclutar(e, 'p1', { x: capital.x, y: capital.y, unidad: 'legionary' }))).not.toThrow();
    expect(capital.ejercito.tipo).toBe('legionary');
  });

  it('universidad requiere filosofia: sin la tecnología, se rechaza', () => {
    const capital = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
    const jugador = e.jugadores.find(j => j.id === 'p1');
    jugador.recursos = { ...jugador.recursos, gold: 200, stone: 200 };
    expect(() => construir(e, 'p1', { x: capital.x, y: capital.y, edificio: 'university' })).toThrow(ReglaError);
  });

  it('con filosofia investigada, la universidad se puede construir y produce ciencia', () => {
    const capital = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
    darCiencia('p1', 200);
    aplicar(e, investigar(e, 'p1', { tecnologia: 'filosofia' }));
    const jugador = e.jugadores.find(j => j.id === 'p1');
    jugador.recursos = { ...jugador.recursos, gold: 200, stone: 200 };
    // Sin biblioteca ni universidad, la ciencia ni siquiera aparece como
    // clave en la produccion (nadie la genera todavia): 0, no undefined.
    const antes = producirParaJugador(e, 'p1').science ?? 0;
    aplicar(e, construir(e, 'p1', { x: capital.x, y: capital.y, edificio: 'university' }));
    expect(producirParaJugador(e, 'p1').science).toBeGreaterThan(antes);
  });
});

describe('metalurgia y fortificación en combate real', () => {
  it('metalurgia sube el daño que hace el atacante', () => {
    // Arqueros de los dos lados, en llanura, mismo rng: solo cambia si p1
    // investigo metalurgia o no.
    const construirEscenario = () => {
      const partida = crearPartida();
      aplicar(partida, [evento('UnidadReclutada', partida, 'p1', { x: 19, y: 1, tipo: 'archer' })]);
      aplicar(partida, [evento('UnidadReclutada', partida, 'p2', { x: 18, y: 1, tipo: 'archer' })]);
      tileEn(partida, 18, 1).terreno = 'plains';
      return partida;
    };

    const sinTecnologia = construirEscenario();
    const datosSinTec = atacar(sinTecnologia, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } }, crearRng('combate-x'))[0].datos;

    const conTecnologia = construirEscenario();
    conTecnologia.jugadores.find(j => j.id === 'p1').recursos.science = 100;
    aplicar(conTecnologia, investigar(conTecnologia, 'p1', { tecnologia: 'metalurgia' }));
    const datosConTec = atacar(conTecnologia, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } }, crearRng('combate-x'))[0].datos;

    expect(datosConTec.danoDefensor).toBeGreaterThan(datosSinTec.danoDefensor);
  });

  it('fortificación NO afecta la defensa de una ciudad (solo de un ejercito)', () => {
    const construirEscenario = () => {
      const partida = crearPartida();
      aplicar(partida, [evento('UnidadReclutada', partida, 'p1', { x: 19, y: 1, tipo: 'catapult' })]);
      const objetivo = tileEn(partida, 18, 1);
      objetivo.terreno = 'plains';
      objetivo.dueno = 'p2';
      objetivo.ciudad = { nombre: 'Rival', nivel: 1, poblacion: 1, edificios: [] };
      return partida;
    };

    const sinTecnologia = construirEscenario();
    const datosSinTec = atacar(sinTecnologia, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } }, crearRng('ciudad-x'))[0].datos;

    const conTecnologia = construirEscenario();
    // No es turno de p2 en una partida recien iniciada (le toca a p1): se
    // asigna la tecnologia directo, es lo unico que este test necesita leer.
    conTecnologia.jugadores.find(j => j.id === 'p2').tecnologias = ['fortificacion'];
    const datosConTec = atacar(conTecnologia, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } }, crearRng('ciudad-x'))[0].datos;

    expect(datosConTec.danoDefensor).toBe(datosSinTec.danoDefensor);
  });
});

describe('mejorar el nivel de una ciudad', () => {
  it('sube el nivel y cobra ciencia + oro creciente', () => {
    const capital = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
    const jugador = e.jugadores.find(j => j.id === 'p1');
    jugador.recursos = { ...jugador.recursos, science: 100, gold: 100 };

    expect(capital.ciudad.nivel).toBe(1);
    aplicar(e, mejorarCiudad(e, 'p1', { x: capital.x, y: capital.y }));
    expect(capital.ciudad.nivel).toBe(2);
    expect(jugador.recursos.science).toBe(100 - COSTO_MEJORA_CIUDAD(1).science);
  });

  it('el costo del siguiente nivel es mayor (escala con el nivel actual)', () => {
    const capital = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
    const jugador = e.jugadores.find(j => j.id === 'p1');
    jugador.recursos = { ...jugador.recursos, science: 1000, gold: 1000 };

    aplicar(e, mejorarCiudad(e, 'p1', { x: capital.x, y: capital.y })); // nivel 1 -> 2
    const gastadoNivel1 = 1000 - jugador.recursos.science;
    aplicar(e, mejorarCiudad(e, 'p1', { x: capital.x, y: capital.y })); // nivel 2 -> 3
    const gastadoNivel2 = (1000 - gastadoNivel1) - jugador.recursos.science;

    expect(gastadoNivel2).toBeGreaterThan(gastadoNivel1);
  });

  it('no se puede mejorar sin recursos suficientes', () => {
    const capital = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
    const jugador = e.jugadores.find(j => j.id === 'p1');
    jugador.recursos = { ...jugador.recursos, science: 0, gold: 0 };
    expect(() => mejorarCiudad(e, 'p1', { x: capital.x, y: capital.y })).toThrow(ReglaError);
  });

  it('no se puede mejorar una ciudad ajena', () => {
    const capitalAjena = e.mapa.find(t => t.ciudad && t.dueno === 'p2');
    const jugador = e.jugadores.find(j => j.id === 'p1');
    jugador.recursos = { ...jugador.recursos, science: 1000, gold: 1000 };
    expect(() => mejorarCiudad(e, 'p1', { x: capitalAjena.x, y: capitalAjena.y })).toThrow(ReglaError);
  });

  // Razon de ser de todo esto: defensaCiudad(nivel) ya existia y escalaba con
  // el nivel desde antes, pero nada permitia subirlo mas alla de 1.
  it('subir el nivel mejora de verdad la defensa de la ciudad en un combate', () => {
    const construirEscenario = () => {
      const partida = crearPartida();
      aplicar(partida, [evento('UnidadReclutada', partida, 'p1', { x: 19, y: 1, tipo: 'catapult' })]);
      const objetivo = tileEn(partida, 18, 1);
      objetivo.terreno = 'plains';
      objetivo.dueno = 'p2';
      objetivo.ciudad = { nombre: 'Rival', nivel: 1, poblacion: 1, edificios: [] };
      return { partida, objetivo };
    };

    const { partida: nivel1, objetivo: obj1 } = construirEscenario();
    const datosNivel1 = atacar(nivel1, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } }, crearRng('mejora-x'))[0].datos;

    const { partida: nivel3, objetivo: obj3 } = construirEscenario();
    obj3.ciudad.nivel = 3; // equivalente a mejorarCiudad() dos veces
    expect(defensaCiudad(3)).toBeGreaterThan(defensaCiudad(1));
    const datosNivel3 = atacar(nivel3, 'p1', { desde: { x: 19, y: 1 }, hasta: { x: 18, y: 1 } }, crearRng('mejora-x'))[0].datos;

    expect(datosNivel3.danoDefensor).toBeLessThan(datosNivel1.danoDefensor);
  });
});

describe('en la vista', () => {
  it('el jugador ve sus propias tecnologías y no las ajenas', () => {
    darCiencia('p1', 100);
    aplicar(e, investigar(e, 'p1', { tecnologia: 'metalurgia' }));
    const vista = vistaJugador(e, 'p1');
    expect(vista.jugadores.find(j => j.id === 'p1').tecnologias).toEqual(['metalurgia']);
    expect(vista.jugadores.find(j => j.id === 'p2')).not.toHaveProperty('tecnologias');
  });
});

describe('compatibilidad con partidas viejas', () => {
  it('un jugador sin el campo tecnologias se comporta como si no tuviera ninguna', () => {
    const jugador = e.jugadores.find(j => j.id === 'p1');
    delete jugador.tecnologias;

    expect(tecnologiasDe(jugador)).toEqual([]);
    expect(bonoAtaquePorTecnologias(jugador)).toBe(0);
    expect(bonoDefensaUnidadPorTecnologias(jugador)).toBe(0);
    expect(() => producirParaJugador(e, 'p1')).not.toThrow();
    expect(() => vistaJugador(e, 'p1')).not.toThrow();

    darCiencia('p1', 100);
    expect(() => aplicar(e, investigar(e, 'p1', { tecnologia: 'metalurgia' }))).not.toThrow();
    expect(tecnologiasDe(jugador)).toEqual(['metalurgia']);
  });
});
