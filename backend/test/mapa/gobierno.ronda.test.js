import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado, jugadorPorId } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { terminarTurno, producirParaJugador, produccionConResto, produccionBruta } from '../../src/domain/mapa/reglas/turnos.js';
import { cerrarRondaGobierno, multiplicadorProduccion } from '../../src/domain/mapa/reglas/gobierno.js';
import { crearRng } from '../../src/domain/mapa/rng.js';

let e, p1;
const siempre = () => 0; // el azar sale mal siempre
const nunca = () => 0.999; // el azar no ocurre nunca
const todos = (v) => ({ pueblo: v, lideres: v, militares: v });
const de = (evs, tipo, id = 'p1') => evs.filter(x => x.tipo === tipo && x.jugadorId === id);

beforeEach(() => {
  e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  p1 = jugadorPorId(e, 'p1');
  p1.apoyo = todos(100); // sin crisis ni expulsion salvo que el test lo pida
});

describe('cerrarRondaGobierno: pérdida y regreso del poder', () => {
  it('un bot nunca pierde el poder aunque tenga gobierno no despótico', () => {
    const bot = jugadorPorId(e, 'p2');
    bot.esBot = true;
    bot.gobierno = 'monarquia';
    bot.apoyo = todos(0);
    expect(cerrarRondaGobierno(e, siempre).filter(x => x.jugadorId === 'p2')).toEqual([]);
  });

  it('despotismo nunca emite PoderPerdido en 500 rondas simuladas', () => {
    p1.apoyo = todos(0);
    const rng = crearRng('desp');
    for (let i = 0; i < 500; i++) {
      e.turno = i + 1;
      expect(de(cerrarRondaGobierno(e, rng), 'PoderPerdido')).toEqual([]);
    }
  });

  it('monarquía: pierde por sucesión con el azar adverso y vuelve con la misma probabilidad', () => {
    p1.gobierno = 'monarquia';
    const perdio = de(cerrarRondaGobierno(e, siempre), 'PoderPerdido');
    expect(perdio.map(x => x.datos.motivo)).toEqual(['sucesion']);
    expect(de(cerrarRondaGobierno(e, nunca), 'PoderPerdido')).toEqual([]);

    p1.enPoder = false;
    expect(de(cerrarRondaGobierno(e, siempre), 'PoderRecuperado').map(x => x.datos.motivo)).toEqual(['sucesion']);
    expect(de(cerrarRondaGobierno(e, nunca), 'PoderRecuperado')).toEqual([]);
  });

  it('república: no hay elección fuera de la ronda múltiplo de rondasEntreElecciones', () => {
    p1.gobierno = 'republica_directa';
    p1.apoyo = { pueblo: 40, lideres: 100, militares: 100 };
    e.turno = 7;
    expect(de(cerrarRondaGobierno(e, nunca), 'PoderPerdido')).toEqual([]);
  });

  it('república: en ronda de elecciones con apoyo bajo pierde el poder', () => {
    p1.gobierno = 'republica_directa';
    p1.apoyo = { pueblo: 40, lideres: 100, militares: 100 };
    e.turno = 8;
    expect(de(cerrarRondaGobierno(e, nunca), 'PoderPerdido').map(x => x.datos.motivo)).toEqual(['eleccion']);
  });

  it('una partida vieja sin rondasEntreElecciones usa 8 y sí hace elecciones', () => {
    delete e.config.rondasEntreElecciones;
    p1.gobierno = 'republica_directa';
    p1.apoyo = { pueblo: 40, lideres: 100, militares: 100 };
    e.turno = 8;
    expect(de(cerrarRondaGobierno(e, nunca), 'PoderPerdido').map(x => x.datos.motivo)).toEqual(['eleccion']);
  });

  it('república: sin poder, gana la elección con apoyo suficiente y vuelve', () => {
    p1.gobierno = 'republica_indirecta';
    p1.enPoder = false;
    e.turno = 16;
    expect(de(cerrarRondaGobierno(e, nunca), 'PoderRecuperado').map(x => x.datos.motivo)).toEqual(['eleccion']);
  });

  it('teocracia, oligarquía y tecnocracia: sin poder, vuelven cuando los líderes (con su respeto) llegan a 50', () => {
    for (const g of ['teocracia', 'oligarquia', 'tecnocracia']) {
      p1.gobierno = g;
      p1.enPoder = false;
      p1.apoyo = { pueblo: 0, lideres: 30, militares: 0 };
      expect(de(cerrarRondaGobierno(e, nunca), 'PoderRecuperado')).toEqual([]);
      p1.apoyo = { pueblo: 0, lideres: 60, militares: 0 };
      expect(de(cerrarRondaGobierno(e, nunca), 'PoderRecuperado').map(x => x.datos.motivo)).toEqual(['apoyo']);
    }
  });

  it('multiplicadorProduccion: teocracia +20% cultura, oligarquía +15% oro, tecnocracia +20% ciencia', () => {
    expect(multiplicadorProduccion({ gobierno: 'teocracia' }, 'culture')).toBeCloseTo(1.2);
    expect(multiplicadorProduccion({ gobierno: 'oligarquia' }, 'gold')).toBeCloseTo(1.15);
    expect(multiplicadorProduccion({ gobierno: 'tecnocracia' }, 'science')).toBeCloseTo(1.2);
    expect(multiplicadorProduccion({ gobierno: 'tecnocracia' }, 'gold')).toBe(1);
  });

  it('aristocracia: vuelve con los líderes y produce +20% comida; tiranía: la echan y vuelve los militares', () => {
    expect(multiplicadorProduccion({ gobierno: 'aristocracia' }, 'food')).toBeCloseTo(1.2);
    expect(multiplicadorProduccion({ gobierno: 'tirania' }, 'gold')).toBeCloseTo(1.15);
    p1.gobierno = 'tirania';
    p1.apoyo = { pueblo: 100, lideres: 100, militares: 5 };
    expect(de(cerrarRondaGobierno(e, nunca), 'PoderPerdido').map(x => x.datos.motivo)).toEqual(['expulsion']);
    p1.enPoder = false;
    expect(de(cerrarRondaGobierno(e, nunca), 'PoderRecuperado')).toEqual([]);
    p1.apoyo = { pueblo: 0, lideres: 0, militares: 80 };
    expect(de(cerrarRondaGobierno(e, nunca), 'PoderRecuperado').map(x => x.datos.motivo)).toEqual(['apoyo']);
    p1.gobierno = 'aristocracia';
    p1.apoyo = { pueblo: 0, lideres: 60, militares: 0 };
    expect(de(cerrarRondaGobierno(e, nunca), 'PoderRecuperado').map(x => x.datos.motivo)).toEqual(['apoyo']);
  });

  it('absolutismo/autoritarismo: los echan los líderes y vuelven con su apoyo; dictadura/totalitarismo: los militares', () => {
    for (const g of ['absolutismo', 'autoritarismo']) {
      p1.gobierno = g;
      p1.apoyo = { pueblo: 100, lideres: 5, militares: 100 };
      expect(de(cerrarRondaGobierno(e, nunca), 'PoderPerdido').map(x => x.datos.motivo)).toEqual(['expulsion']);
      p1.enPoder = false;
      expect(de(cerrarRondaGobierno(e, nunca), 'PoderRecuperado')).toEqual([]);
      p1.apoyo = { pueblo: 0, lideres: 60, militares: 0 };
      expect(de(cerrarRondaGobierno(e, nunca), 'PoderRecuperado').map(x => x.datos.motivo)).toEqual(['apoyo']);
      p1.enPoder = true;
    }
    for (const g of ['dictadura', 'totalitarismo']) {
      p1.gobierno = g;
      p1.apoyo = { pueblo: 100, lideres: 100, militares: 5 };
      expect(de(cerrarRondaGobierno(e, nunca), 'PoderPerdido').map(x => x.datos.motivo)).toEqual(['expulsion']);
    }
  });

  it('estratocracia: sin poder, recupera al llegar los militares a 70', () => {
    p1.gobierno = 'estratocracia';
    p1.enPoder = false;
    p1.apoyo = { pueblo: 100, lideres: 100, militares: 55 }; // + respeto 10 = 65
    e.turno = 3;
    expect(de(cerrarRondaGobierno(e, nunca), 'PoderRecuperado')).toEqual([]);
    p1.apoyo.militares = 60; // 70 efectivo
    expect(de(cerrarRondaGobierno(e, nunca), 'PoderRecuperado').map(x => x.datos.motivo)).toEqual(['apoyo']);
  });

  it('expulsión: líderes bajo 25 sacan del poder', () => {
    p1.gobierno = 'republica_semidirecta';
    p1.apoyo = { pueblo: 100, lideres: 20, militares: 100 };
    e.turno = 3;
    expect(de(cerrarRondaGobierno(e, nunca), 'PoderPerdido').map(x => x.datos.motivo)).toEqual(['expulsion']);
  });

  it('crisis: con el azar adverso y poco apoyo se pierde el poder', () => {
    p1.gobierno = 'estratocracia';
    p1.apoyo = { pueblo: 50, lideres: 50, militares: 50 };
    e.turno = 3;
    expect(de(cerrarRondaGobierno(e, siempre), 'PoderPerdido').map(x => x.datos.motivo)).toEqual(['crisis']);
  });

  it('sobre 20000 rondas la frecuencia de sucesión en monarquía ronda 0,63%', () => {
    p1.gobierno = 'monarquia';
    const rng = crearRng('frecuencia');
    let sucesiones = 0;
    for (let i = 0; i < 20000; i++) {
      sucesiones += de(cerrarRondaGobierno(e, rng), 'PoderPerdido').filter(x => x.datos.motivo === 'sucesion').length;
    }
    expect(sucesiones / 20000).toBeGreaterThan(0.0043);
    expect(sucesiones / 20000).toBeLessThan(0.0083);
  });
});

