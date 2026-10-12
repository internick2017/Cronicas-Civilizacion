import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado, jugadorPorId } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { proponerAlianza, responderAlianza, romperAlianza, regalarRecursos } from '../../src/domain/mapa/reglas/alianzas.js';
import { sonAliados, enTregua } from '../../src/domain/mapa/reglas/bandos.js';
import { atacar } from '../../src/domain/mapa/reglas/combate.js';
import { moverEjercito } from '../../src/domain/mapa/reglas/movimiento.js';
import { recuperarFronteras } from '../../src/domain/mapa/reglas/fronteras.js';
import { terminarTurno, evaluarVictoria } from '../../src/domain/mapa/reglas/turnos.js';
import { vistaJugador } from '../../src/domain/mapa/reglas/visibilidad.js';
import { jugarTurnoIA } from '../../src/domain/mapa/ia.js';
import { crearRng } from '../../src/domain/mapa/rng.js';

// Mapa 6x6 de llanura, vacio: cada test pone lo que necesita.
const N = 6;
let e;
const tile = (x, y) => e.mapa[y * N + x];
function ciudad(id, x, y) {
  Object.assign(tile(x, y), { dueno: id, ciudad: { nombre: `C${id}`, nivel: 1, poblacion: 500, edificios: [] } });
}
function tropa(id, x, y) {
  tile(x, y).ejercito = { tipo: 'warrior', dueno: id, salud: 100, movimientoRestante: 2, bonoMovimiento: 0 };
}
function partida(ids, config = {}) {
  e = crearEstado({ nombre: 'T', semilla: 's1', config: { modoTurno: 'simultaneo', tamanoMapa: 14, ...config } });
  for (const id of ids) {
    aplicar(e, unirse(e, { id, nombre: id, civilizacion: `Civ ${id}`, esBot: id.startsWith('bot') }));
  }
  aplicar(e, iniciar(e));
  e.config.tamanoMapa = N;
  e.mapa = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      e.mapa.push({ x, y, terreno: 'plains', recurso: null, dueno: null, ciudad: null, ejercito: null, descubiertoPor: [] });
    }
  }
}
function aliar(a, b) {
  aplicar(e, proponerAlianza(e, a, { para: b }));
  aplicar(e, responderAlianza(e, b, { de: a, aceptar: true }));
}
const cerrarRonda = () => {
  for (const j of e.jugadores.filter(x => x.activo)) aplicar(e, terminarTurno(e, j.id));
};
const rng = () => crearRng('prueba');

