import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado, jugadorPorId, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { terminarTurno } from '../../src/domain/mapa/reglas/turnos.js';
import { subdivisionesDe, subdivisionDeCiudad, territorioDe } from '../../src/domain/mapa/reglas/subdivisiones.js';
import { formaEstadoDe } from '../../src/domain/mapa/reglas/gobierno.js';
import { organizarSubdivisionesIA } from '../../src/domain/mapa/iaSubdivisiones.js';
import { jugarTurnoIA } from '../../src/domain/mapa/ia.js';
import { crearRng } from '../../src/domain/mapa/rng.js';

let e, bot;
const ACTIVA = { activa: true };
const clave = (c) => `${c.x},${c.y}`;
const ciudadesDelBot = () => e.mapa.filter(t => t.ciudad && t.dueno === 'bot').map(t => ({ x: t.x, y: t.y }));

function agregarCiudades(n) {
  const cap = ciudadesDelBot()[0];
  let puestas = 0;
  for (const t of e.mapa) {
    if (puestas >= n) break;
    if (t.terreno === 'water' || t.ciudad || t.dueno) continue;
    t.terreno = 'plains';
    t.ciudad = { nombre: `X${t.x}_${t.y}`, nivel: 1, poblacion: 500, edificios: [] };
    t.dueno = 'bot';
    puestas++;
  }
  return cap;
}
const correr = (opciones = ACTIVA) => {
  const evs = organizarSubdivisionesIA(e, 'bot', opciones);
  aplicar(e, evs);
  return evs;
};

beforeEach(() => {
  e = crearEstado({ nombre: 'T', semilla: 'ia-sub' });
  aplicar(e, unirse(e, { id: 'bot', nombre: 'La Máquina', civilizacion: 'Autómatas', esBot: true, dificultadIA: 'normal' }));
  aplicar(e, unirse(e, { id: 'h1', nombre: 'H', civilizacion: 'Civ1' }));
  aplicar(e, iniciar(e));
  bot = jugadorPorId(e, 'bot');
});