describe('cerrarRondaGobierno: apoyo', () => {
  const darTierra = (jugadorId, n) => {
    const libres = e.mapa.filter(t => t.terreno !== 'water' && !t.ciudad && !t.dueno).slice(0, n);
    for (const t of libres) t.dueno = jugadorId;
  };

  it('sube con territorio sobre el promedio', () => {
    p1.apoyo = todos(50);
    darTierra('p1', 12);
    const [ev] = de(cerrarRondaGobierno(e, nunca), 'ApoyoActualizado');
    expect(ev.datos.apoyo).toEqual(todos(52));
  });

  it('baja con territorio bajo el promedio', () => {
    p1.apoyo = todos(50);
    darTierra('p2', 12);
    const [ev] = de(cerrarRondaGobierno(e, nunca), 'ApoyoActualizado');
    expect(ev.datos.apoyo).toEqual(todos(49)); // baja 1, no 2: la caida es mas lenta que la subida
  });

  it('por territorio solo, el apoyo nunca baja de 20', () => {
    p1.apoyo = todos(20);
    darTierra('p2', 12);
    expect(de(cerrarRondaGobierno(e, nunca), 'ApoyoActualizado')).toEqual([]);
    p1.apoyo = todos(5); // ya estaba mas abajo: tampoco lo sube ni lo baja por territorio
    expect(de(cerrarRondaGobierno(e, nunca), 'ApoyoActualizado')).toEqual([]);
  });

  it('quien no manda recupera 1 punto por ronda hacia 50, sin pasarse', () => {
    p1.gobierno = 'monarquia';
    p1.enPoder = false;
    p1.apoyo = { pueblo: 30, lideres: 50, militares: 80 };
    const [ev] = de(cerrarRondaGobierno(e, nunca), 'ApoyoActualizado');
    expect(ev.datos.apoyo).toEqual({ pueblo: 31, lideres: 50, militares: 80 });
  });
});

