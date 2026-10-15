import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { crearEstado, jugadorPorId, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { capitalDe, moverCapital } from '../../src/domain/mapa/reglas/capital.js';
import { produccionBruta, terminarTurno } from '../../src/domain/mapa/reglas/turnos.js';
import { defensaDeCiudad } from '../../src/domain/mapa/reglas/combate.js';
import { vistaJugador } from '../../src/domain/mapa/reglas/visibilidad.js';
import {
  PRODUCCION_BASE_CIUDAD, BONO_TERRENO_PRODUCCION, BONO_PRODUCCION_CAPITAL, BONO_DEFENSA_CAPITAL,
  COSTO_MOVER_CAPITAL, EFECTOS_PROBLEMAS,
} from '../../src/domain/mapa/constantes.js';
import { MapGameRepo } from '../../src/db/MapGameRepo.js';
import { MapGameService } from '../../src/services/MapGameService.js';

// Mapa 5x5 de llanura armado a mano: cada test pone las ciudades que necesita.
let e;
beforeEach(() => {
  e = crearEstado({ nombre: 'T', semilla: 's1', config: { tamanoMapa: 10 } });
  e.config.tamanoMapa = 5;
  e.mapa = [];
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      e.mapa.push({ x, y, terreno: 'plains', recurso: null, dueno: null, ciudad: null, ejercito: null, descubiertoPor: [] });
    }
  }
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
  aplicar(e, iniciar(e));
  for (const t of e.mapa) { t.ciudad = null; t.dueno = null; t.descubiertoPor = []; }
  for (const j of e.jugadores) delete j.capital; // como una partida guardada antes de la capital
  ciudad('p1', 0, 0);
  ciudad('p1', 2, 0);
  ciudad('p2', 4, 4);
  jugadorPorId(e, 'p1').recursos.gold = 100;
});

function ciudad(jugadorId, x, y, nivel = 1) {
  const t = tileEn(e, x, y);
  t.dueno = jugadorId;
  t.ciudad = { nombre: `C${x}${y}`, nivel, poblacion: 500, edificios: [] };
  t.descubiertoPor.push(jugadorId);
}

const llanura = (recurso) => (PRODUCCION_BASE_CIUDAD[recurso] ?? 0) + (BONO_TERRENO_PRODUCCION.plains[recurso] ?? 0);

describe('capitalDe', () => {
  it('partida vieja sin el campo: la ciudad de mayor nivel, y en un empate la primera del mapa', () => {
    expect(capitalDe(e, jugadorPorId(e, 'p1'))).toEqual({ x: 0, y: 0 });
    tileEn(e, 2, 0).ciudad.nivel = 3;
    expect(capitalDe(e, jugadorPorId(e, 'p1'))).toEqual({ x: 2, y: 0 });
  });

  it('respeta la elegida mientras sea suya y pasa sola a la más grande si se la capturan', () => {
    const p1 = jugadorPorId(e, 'p1');
    p1.capital = { x: 2, y: 0 };
    expect(capitalDe(e, p1)).toEqual({ x: 2, y: 0 });
    tileEn(e, 2, 0).dueno = 'p2';
    expect(capitalDe(e, p1)).toEqual({ x: 0, y: 0 });
  });

  it('la primera ciudad queda anotada como capital y una fundada después no se la lleva', () => {
    const nueva = crearEstado({ nombre: 'N', semilla: 's2' });
    aplicar(nueva, unirse(nueva, { id: 'p1', nombre: 'A', civilizacion: 'Incas' }));
    aplicar(nueva, unirse(nueva, { id: 'p2', nombre: 'B', civilizacion: 'Mayas' }));
    aplicar(nueva, iniciar(nueva));
    const p1 = jugadorPorId(nueva, 'p1');
    const inicial = nueva.mapa.find(t => t.ciudad && t.dueno === 'p1');
    expect(p1.capital).toEqual({ x: inicial.x, y: inicial.y });
    const otra = nueva.mapa.find(t => !t.ciudad && t.terreno !== 'water');
    aplicar(nueva, [{ tipo: 'CiudadFundada', turno: 1, jugadorId: 'p1', datos: { x: otra.x, y: otra.y, nombre: 'Otra' } }]);
    expect(capitalDe(nueva, p1)).toEqual({ x: inicial.x, y: inicial.y });
  });

  it('sin ciudades no hay capital', () => {
    for (const t of e.mapa) if (t.dueno === 'p1') { t.ciudad = null; t.dueno = null; }
    expect(capitalDe(e, jugadorPorId(e, 'p1'))).toBeNull();
  });
});

