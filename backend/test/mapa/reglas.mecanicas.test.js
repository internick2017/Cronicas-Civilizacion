import { describe, it, expect } from 'vitest';
import { crearEstado } from '../../src/domain/mapa/MapGame.js';
import { vistaJugador } from '../../src/domain/mapa/reglas/visibilidad.js';
import { mecanicasDe, reglasDelModo } from '../../src/domain/mapa/reglas/modo.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { investigar } from '../../src/domain/mapa/reglas/tecnologia.js';
import { adoptarRasgo } from '../../src/domain/mapa/reglas/cultura.js';
import { construir, mejorarCiudad } from '../../src/domain/mapa/reglas/ciudades.js';
import { proponerAlianza, romperAlianza, regalarRecursos } from '../../src/domain/mapa/reglas/alianzas.js';
import { nombrarMoneda, acunarMoneda } from '../../src/domain/mapa/reglas/moneda.js';
import { reclutar } from '../../src/domain/mapa/reglas/militar.js';
import { producirParaJugador } from '../../src/domain/mapa/reglas/turnos.js';
import { jugarTurnoIA } from '../../src/domain/mapa/ia.js';
import { crearRng } from '../../src/domain/mapa/rng.js';
import { produccionBruta } from '../../src/domain/mapa/reglas/turnos.js';
import { defensaDeCiudad } from '../../src/domain/mapa/reglas/combate.js';
import { moverCapital } from '../../src/domain/mapa/reglas/capital.js';
import { BONO_PRODUCCION_CAPITAL, BONO_DEFENSA_CAPITAL } from '../../src/domain/mapa/constantes.js';

function partida(config = {}, { bot = false } = {}) {
  const e = crearEstado({ nombre: 'T', semilla: 'gp-1', config });
  aplicar(e, unirse(e, { id: 'a', nombre: 'A', civilizacion: 'Uno', esBot: bot }));
  aplicar(e, unirse(e, { id: 'b', nombre: 'B', civilizacion: 'Dos' }));
  aplicar(e, iniciar(e));
  const j = e.jugadores.find(x => x.id === 'a');
  j.recursos = { food: 9999, gold: 9999, wood: 9999, stone: 9999, science: 9999, culture: 9999 };
  return e;
}

const capitalDe = (e, id) => e.mapa.find(t => t.ciudad && t.dueno === id);
const codigo = (fn) => { try { fn(); } catch (err) { return err.codigo ?? err.code ?? err.message; } return null; };

describe('mecanicas: la config', () => {
  it('por defecto todas prendidas', () => {
    expect(mecanicasDe(partida())).toEqual({ ciencia: true, cultura: true, armada: true, alianzas: true, moneda: true, capital: true });
  });
  it('una config parcial completa lo que falta con true', () => {
    expect(mecanicasDe(partida({ mecanicas: { armada: false } })).ciencia).toBe(true);
    expect(mecanicasDe(partida({ mecanicas: { armada: false } })).armada).toBe(false);
  });
  it('rechaza claves desconocidas y valores no booleanos', () => {
    const crear = (mecanicas) => () => crearEstado({ nombre: 'T', semilla: 'x', config: { mecanicas } });
    expect(crear({ gobierno: false })).toThrow(/mecanicas/);
    expect(crear({ ciencia: 'no' })).toThrow(/mecanicas/);
    expect(crear('todas')).toThrow(/mecanicas/);
  });
  it('partida vieja con guerraPura: ciencia y cultura apagadas, lo demas prendido', () => {
    const vieja = partida();
    delete vieja.config.mecanicas;
    vieja.config.guerraPura = true;
    expect(mecanicasDe(vieja)).toEqual({ ciencia: false, cultura: false, armada: true, alianzas: true, moneda: true, capital: true });
  });
  it('partida vieja sin ninguno de los dos campos: todo prendido', () => {
    const vieja = partida();
    delete vieja.config.mecanicas;
    expect(Object.values(mecanicasDe(vieja)).every(Boolean)).toBe(true);
  });
});