describe('la IA organiza sus subdivisiones', () => {
  it('con la opción apagada no hace nada, y por defecto está prendida', () => {
    agregarCiudades(5);
    expect(organizarSubdivisionesIA(e, 'bot', { activa: false })).toEqual([]);
    expect(organizarSubdivisionesIA(e, 'bot').length).toBeGreaterThan(0);
  });

  it('con menos de 3 ciudades sigue unitario', () => {
    agregarCiudades(1);
    expect(correr()).toEqual([]);
    expect(formaEstadoDe(bot)).toBe('unitario');
  });

  it('con 3 ciudades pasa a federal y arma Freguesias de hasta 3 ciudades dentro de un Municipio', () => {
    agregarCiudades(5); // 6 en total con la capital
    correr();
    expect(formaEstadoDe(bot)).toBe('federal');
    const subs = subdivisionesDe(bot);
    const freguesias = subs.filter(s => s.tipo === 'freguesia');
    const municipios = subs.filter(s => s.tipo === 'municipio');
    expect(freguesias.length).toBeGreaterThanOrEqual(2);
    for (const f of freguesias) {
      expect(f.ciudades.length).toBeGreaterThanOrEqual(1);
      expect(f.ciudades.length).toBeLessThanOrEqual(3);
      expect(municipios.some(m => m.id === f.padreId)).toBe(true);
    }
    for (const m of municipios) expect(freguesias.filter(f => f.padreId === m.id).length).toBeLessThanOrEqual(3);
    // cada ciudad en exactamente una subdivision directa
    for (const c of ciudadesDelBot()) {
      expect(subs.filter(s => s.ciudades.some(x => clave(x) === clave(c)))).toHaveLength(1);
    }
  });

  it('la prioridad es defensa si hay un enemigo cerca de alguna ciudad del grupo', () => {
    agregarCiudades(5);
    const objetivo = ciudadesDelBot()[0];
    const enemigo = tileEn(e, objetivo.x, Math.min(e.config.tamanoMapa - 1, objetivo.y + 1));
    enemigo.terreno = 'plains';
    enemigo.ejercito = { tipo: 'warrior', dueno: 'h1', salud: 100, movimientoRestante: 1, bonoMovimiento: 0 };
    correr();
    const f = subdivisionDeCiudad(bot, objetivo.x, objetivo.y);
    expect(f.prioridad).toBe('defensa');
  });

  it('es determinista', () => {
    agregarCiudades(5);
    const copia = structuredClone(e);
    expect(organizarSubdivisionesIA(e, 'bot', ACTIVA)).toEqual(organizarSubdivisionesIA(copia, 'bot', ACTIVA));
  });

  it('es idempotente: con todo asignado no hace nada más', () => {
    agregarCiudades(5);
    correr();
    expect(correr()).toEqual([]);
  });

  it('no cuelga ni lanza con 0, 1 o 40 ciudades, y arma Departamentos cuando hay muchos Municipios', () => {
    expect(() => organizarSubdivisionesIA(e, 'bot', ACTIVA)).not.toThrow();
    agregarCiudades(39);
    expect(() => correr()).not.toThrow();
    const subs = subdivisionesDe(bot);
    expect(subs.some(s => s.tipo === 'departamento')).toBe(true);
    for (const s of subs.filter(x => x.padreId)) expect(subs.some(p => p.id === s.padreId)).toBe(true);
    for (const c of ciudadesDelBot()) expect(subdivisionDeCiudad(bot, c.x, c.y)).not.toBeNull();
  });

  it('las ciudades nuevas se suman a lo ya armado sin duplicar ni mover lo anterior', () => {
    agregarCiudades(5);
    correr();
    const antes = subdivisionesDe(bot).map(s => s.id);
    agregarCiudades(2);
    correr();
    const despues = subdivisionesDe(bot);
    for (const id of antes) expect(despues.some(s => s.id === id)).toBe(true);
    for (const c of ciudadesDelBot()) {
      expect(despues.filter(s => s.ciudades.some(x => clave(x) === clave(c)))).toHaveLength(1);
    }
  });

  it('no vuelve a unitario aunque pierda ciudades', () => {
    agregarCiudades(5);
    correr();
    for (const c of ciudadesDelBot().slice(1)) tileEn(e, c.x, c.y).dueno = 'h1';
    expect(() => correr()).not.toThrow();
    expect(formaEstadoDe(bot)).toBe('federal');
  });
});

describe('integración con el turno de la IA', () => {
  it('el bot sufre y resuelve problemas, y su turno nunca se cuelga ni lanza', () => {
    e = crearEstado({ nombre: 'T', semilla: 'ia-sub-2', config: { iaOrganizaSubdivisiones: true, limiteRondas: 60 } });
    aplicar(e, unirse(e, { id: 'bot', nombre: 'La Máquina', civilizacion: 'Autómatas', esBot: true, dificultadIA: 'normal' }));
    aplicar(e, unirse(e, { id: 'h1', nombre: 'H', civilizacion: 'Civ1' }));
    aplicar(e, iniciar(e));
    bot = jugadorPorId(e, 'bot');
    let pasos = 0;
    while (e.estado === 'jugando' && pasos++ < 200) {
      const actual = e.jugadores[e.indiceJugadorActual].id;
      if (actual === 'bot') jugarTurnoIA(e, 'bot', crearRng(`t${pasos}`));
      else aplicar(e, terminarTurno(e, actual));
    }
    expect(pasos).toBeLessThan(200);
    const ciudades = e.mapa.filter(t => t.ciudad && t.dueno === 'bot').length;
    if (ciudades >= 3) expect(formaEstadoDe(bot)).toBe('federal');
    for (const s of subdivisionesDe(bot)) expect(territorioDe(bot, s).length).toBeGreaterThanOrEqual(0);
  });
});