describe('formar una alianza', () => {
  beforeEach(() => partida(['a', 'b', 'c']));

  it('se propone, el otro acepta y quedan aliados', () => {
    aplicar(e, proponerAlianza(e, 'a', { para: 'b' }));
    expect(sonAliados(e, 'a', 'b')).toBe(false);
    aplicar(e, responderAlianza(e, 'b', { de: 'a', aceptar: true }));
    expect(sonAliados(e, 'a', 'b')).toBe(true);
    expect(sonAliados(e, 'b', 'a')).toBe(true);
    expect(sonAliados(e, 'a', 'c')).toBe(false);
    expect(e.propuestasAlianza).toEqual([]);
  });

  it('si rechaza no hay alianza y se puede volver a proponer', () => {
    aplicar(e, proponerAlianza(e, 'a', { para: 'b' }));
    aplicar(e, responderAlianza(e, 'b', { de: 'a', aceptar: false }));
    expect(sonAliados(e, 'a', 'b')).toBe(false);
    expect(() => proponerAlianza(e, 'a', { para: 'b' })).not.toThrow();
  });

  it('no se puede proponer dos veces, ni responder lo que nadie propuso', () => {
    aplicar(e, proponerAlianza(e, 'a', { para: 'b' }));
    expect(() => proponerAlianza(e, 'a', { para: 'b' })).toThrow(/Ya le propusiste/);
    expect(() => proponerAlianza(e, 'b', { para: 'a' })).toThrow(/ya te propuso/);
    expect(() => responderAlianza(e, 'c', { de: 'a', aceptar: true })).toThrow(/no te propuso/);
  });

  it('no puede haber una alianza de TODOS: tiene que quedar un rival', () => {
    aliar('a', 'b');
    expect(() => proponerAlianza(e, 'a', { para: 'c' })).toThrow(/al menos un rival/);
    partida(['a', 'b']);
    expect(() => proponerAlianza(e, 'a', { para: 'b' })).toThrow(/al menos un rival/);
  });

  it('un tercero entra a la alianza que ya existe', () => {
    partida(['a', 'b', 'c', 'd']);
    aliar('a', 'b');
    aliar('c', 'a');
    expect(e.alianzas).toHaveLength(1);
    expect(sonAliados(e, 'b', 'c')).toBe(true);
  });

  it('las propuestas solo las ven sus dos partes; las alianzas, todos', () => {
    aplicar(e, proponerAlianza(e, 'a', { para: 'b' }));
    expect(vistaJugador(e, 'b').propuestasAlianza).toEqual([{ de: 'a', para: 'b' }]);
    expect(vistaJugador(e, 'c').propuestasAlianza).toEqual([]);
    aplicar(e, responderAlianza(e, 'b', { de: 'a', aceptar: true }));
    expect(vistaJugador(e, 'c').alianzas).toEqual([{ miembros: ['a', 'b'] }]);
  });
});

describe('lo que cambia entre aliados', () => {
  beforeEach(() => {
    partida(['a', 'b', 'c']);
    ciudad('a', 0, 0); ciudad('b', 5, 5); ciudad('c', 5, 0);
  });

  it('no se pueden atacar; a un rival sí', () => {
    aliar('a', 'b');
    tropa('a', 2, 2); tropa('b', 3, 2); tropa('c', 2, 1);
    expect(() => atacar(e, 'a', { desde: { x: 2, y: 2 }, hasta: { x: 3, y: 2 } }, rng())).toThrow(/aliado/);
    expect(() => atacar(e, 'a', { desde: { x: 2, y: 2 }, hasta: { x: 2, y: 1 } }, rng())).not.toThrow();
  });

  it('se pasa por la tierra del aliado sin quitársela', () => {
    aliar('a', 'b');
    tile(3, 2).dueno = 'b';
    tile(2, 3).dueno = 'c';
    tropa('a', 2, 2);
    const porAliado = moverEjercito(e, 'a', { desde: { x: 2, y: 2 }, hasta: { x: 3, y: 2 } });
    expect(porAliado.map(ev => ev.tipo)).not.toContain('TerritorioReclamado');
    const porRival = moverEjercito(e, 'a', { desde: { x: 2, y: 2 }, hasta: { x: 2, y: 3 } });
    expect(porRival.map(ev => ev.tipo)).toContain('TerritorioReclamado');
  });

  it('la ciudad no le recupera la frontera a un aliado', () => {
    tile(1, 0).dueno = 'b';
    expect(recuperarFronteras(e).filter(ev => ev.jugadorId === 'a')).toHaveLength(1);
    aliar('a', 'b');
    expect(recuperarFronteras(e).filter(ev => ev.jugadorId === 'a')).toHaveLength(0);
  });

  it('comparten la visión', () => {
    tile(4, 4).descubiertoPor = ['b'];
    const ve = (id) => vistaJugador(e, id).mapa[4 * N + 4].descubierto;
    expect(ve('a')).toBe(false);
    aliar('a', 'b');
    expect(ve('a')).toBe(true);
    expect(ve('c')).toBe(false);
  });

  it('se pueden regalar recursos, solo a un aliado y solo lo que se tiene', () => {
    const oro = (id) => jugadorPorId(e, id).recursos.gold;
    jugadorPorId(e, 'a').recursos.gold = 50;
    const antesB = oro('b');
    expect(() => regalarRecursos(e, 'a', { para: 'b', recurso: 'gold', cantidad: 10 })).toThrow(/aliado/);
    aliar('a', 'b');
    aplicar(e, regalarRecursos(e, 'a', { para: 'b', recurso: 'gold', cantidad: 10 }));
    expect(oro('a')).toBe(40);
    expect(oro('b')).toBe(antesB + 10);
    expect(() => regalarRecursos(e, 'a', { para: 'b', recurso: 'gold', cantidad: 41 })).toThrow(/No tenés/);
    expect(() => regalarRecursos(e, 'a', { para: 'b', recurso: 'gold', cantidad: -5 })).toThrow(/entero/);
    expect(() => regalarRecursos(e, 'a', { para: 'b', recurso: 'gold', cantidad: 1.5 })).toThrow(/entero/);
    expect(() => regalarRecursos(e, 'a', { para: 'c', recurso: 'gold', cantidad: 1 })).toThrow(/aliado/);
  });

  it('la máquina aliada no ataca a su aliado (y sin alianza sí lo ataca)', () => {
    const combatesDelBot = (aliados) => {
      partida(['a', 'bot1', 'c']);
      // En fácil ataca a cualquier vecino enemigo sin calcular si le conviene.
      jugadorPorId(e, 'bot1').dificultadIA = 'facil';
      ciudad('a', 0, 0); ciudad('bot1', 2, 2); ciudad('c', 5, 5);
      if (aliados) aplicar(e, [{ tipo: 'AlianzaFormada', turno: 1, jugadorId: 'bot1', datos: { con: 'a' } }]);
      tropa('bot1', 1, 0);
      return jugarTurnoIA(e, 'bot1', rng()).filter(ev => ev.tipo === 'CombateResuelto').length;
    };
    expect(combatesDelBot(false)).toBeGreaterThan(0);
    expect(combatesDelBot(true)).toBe(0);
  });
});