describe('mecanicas: ciencia y cultura por separado', () => {
  it('sin ciencia, la cultura se produce y los rasgos se adoptan', () => {
    const e = partida({ mecanicas: { ciencia: false } });
    expect(producirParaJugador(e, 'a').science ?? 0).toBe(0);
    expect(producirParaJugador(e, 'a').culture).toBeGreaterThan(0);
    expect(adoptarRasgo(e, 'a', { rasgo: 'arte' }).length).toBeGreaterThan(0);
    expect(codigo(() => investigar(e, 'a', { tecnologia: 'irrigacion' }))).toBe('MECANICA_APAGADA');
  });
  it('sin cultura, la ciencia se produce, se investiga y se mejoran ciudades', () => {
    const e = partida({ mecanicas: { cultura: false } });
    const { x, y } = capitalDe(e, 'a');
    expect(producirParaJugador(e, 'a').culture ?? 0).toBe(0);
    expect(producirParaJugador(e, 'a').science).toBeGreaterThan(0);
    expect(mejorarCiudad(e, 'a', { x, y }).length).toBeGreaterThan(0);
    expect(codigo(() => adoptarRasgo(e, 'a', { rasgo: 'arte' }))).toBe('MECANICA_APAGADA');
  });
});

describe('ciencia y cultura apagadas: lo que se apaga', () => {
  it('no se puede investigar, adoptar rasgos ni mejorar una ciudad', () => {
    const e = partida({ mecanicas: { ciencia: false, cultura: false } });
    const { x, y } = capitalDe(e, 'a');
    expect(codigo(() => investigar(e, 'a', { tecnologia: 'irrigacion' }))).toBe('MECANICA_APAGADA');
    expect(codigo(() => adoptarRasgo(e, 'a', { rasgo: 'arte' }))).toBe('MECANICA_APAGADA');
    expect(codigo(() => mejorarCiudad(e, 'a', { x, y }))).toBe('MECANICA_APAGADA');
  });

  it('la misma accion en una partida normal si funciona', () => {
    const e = partida();
    const { x, y } = capitalDe(e, 'a');
    expect(investigar(e, 'a', { tecnologia: 'irrigacion' }).length).toBeGreaterThan(0);
    expect(adoptarRasgo(e, 'a', { rasgo: 'arte' }).length).toBeGreaterThan(0);
    expect(mejorarCiudad(e, 'a', { x, y }).length).toBeGreaterThan(0);
  });

  it('no se construyen los edificios de ciencia ni de cultura, pero si los demas', () => {
    const e = partida({ mecanicas: { ciencia: false, cultura: false } });
    const { x, y } = capitalDe(e, 'a');
    expect(codigo(() => construir(e, 'a', { x, y, edificio: 'library' }))).toBe('MECANICA_APAGADA');
    expect(codigo(() => construir(e, 'a', { x, y, edificio: 'university' }))).toBe('MECANICA_APAGADA');
    expect(construir(e, 'a', { x, y, edificio: 'granary' }).length).toBeGreaterThan(0);
  });

  it('la ciencia y la cultura no se producen, el resto si', () => {
    const normal = producirParaJugador(partida(), 'a');
    const pura = producirParaJugador(partida({ mecanicas: { ciencia: false, cultura: false } }), 'a');
    expect(normal.science).toBeGreaterThan(0);
    expect(normal.culture).toBeGreaterThan(0);
    expect(pura.science ?? 0).toBe(0);
    expect(pura.culture ?? 0).toBe(0);
    expect(pura.food).toBeGreaterThan(0);
    expect(pura.gold).toBeGreaterThan(0);
  });
});

describe('ciencia y cultura apagadas: lo que le dice el modo a la interfaz', () => {
  it('una partida normal tiene todo y una de ciencia y cultura apagadas no tiene ciencia ni cultura', () => {
    expect(reglasDelModo(partida())).toEqual({
      tecnologias: true, rasgos: true, mejorasCiudad: true,
      recursosActivos: ['food', 'gold', 'wood', 'stone', 'science', 'culture'],
      armada: true, alianzas: true, moneda: true, capital: true,
    });
    expect(reglasDelModo(partida({ mecanicas: { ciencia: false, cultura: false } }))).toEqual({
      tecnologias: false, rasgos: false, mejorasCiudad: false,
      recursosActivos: ['food', 'gold', 'wood', 'stone'],
      armada: true, alianzas: true, moneda: true, capital: true,
    });
  });

  it('la vista del jugador lo incluye', () => {
    expect(vistaJugador(partida({ mecanicas: { ciencia: false, cultura: false } }), 'a').reglas.tecnologias).toBe(false);
    expect(vistaJugador(partida(), 'a').reglas.tecnologias).toBe(true);
  });
});