describe('moverCapital', () => {
  it('cobra el oro, muda la capital y la nueva no produce durante la ronda', () => {
    const evs = moverCapital(e, 'p1', { x: 2, y: 0 });
    expect(evs.map(x => x.tipo)).toEqual(['RecursosGastados', 'CapitalMovida']);
    expect(evs[0].datos.costo).toEqual(COSTO_MOVER_CAPITAL);
    expect(evs[1].datos).toEqual({ x: 2, y: 0, sinProducirHasta: e.turno + 1 });
    aplicar(e, evs);
    expect(jugadorPorId(e, 'p1').recursos.gold).toBe(100 - COSTO_MOVER_CAPITAL.gold);
    expect(jugadorPorId(e, 'p1').capital).toEqual({ x: 2, y: 0 });
    expect(tileEn(e, 2, 0).ciudad.mudanzaHasta).toBe(e.turno + 1);
  });

  it('la inflación encarece la mudanza', () => {
    jugadorPorId(e, 'p1').problemas = [{ id: 'pr1', tipo: 'inflacion', gravedad: 1, ciudades: [{ x: 0, y: 0 }] }];
    const [gasto] = moverCapital(e, 'p1', { x: 2, y: 0 });
    expect(gasto.datos.costo.gold).toBe(Math.ceil(COSTO_MOVER_CAPITAL.gold * (1 + EFECTOS_PROBLEMAS.inflacion)));
  });

  it('rechaza sin turno, sin ciudad, ciudad ajena, la que ya es capital y sin oro, y ningún rechazo gasta', () => {
    const casos = [
      ['p2', { x: 4, y: 4 }, 'NO_ES_TU_TURNO'],
      ['p1', { x: 1, y: 1 }, 'SIN_CIUDAD'],
      ['p1', { x: 4, y: 4 }, 'CIUDAD_AJENA'],
      ['p1', { x: 0, y: 0 }, 'YA_ES_CAPITAL'],
    ];
    for (const [quien, donde, codigo] of casos) {
      expect(() => moverCapital(e, quien, donde)).toThrowError(expect.objectContaining({ codigo }));
    }
    jugadorPorId(e, 'p1').recursos.gold = COSTO_MOVER_CAPITAL.gold - 1;
    expect(() => moverCapital(e, 'p1', { x: 2, y: 0 }))
      .toThrowError(expect.objectContaining({ codigo: 'RECURSOS_INSUFICIENTES' }));
    expect(jugadorPorId(e, 'p1').recursos.gold).toBe(COSTO_MOVER_CAPITAL.gold - 1);
  });
});

describe('efectos de la capital', () => {
  it('la capital rinde un 20% más que una ciudad igual que no lo es', () => {
    expect(produccionBruta(e, 'p1').food).toBeCloseTo(llanura('food') * (2 + BONO_PRODUCCION_CAPITAL));
  });

  it('la capital recién mudada no produce una ronda, y después rinde con el bono', () => {
    aplicar(e, moverCapital(e, 'p1', { x: 2, y: 0 }));
    // La vieja ya no es capital y la nueva esta instalandose: solo rinde la vieja, sin bono.
    expect(produccionBruta(e, 'p1').food).toBeCloseTo(llanura('food'));
    aplicar(e, terminarTurno(e, 'p1'));
    aplicar(e, terminarTurno(e, 'p2'));
    expect(produccionBruta(e, 'p1').food).toBeCloseTo(llanura('food') * (2 + BONO_PRODUCCION_CAPITAL));
  });

  it('la capital suma defensa plana', () => {
    expect(defensaDeCiudad(e, tileEn(e, 0, 0)) - defensaDeCiudad(e, tileEn(e, 2, 0))).toBe(BONO_DEFENSA_CAPITAL);
  });

  it('la vista marca la capital propia y la ajena solo si esa casilla está descubierta', () => {
    const vista = vistaJugador(e, 'p1');
    expect(vista.jugadores.find(j => j.id === 'p1').capital).toEqual({ x: 0, y: 0 });
    expect(vista.mapa[0].ciudad.capital).toBe(true);
    expect(vista.mapa[2].ciudad.capital).toBe(false);
    expect(vista.mapa[24]).toEqual({ x: 4, y: 4, descubierto: false });
    tileEn(e, 4, 4).descubiertoPor.push('p1');
    expect(vistaJugador(e, 'p1').mapa[24].ciudad.capital).toBe(true);
  });
});

describe('moverCapital por el servicio', () => {
  it('la acción llega al dominio y la vista devuelve la capital nueva', async () => {
    const repo = new MapGameRepo(new Database(':memory:'), 'sqlite');
    repo.init();
    const svc = new MapGameService({ repo });
    const { id } = await svc.crearPartida({ nombre: 'Solo', contraIA: true });
    const { token } = await svc.unirse(id, { id: 'yo', nombre: 'Yo', civilizacion: 'Incas' });
    await svc.iniciar(id);
    const estado = await svc._resolver(id);
    const capital = estado.mapa.find(t => t.ciudad && t.dueno === 'yo');
    const libre = estado.mapa.find(t => t.descubiertoPor.includes('yo') && !t.ciudad && t.terreno !== 'water');
    libre.dueno = 'yo';
    libre.ciudad = { nombre: 'Nueva', nivel: 1, poblacion: 500, edificios: [] };
    estado.jugadores.find(j => j.id === 'yo').recursos.gold = 100;

    const r = await svc.accion(id, 'yo', { tipo: 'moverCapital', x: libre.x, y: libre.y }, token);
    expect(r.vista.jugadores.find(j => j.id === 'yo').capital).toEqual({ x: libre.x, y: libre.y });
    const tamano = r.vista.config.tamanoMapa;
    expect(r.vista.mapa[capital.y * tamano + capital.x].ciudad.capital).toBe(false);
    expect(r.vista.mapa[libre.y * tamano + libre.x].ciudad.capital).toBe(true);
  });
});
