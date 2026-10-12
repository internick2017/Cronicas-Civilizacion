import { describe, it, expect, beforeEach } from 'vitest';
import { crearEstado } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { terminarTurno } from '../../src/domain/mapa/reglas/turnos.js';
import { abandonar } from '../../src/domain/mapa/reglas/abandono.js';
import { investigar } from '../../src/domain/mapa/reglas/tecnologia.js';
import { vistaJugador } from '../../src/domain/mapa/reglas/visibilidad.js';
import { TECNOLOGIAS } from '../../src/domain/mapa/constantes.js';

let e;
function partida(ids) {
  e = crearEstado({ nombre: 'T', semilla: 's1', config: { modoTurno: 'simultaneo', tamanoMapa: 14 } });
  for (const id of ids) aplicar(e, unirse(e, { id, nombre: id, civilizacion: `Civ ${id}` }));
  aplicar(e, iniciar(e));
}
const jugar = (id) => aplicar(e, terminarTurno(e, id));
const tipos = (eventos) => eventos.map(ev => ev.tipo);
const unaTecnologia = Object.keys(TECNOLOGIAS)[0];
const intentarActuar = (id) => {
  e.jugadores.find(j => j.id === id).recursos.science = 9999;
  return investigar(e, id, { tecnologia: unaTecnologia });
};

describe('turno simultaneo', () => {
  beforeEach(() => partida(['p1', 'p2']));

  it('cualquiera puede actuar en la misma ronda, sin esperar al otro', () => {
    expect(() => intentarActuar('p2')).not.toThrow();
    expect(() => intentarActuar('p1')).not.toThrow();
  });

  it('terminar cuando falta alguien no avanza la ronda ni produce', () => {
    const eventos = terminarTurno(e, 'p1');
    expect(tipos(eventos)).toEqual(['JugadorListo']);
    aplicar(e, eventos);
    expect(e.turno).toBe(1);
    expect(vistaJugador(e, 'p2').listos).toEqual(['p1']);
  });

  it('quien ya termino no puede seguir jugando, y el que falta si', () => {
    jugar('p1');
    expect(() => intentarActuar('p1')).toThrow(/Ya terminaste/);
    expect(() => terminarTurno(e, 'p1')).toThrow(/Ya terminaste/);
    expect(() => intentarActuar('p2')).not.toThrow();
  });

  it('la ronda cierra cuando termina el ultimo, en cualquier orden', () => {
    const oroAntes = e.jugadores[0].recursos.gold;
    jugar('p2');
    const cierre = terminarTurno(e, 'p1');
    expect(tipos(cierre)).toContain('RondaCompletada');
    expect(tipos(cierre).filter(t => t === 'RecursosProducidos')).toHaveLength(2);
    aplicar(e, cierre);
    expect(e.turno).toBe(2);
    expect(e.listos).toEqual([]);
    expect(e.jugadores[0].recursos.gold).toBeGreaterThan(oroAntes);
    expect(() => intentarActuar('p1')).not.toThrow();
    expect(() => intentarActuar('p2')).not.toThrow();
  });

  it('una sola ronda por vuelta: terminar dos rondas seguidas avanza de a uno', () => {
    jugar('p1'); jugar('p2');
    jugar('p2');
    expect(e.turno).toBe(2);
    jugar('p1');
    expect(e.turno).toBe(3);
  });
});

describe('turno simultaneo: abandono', () => {
  beforeEach(() => partida(['p1', 'p2', 'p3']));

  it('si abandona el unico que faltaba terminar, la ronda cierra sola', () => {
    jugar('p1'); jugar('p2');
    aplicar(e, abandonar(e, 'p3'));
    expect(e.estado).toBe('jugando');
    expect(e.turno).toBe(2);
    expect(e.listos).toEqual([]);
  });

  it('si abandona uno y todavia falta otro, la ronda sigue abierta', () => {
    jugar('p1');
    aplicar(e, abandonar(e, 'p3'));
    expect(e.turno).toBe(1);
    jugar('p2');
    expect(e.turno).toBe(2);
  });

  it('quien abandono no puede actuar', () => {
    aplicar(e, abandonar(e, 'p3'));
    expect(() => terminarTurno(e, 'p3')).toThrow(/Ya no estás/);
  });
});

describe('partida secuencial (sin cambios)', () => {
  it('sigue exigiendo el turno propio', () => {
    e = crearEstado({ nombre: 'T', semilla: 's1', config: { tamanoMapa: 14 } });
    for (const id of ['p1', 'p2']) aplicar(e, unirse(e, { id, nombre: id, civilizacion: id }));
    aplicar(e, iniciar(e));
    expect(() => terminarTurno(e, 'p2')).toThrow(/No es tu turno/);
    expect(tipos(terminarTurno(e, 'p1'))).toEqual(['TurnoAvanzado']);
  });
});