describe('ciencia y cultura apagadas: lo que se desbloquea', () => {
  it('el legionario se recluta desde el inicio, sin la tecnologia', () => {
    const { x, y } = capitalDe(partida(), 'a');
    const normal = partida();
    expect(codigo(() => reclutar(normal, 'a', { x, y, unidad: 'legionary' }))).toBe('REQUIERE_TECNOLOGIA');
    const pura = partida({ mecanicas: { ciencia: false, cultura: false } });
    expect(reclutar(pura, 'a', { x, y, unidad: 'legionary' }).length).toBeGreaterThan(0);
  });
});

function tiposQueHaceLaMaquina(config) {
  const e = partida(config, { bot: true });
  const tipos = new Set();
  for (let i = 0; i < 6; i++) {
    const eventos = jugarTurnoIA(e, 'a', crearRng(`gp-ia-${i}`));
    eventos.forEach(ev => tipos.add(ev.tipo === 'EdificioConstruido' ? `E:${ev.datos.edificio}` : ev.tipo));
    aplicar(e, eventos);
    if (e.estado === 'terminada') break;
    // El rival humano no juega: se le devuelve el turno a la maquina con ciencia y cultura de sobra.
    const bot = e.jugadores.find(j => j.id === 'a');
    e.indiceJugadorActual = e.jugadores.indexOf(bot);
    bot.recursos.science = 9999;
    bot.recursos.culture = 9999;
  }
  return tipos;
}

describe('ciencia y cultura apagadas: la maquina', () => {
  it('sin el modo, con ciencia de sobra, si investiga (control del test de abajo)', () => {
    expect(tiposQueHaceLaMaquina({}).has('TecnologiaInvestigada')).toBe(true);
  });

  it('en ciencia y cultura apagadas no investiga, no mejora ni construye edificios civiles, pero sigue jugando', () => {
    const tipos = tiposQueHaceLaMaquina({ mecanicas: { ciencia: false, cultura: false } });
    expect(tipos.has('TecnologiaInvestigada')).toBe(false);
    expect(tipos.has('RasgoAdoptado')).toBe(false);
    expect(tipos.has('CiudadMejorada')).toBe(false);
    expect(tipos.has('E:library')).toBe(false);
    expect(tipos.has('E:university')).toBe(false);
    expect(tipos.has('TurnoAvanzado')).toBe(true);
  });
});

// Capital con puerto y un tile de mar libre al lado (se pone a mano si la semilla no da costa).
function partidaConPuerto(config, opciones) {
  const e = partida(config, opciones);
  const cap = capitalDe(e, 'a');
  const vecino = [[0, -1], [0, 1], [-1, 0], [1, 0]]
    .map(([dx, dy]) => e.mapa.find(t => t.x === cap.x + dx && t.y === cap.y + dy))
    .find(t => t && !t.ejercito && !t.ciudad);
  vecino.terreno = 'water';
  if (!cap.ciudad.edificios.includes('port')) cap.ciudad.edificios.push('port');
  return { e, x: cap.x, y: cap.y };
}

describe('mecanicas: armada', () => {
  it('sin armada no se recluta el buque de guerra', () => {
    const { e, x, y } = partidaConPuerto({ mecanicas: { armada: false } });
    expect(codigo(() => reclutar(e, 'a', { x, y, unidad: 'warship' }))).toBe('MECANICA_APAGADA');
  });
  it('sin armada el transporte se sigue reclutando', () => {
    const { e, x, y } = partidaConPuerto({ mecanicas: { armada: false } });
    expect(reclutar(e, 'a', { x, y, unidad: 'transport' }).length).toBeGreaterThan(0);
  });
  it('con armada el buque se recluta (control)', () => {
    const { e, x, y } = partidaConPuerto({});
    expect(reclutar(e, 'a', { x, y, unidad: 'warship' }).length).toBeGreaterThan(0);
  });

  function buquesQueReclutaLaMaquina(config) {
    const { e } = partidaConPuerto(config, { bot: true });
    e.jugadores.find(j => j.id === 'a').dificultadIA = 'dificil';
    const eventos = jugarTurnoIA(e, 'a', crearRng('gp-ia-armada'));
    return eventos.filter(ev => ev.tipo === 'UnidadReclutada' && ev.datos.tipo === 'warship');
  }
  it('la maquina con armada recluta buques (control)', () => {
    expect(buquesQueReclutaLaMaquina({}).length).toBeGreaterThan(0);
  });
  it('la maquina sin armada no recluta buques', () => {
    expect(buquesQueReclutaLaMaquina({ mecanicas: { armada: false } })).toHaveLength(0);
  });
});

