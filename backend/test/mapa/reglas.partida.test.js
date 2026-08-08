import { describe, it, expect } from 'vitest';
import { crearEstado, tileEn } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';

const j = (n) => ({ id: `p${n}`, nombre: `J${n}`, civilizacion: `Civ${n}` });

function partidaCon2() {
  const e = crearEstado({ nombre: 'T', semilla: 's1' });
  aplicar(e, unirse(e, j(1)));
  aplicar(e, unirse(e, j(2)));
  return e;
}

describe('unirse', () => {
  it('agrega jugador sin capital (la capital la da iniciar)', () => {
    const e = crearEstado({ nombre: 'T', semilla: 's1' });
    aplicar(e, unirse(e, j(1)));
    expect(e.jugadores).toHaveLength(1);
    expect(e.mapa.filter(t => t.ciudad).length).toBe(0);
  });
  it('rechaza duplicado, lleno y partida iniciada', () => {
    const e = partidaCon2();
    expect(() => unirse(e, j(1))).toThrowError(expect.objectContaining({ codigo: 'JUGADOR_DUPLICADO' }));
    aplicar(e, unirse(e, j(3)));
    aplicar(e, unirse(e, j(4)));
    expect(() => unirse(e, j(5))).toThrowError(expect.objectContaining({ codigo: 'PARTIDA_LLENA' }));
    const e2 = partidaCon2();
    aplicar(e2, iniciar(e2));
    expect(() => unirse(e2, j(9))).toThrowError(expect.objectContaining({ codigo: 'PARTIDA_YA_INICIADA' }));
  });
});

describe('iniciar (regresion B4: capital unica)', () => {
  it('exactamente UNA capital por jugador', () => {
    const e = partidaCon2();
    aplicar(e, iniciar(e));
    for (const jug of e.jugadores) {
      const ciudades = e.mapa.filter(t => t.ciudad && t.dueno === jug.id);
      expect(ciudades).toHaveLength(1);
      expect(ciudades[0].ciudad.nombre).toBe(`${jug.civilizacion} Capital`);
    }
    expect(e.estado).toBe('jugando');
    expect(e.turno).toBe(1);
  });
  it('niebla: el area inicial es visible solo para su dueño (regresion A2)', () => {
    const e = partidaCon2();
    aplicar(e, iniciar(e));
    const capital1 = e.mapa.find(t => t.ciudad && t.dueno === 'p1');
    expect(capital1.descubiertoPor).toEqual(['p1']);
  });
  it('con menos de 2 jugadores no arranca', () => {
    const e = crearEstado({ nombre: 'T', semilla: 's1' });
    aplicar(e, unirse(e, j(1)));
    expect(() => iniciar(e)).toThrowError(expect.objectContaining({ codigo: 'JUGADORES_INSUFICIENTES' }));
  });
});