describe('romper la alianza', () => {
  beforeEach(() => {
    partida(['a', 'b', 'c']);
    ciudad('a', 0, 0); ciudad('b', 5, 5); ciudad('c', 5, 0);
    aliar('a', 'b');
    tropa('a', 2, 2); tropa('b', 3, 2);
  });
  const ataque = () => atacar(e, 'a', { desde: { x: 2, y: 2 }, hasta: { x: 3, y: 2 } }, rng());

  it('deja una tregua: no se pueden atacar hasta la ronda siguiente', () => {
    aplicar(e, romperAlianza(e, 'a'));
    expect(sonAliados(e, 'a', 'b')).toBe(false);
    expect(enTregua(e, 'a', 'b')).toBe(true);
    expect(ataque).toThrow(/tregua/);
    cerrarRonda();
    expect(e.turno).toBe(2);
    expect(enTregua(e, 'a', 'b')).toBe(false);
    expect(e.treguas).toEqual([]);
    expect(ataque).not.toThrow();
  });

  it('se deja de compartir la visión en el acto', () => {
    tile(4, 4).descubiertoPor = ['b'];
    aplicar(e, romperAlianza(e, 'a'));
    expect(vistaJugador(e, 'a').mapa[4 * N + 4].descubierto).toBe(false);
  });

  it('quien no tiene alianza no puede romper nada', () => {
    expect(() => romperAlianza(e, 'c')).toThrow(/ninguna alianza/);
  });

  it('si uno sale de una alianza de tres, los otros dos siguen aliados', () => {
    partida(['a', 'b', 'c', 'd']);
    aliar('a', 'b'); aliar('c', 'a');
    aplicar(e, romperAlianza(e, 'a'));
    expect(sonAliados(e, 'b', 'c')).toBe(true);
    expect(enTregua(e, 'a', 'b')).toBe(true);
    expect(enTregua(e, 'a', 'c')).toBe(true);
  });
});