describe('mecanicas: alianzas', () => {
  it('sin alianzas no se propone, rompe ni regala', () => {
    const e = partida({ mecanicas: { alianzas: false } });
    expect(codigo(() => proponerAlianza(e, 'a', { para: 'b' }))).toBe('MECANICA_APAGADA');
    expect(codigo(() => romperAlianza(e, 'a'))).toBe('MECANICA_APAGADA');
    expect(codigo(() => regalarRecursos(e, 'a', { para: 'b', recurso: 'gold', cantidad: 1 }))).toBe('MECANICA_APAGADA');
  });
  it('con alianzas prendidas se puede proponer (control)', () => {
    // Con tres jugadores: entre dos la alianza seria total y no se permite.
    const e = crearEstado({ nombre: 'T', semilla: 'gp-1', config: {} });
    for (const [id, civ] of [['a', 'Uno'], ['b', 'Dos'], ['c', 'Tres']]) {
      aplicar(e, unirse(e, { id, nombre: id.toUpperCase(), civilizacion: civ }));
    }
    aplicar(e, iniciar(e));
    expect(proponerAlianza(e, 'a', { para: 'b' }).length).toBeGreaterThan(0);
  });
});

describe('mecanicas: moneda', () => {
  it('sin moneda no se nombra ni se acuña', () => {
    const e = partida({ mecanicas: { moneda: false } });
    expect(codigo(() => nombrarMoneda(e, 'a', { nombre: 'Sol', simbolo: 'S' }))).toBe('MECANICA_APAGADA');
    expect(codigo(() => acunarMoneda(e, 'a', { oro: 10 }))).toBe('MECANICA_APAGADA');
  });
  it('con moneda prendida se nombra y se acuña (control)', () => {
    const e = partida();
    expect(nombrarMoneda(e, 'a', { nombre: 'Sol', simbolo: 'S' }).length).toBeGreaterThan(0);
    expect(acunarMoneda(e, 'a', { oro: 10 }).length).toBeGreaterThan(0);
  });
});

describe('mecanicas: capital', () => {
  it('sin capital la ciudad no produce el bono (todo sale igual salvo ese bono)', () => {
    const on = partida();
    const off = partida({ mecanicas: { capital: false } });
    const pOn = produccionBruta(on, 'a');
    const pOff = produccionBruta(off, 'a');
    expect(Object.keys(pOn).length).toBeGreaterThan(0);
    for (const r of Object.keys(pOn)) {
      expect(pOff[r]).toBeCloseTo(pOn[r] / (1 + BONO_PRODUCCION_CAPITAL), 5);
    }
  });
  it('sin capital la defensa no suma el bono', () => {
    const on = partida();
    const off = partida({ mecanicas: { capital: false } });
    const dOn = defensaDeCiudad(on, capitalDe(on, 'a'));
    const dOff = defensaDeCiudad(off, capitalDe(off, 'a'));
    expect(dOff).toBe(dOn - BONO_DEFENSA_CAPITAL);
  });
  it('sin capital no se muda, pero la capital sigue existiendo para la vista', () => {
    const e = partida({ mecanicas: { capital: false } });
    const cap = capitalDe(e, 'a');
    const libre = e.mapa.find(t => !t.ciudad && !t.dueno && t.terreno !== 'water');
    libre.ciudad = structuredClone(cap.ciudad);
    libre.dueno = 'a';
    expect(codigo(() => moverCapital(e, 'a', { x: libre.x, y: libre.y }))).toBe('MECANICA_APAGADA');
    const yo = vistaJugador(e, 'a').jugadores.find(j => j.id === 'a');
    expect(yo.capital).not.toBeNull();
  });
  it('con capital prendida se muda (control)', () => {
    const e = partida();
    const cap = capitalDe(e, 'a');
    const libre = e.mapa.find(t => !t.ciudad && !t.dueno && t.terreno !== 'water');
    libre.ciudad = structuredClone(cap.ciudad);
    libre.dueno = 'a';
    expect(moverCapital(e, 'a', { x: libre.x, y: libre.y }).length).toBeGreaterThan(0);
  });
});