describe('integración con terminarTurno', () => {
  it('al cerrar la ronda, los eventos de gobierno van antes de RondaCompletada y son deterministas', () => {
    const libres = e.mapa.filter(t => t.terreno !== 'water' && !t.ciudad && !t.dueno).slice(0, 12);
    for (const t of libres) t.dueno = 'p1'; // para que el apoyo cambie
    aplicar(e, terminarTurno(e, 'p1'));
    const evs = terminarTurno(e, 'p2');
    const tipos = evs.map(x => x.tipo);
    expect(tipos).toContain('ApoyoActualizado');
    expect(tipos.indexOf('ApoyoActualizado')).toBeLessThan(tipos.indexOf('RondaCompletada'));
    expect(terminarTurno(e, 'p2')).toEqual(evs);
  });
});

describe('bono de producción por gobierno', () => {
  it('multiplicadorProduccion: repúblicas +10% a todo, monarquía +20% oro, estratocracia +20% madera y piedra', () => {
    for (const g of ['republica_directa', 'republica_indirecta', 'republica_semidirecta']) {
      expect(multiplicadorProduccion({ gobierno: g }, 'gold')).toBeCloseTo(1.1);
      expect(multiplicadorProduccion({ gobierno: g }, 'food')).toBeCloseTo(1.1);
    }
    expect(multiplicadorProduccion({ gobierno: 'monarquia' }, 'gold')).toBeCloseTo(1.2);
    expect(multiplicadorProduccion({ gobierno: 'monarquia' }, 'wood')).toBe(1);
    expect(multiplicadorProduccion({ gobierno: 'estratocracia' }, 'wood')).toBeCloseTo(1.2);
    expect(multiplicadorProduccion({ gobierno: 'estratocracia' }, 'stone')).toBeCloseTo(1.2);
    expect(multiplicadorProduccion({ gobierno: 'estratocracia' }, 'gold')).toBe(1);
    expect(multiplicadorProduccion({}, 'gold')).toBe(1);
  });

  // Antes cada turno se redondeaba solo: 3 de oro x 1,1 = 3,3 daba 3 y el bono
  // desaparecia. Ahora el decimal que sobra se lleva al turno siguiente.
  const jugarRondas = (n) => {
    const total = {};
    for (let i = 0; i < n; i++) {
      const { produccion, resto } = produccionConResto(e, 'p1');
      aplicar(e, [{ tipo: 'RecursosProducidos', turno: e.turno, jugadorId: 'p1', datos: { jugadorId: 'p1', produccion, resto } }]);
      for (const [r, v] of Object.entries(produccion)) total[r] = (total[r] ?? 0) + v;
    }
    return total;
  };

  // La base es la produccion bruta (con los decimales de la capital), no la ya
  // redondeada: el bono se calcula sobre lo exacto.
  it('el bono NO se pierde con producciones chicas: en 10 rondas suma el porcentaje exacto', () => {
    const base = produccionBruta(e, 'p1').gold;
    p1.gobierno = 'republica_directa';
    expect(jugarRondas(10).gold).toBe(Math.floor(10 * base * 1.1 + 1e-9));
  });

  it('monarquía rinde un 20% más de oro y no toca la comida', () => {
    const base = produccionBruta(e, 'p1');
    p1.gobierno = 'monarquia';
    const total = jugarRondas(10);
    expect(total.gold).toBe(Math.floor(10 * base.gold * 1.2 + 1e-9));
    expect(total.food).toBe(Math.floor(10 * base.food + 1e-9));
  });

  it('despotismo: lo que se ve es lo que se cobra, y el decimal de la capital queda de resto', () => {
    const { produccion, resto } = produccionConResto(e, 'p1');
    expect(produccion).toEqual(producirParaJugador(e, 'p1'));
    const bruta = produccionBruta(e, 'p1');
    for (const [r, v] of Object.entries(resto)) expect(v).toBeCloseTo(bruta[r] - produccion[r]);
  });

  it('el evento de producción solo lleva `resto` si hay uno', () => {
    // Con todas las ciudades saqueadas nadie produce, asi que no hay decimales.
    for (const t of e.mapa) if (t.ciudad) t.ciudad.saqueadaHasta = 99;
    aplicar(e, terminarTurno(e, 'p1'));
    const evs = terminarTurno(e, 'p2').filter(x => x.tipo === 'RecursosProducidos');
    expect(evs).toHaveLength(2);
    for (const ev of evs) expect(ev.datos.resto).toBeUndefined();
  });
});