describe('los aliados ganan juntos', () => {
  const repartir = (cantidades) => {
    let i = 0;
    for (const [id, n] of Object.entries(cantidades)) {
      for (let k = 0; k < n; k++) e.mapa[i++].dueno = id;
    }
  };
  const victoria = () => evaluarVictoria(e, 'a', e.jugadores.filter(j => j.activo), e.turno)?.datos.ganador ?? null;

  beforeEach(() => partida(['a', 'b', 'c'], { porcentajeVictoria: 60 }));

  it('el territorio de la alianza se suma para llegar al objetivo', () => {
    repartir({ a: 12, b: 10, c: 5 }); // 36 casillas: a 33%, b 28%, juntos 61%
    expect(victoria()).toBeNull();
    aliar('a', 'b');
    expect(victoria()).toEqual({ jugadorId: 'a', tipoVictoria: 'dominacion', turno: 1, aliados: ['b'] });
  });

  it('la barra de dominación muestra lo del bando', () => {
    repartir({ a: 9, b: 9, c: 5 });
    aliar('a', 'b');
    expect(vistaJugador(e, 'a').jugadores.find(j => j.id === 'a').dominacion).toEqual({ tiles: 18, porcentaje: 0.5 });
  });

  it('si solo quedan aliados en pie, ganan', () => {
    repartir({ a: 3, b: 2, c: 1 });
    aliar('a', 'b');
    aplicar(e, [{ tipo: 'JugadorEliminado', turno: 1, jugadorId: 'c', datos: { jugadorId: 'c' } }]);
    expect(victoria()).toMatchObject({ jugadorId: 'a', tipoVictoria: 'ultimo_en_pie', aliados: ['b'] });
  });

  it('al llegar al límite de rondas gana el bando con más territorio', () => {
    e.config.limiteRondas = 1;
    repartir({ a: 4, b: 4, c: 7 });
    expect(victoria()).toMatchObject({ jugadorId: 'c', tipoVictoria: 'limite_rondas' });
    aliar('a', 'b');
    expect(victoria()).toMatchObject({ tipoVictoria: 'limite_rondas', aliados: ['b'] });
  });

  it('un aliado eliminado sale de la alianza', () => {
    aliar('a', 'b');
    aplicar(e, [{ tipo: 'JugadorEliminado', turno: 1, jugadorId: 'b', datos: { jugadorId: 'b' } }]);
    expect(e.alianzas).toEqual([]);
  });
});

describe('la máquina y las alianzas', () => {
  beforeEach(() => partida(['a', 'bot1', 'bot2', 'c']));
  const tierra = (id, n, fila) => { for (let x = 0; x < n; x++) tile(x, fila).dueno = id; };
  const respuesta = (de, para) => proponerAlianza(e, de, { para }).map(ev => ev.tipo);

  it('acepta en el acto si va perdiendo', () => {
    tierra('bot1', 2, 0); tierra('c', 5, 1);
    expect(respuesta('a', 'bot1')).toEqual(['AlianzaPropuesta', 'AlianzaFormada']);
  });

  it('rechaza si es la que más territorio tiene', () => {
    tierra('bot1', 5, 0); tierra('c', 2, 1);
    expect(respuesta('a', 'bot1')).toEqual(['AlianzaPropuesta', 'AlianzaRechazada']);
    aplicar(e, proponerAlianza(e, 'a', { para: 'bot1' }));
    expect(e.propuestasAlianza).toEqual([]);
  });

  it('nunca se alía con otra máquina', () => {
    tierra('bot1', 1, 0); tierra('bot2', 1, 1); tierra('c', 5, 2);
    aplicar(e, proponerAlianza(e, 'a', { para: 'bot1' }));
    expect(sonAliados(e, 'a', 'bot1')).toBe(true);
    expect(respuesta('a', 'bot2')).toEqual(['AlianzaPropuesta', 'AlianzaRechazada']);
    expect(respuesta('bot2', 'bot1')).toEqual(['AlianzaPropuesta', 'AlianzaRechazada']);
  });
});
