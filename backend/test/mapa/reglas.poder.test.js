import { describe, it, expect } from 'vitest';
import { crearEstado, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { vistaJugador } from '../../src/domain/mapa/reglas/visibilidad.js';
import { poderDe, clasificacionPara } from '../../src/domain/mapa/reglas/poder.js';
import { evaluarVictoria } from '../../src/domain/mapa/reglas/turnos.js';

function partida(config = {}) {
  const e = crearEstado({ nombre: 'T', semilla: 'poder', config });
  aplicar(e, unirse(e, { id: 'p1', nombre: 'A', civilizacion: 'X' }));
  aplicar(e, unirse(e, { id: 'p2', nombre: 'B', civilizacion: 'Y' }));
  aplicar(e, iniciar(e));
  return e;
}

describe('poder de un jugador', () => {
  it('suma economia, infraestructura y territorio', () => {
    const p = poderDe(partida(), 'p1');
    expect(p.poder).toBe(p.economia + p.infraestructura + p.territorio);
    expect(p.territorio).toBeGreaterThan(0);
  });

  it('la eficiencia es (economia + infraestructura) / territorio, con un decimal', () => {
    const p = poderDe(partida(), 'p1');
    expect(p.eficiencia).toBe(Math.round(((p.economia + p.infraestructura) / p.territorio) * 10) / 10);
  });

  it('un edificio nuevo sube la infraestructura en uno', () => {
    const e = partida();
    const antes = poderDe(e, 'p1');
    e.mapa.find(t => t.ciudad && t.dueno === 'p1').ciudad.edificios.push('market');
    expect(poderDe(e, 'p1').infraestructura).toBe(antes.infraestructura + 1);
  });

  it('un cuartel sube las fortificaciones en uno', () => {
    const e = partida();
    const antes = poderDe(e, 'p1');
    e.mapa.find(t => t.ciudad && t.dueno === 'p1').ciudad.edificios.push('barracks');
    expect(poderDe(e, 'p1').fortificaciones).toBe(antes.fortificaciones + 1);
  });

  it('sin territorio la eficiencia es 0 y no revienta', () => {
    const e = partida();
    e.mapa.forEach(t => { if (t.dueno === 'p1') t.dueno = null; });
    expect(poderDe(e, 'p1').eficiencia).toBe(0);
  });
});

describe('clasificacion en la vista', () => {
  it('sin niebla trae a todos, del mas poderoso al menos', () => {
    const e = partida({ mecanicas: { niebla: false } });
    e.mapa.filter(t => t.terreno !== 'water' && !t.dueno).slice(0, 5).forEach(t => { t.dueno = 'p2'; });
    const tabla = vistaJugador(e, 'p1').clasificacion;
    expect(tabla.map(f => f.id).sort()).toEqual(['p1', 'p2']);
    expect(tabla[0].poder).toBeGreaterThanOrEqual(tabla[1].poder);
  });

  it('con niebla solo trae la del propio jugador', () => {
    const tabla = vistaJugador(partida({ mecanicas: { niebla: true } }), 'p1').clasificacion;
    expect(tabla.map(f => f.id)).toEqual(['p1']);
  });
});

describe('criterio al llegar al limite de rondas', () => {
  const finalDe = (criterio) => {
    const e = partida({ limiteRondas: 10, criterioFinal: criterio, mecanicas: { niebla: false } });
    // p1 con mas territorio, p2 con mas edificios (economia/fortificaciones)
    const libres = e.mapa.filter(t => t.terreno !== 'water' && !t.dueno && !t.ciudad);
    libres.slice(0, 6).forEach(t => { t.dueno = 'p1'; });
    const ciudadP2 = e.mapa.find(t => t.ciudad && t.dueno === 'p2');
    ciudadP2.ciudad.edificios.push('market', 'barracks', 'library');
    ciudadP2.ciudad.nivel = 5;
    const activos = e.jugadores.filter(j => j.activo);
    return evaluarVictoria(e, 'p1', activos, 10);
  };

  it('territorio (el de siempre): gana quien tiene mas casillas', () => {
    const ev = finalDe('territorio');
    expect(ev.datos.ganador).toMatchObject({ jugadorId: 'p1', tipoVictoria: 'limite_rondas' });
  });

  it('fortificaciones: gana quien tiene mejores ciudades, aunque tenga menos territorio', () => {
    const ev = finalDe('fortificaciones');
    expect(ev.datos.ganador).toMatchObject({ jugadorId: 'p2', tipoVictoria: 'limite_rondas_fortificaciones' });
  });

  it('un criterio desconocido se rechaza al crear la partida', () => {
    expect(() => crearEstado({ nombre: 'T', semilla: 's', config: { criterioFinal: 'magia' } })).toThrow(/criterioFinal/);
  });
});

describe('partida en mapa rectangular', () => {
  it('se crea, inicia y las capitales caen dentro del mapa', () => {
    const e = partida({ tamanoMapa: 24, altoMapa: 12 });
    expect(e.mapa).toHaveLength(24 * 12);
    for (const j of e.jugadores) {
      const c = e.mapa.find(t => t.ciudad && t.dueno === j.id);
      expect(c.x).toBeLessThan(24);
      expect(c.y).toBeLessThan(12);
    }
  });

  it('tileEn respeta el alto: la fila 12 no existe en un mapa de alto 12', () => {
    const e = partida({ tamanoMapa: 24, altoMapa: 12 });
    expect(tileEn(e, 23, 11)).toBe(e.mapa[11 * 24 + 23]);
    expect(tileEn(e, 5, 12)).toBeNull();
    expect(tileEn(e, 24, 0)).toBeNull();
  });

  it('rechaza un alto fuera de rango', () => {
    expect(() => crearEstado({ nombre: 'T', semilla: 's', config: { altoMapa: 9 } })).toThrow(/altoMapa/);
    expect(() => crearEstado({ nombre: 'T', semilla: 's', config: { altoMapa: 61 } })).toThrow(/altoMapa/);
  });
});
