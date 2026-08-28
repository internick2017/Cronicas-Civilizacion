import { describe, it, expect } from 'vitest';
import { crearEstado } from '../../src/domain/mapa/MapGame.js';
import { aplicar } from '../../src/domain/mapa/aplicar.js';
import { unirse, iniciar } from '../../src/domain/mapa/reglas/partida.js';
import { jugarTurnoIA, PERFILES_DIFICULTAD } from '../../src/domain/mapa/ia.js';
import { crearRng } from '../../src/domain/mapa/rng.js';
import { TECNOLOGIAS, COSTO_MEJORA_CIUDAD } from '../../src/domain/mapa/constantes.js';

function partidaConBot(dificultadIA = 'normal', semilla = 'tec-1') {
  const e = crearEstado({ nombre: 'T', semilla });
  aplicar(e, unirse(e, { id: 'bot', nombre: 'M', civilizacion: 'A', esBot: true, dificultadIA }));
  aplicar(e, unirse(e, { id: 'h1', nombre: 'H', civilizacion: 'B' }));
  aplicar(e, iniciar(e));
  return e;
}

const recursos = (e, extra = {}) => {
  const j = e.jugadores.find(x => x.id === 'bot');
  j.recursos = { food: 0, gold: 0, wood: 0, stone: 0, science: 0, culture: 0, ...extra };
  return j;
};

const investigadasEn = (eventos) =>
  eventos.filter(ev => ev.tipo === 'TecnologiaInvestigada').map(ev => ev.datos.tecnologia);

describe('la IA investiga tecnologias', () => {
  it('investiga cuando tiene ciencia, y deja de tener la ciencia gastada', () => {
    const e = partidaConBot();
    const jugador = recursos(e, { science: 40 });

    const eventos = jugarTurnoIA(e, 'bot', crearRng('inv-1'));

    expect(investigadasEn(eventos).length).toBeGreaterThan(0);
    expect(jugador.tecnologias.length).toBeGreaterThan(0);
    expect(jugador.recursos.science).toBeLessThan(40);
  });

  it('no investiga nada si no le alcanza la ciencia, y el turno sigue funcionando', () => {
    const e = partidaConBot();
    recursos(e, { science: 5 });

    const eventos = jugarTurnoIA(e, 'bot', crearRng('inv-2'));

    expect(investigadasEn(eventos)).toEqual([]);
    expect(eventos.at(-1).tipo).toBe('TurnoAvanzado'); // no se traba
  });

  it('nunca investiga dos veces la misma tecnologia', () => {
    const e = partidaConBot();
    recursos(e, { science: 10000 });

    const investigadas = investigadasEn(jugarTurnoIA(e, 'bot', crearRng('inv-3')));

    expect(new Set(investigadas).size).toBe(investigadas.length);
    expect(investigadas.length).toBeLessThanOrEqual(Object.keys(TECNOLOGIAS).length);
  });

  it('facil y normal siguen ordenes distintos: normal arranca por economia', () => {
    const eNormal = partidaConBot('normal');
    recursos(eNormal, { science: 40 });
    const eFacil = partidaConBot('facil');
    recursos(eFacil, { science: 40 });

    const primeraNormal = investigadasEn(jugarTurnoIA(eNormal, 'bot', crearRng('ord')))[0];
    const primeraFacil = investigadasEn(jugarTurnoIA(eFacil, 'bot', crearRng('ord')))[0];

    expect(primeraNormal).toBe(PERFILES_DIFICULTAD.normal.ordenTecnologias[0]);
    expect(primeraFacil).toBe(PERFILES_DIFICULTAD.facil.ordenTecnologias[0]);
    expect(primeraNormal).not.toBe(primeraFacil);
  });

  // La prueba de que la inversion RINDE: sin esto, investigar formacionMilitar
  // o filosofia seria tirar la ciencia a la basura, porque la IA no reclutaba
  // legionarios ni construia universidades en ningun orden.
  // Con normal, no con dificil: dificil prefiere caballeria (20 de ataque) sobre
  // el legionario (16), asi que el legionario es la mejor unidad SIN cuartel de
  // normal, no de dificil. Es el nivel donde esa tecnologia cambia algo.
  it('lo que desbloquea una tecnologia termina usandose: legionario y universidad', () => {
    const e = partidaConBot('normal');
    const jugador = recursos(e, { food: 9000, gold: 9000, wood: 9000, stone: 9000, science: 9000 });
    jugador.tecnologias = ['formacionMilitar', 'filosofia'];

    const eventos = [];
    for (let i = 0; i < 6; i++) {
      eventos.push(...jugarTurnoIA(e, 'bot', crearRng(`uso-${i}`)));
      // El humano pasa para que el bot vuelva a jugar.
      const otro = e.jugadores[e.indiceJugadorActual];
      if (otro.id !== 'bot' && e.estado === 'jugando') {
        aplicar(e, [{ tipo: 'TurnoAvanzado', turno: e.turno, jugadorId: otro.id, datos: { indiceJugadorActual: 0, turno: e.turno } }]);
      }
      jugador.recursos = { food: 9000, gold: 9000, wood: 9000, stone: 9000, science: 9000, culture: 0 };
    }

    expect(eventos.some(ev => ev.tipo === 'UnidadReclutada' && ev.datos.tipo === 'legionary')).toBe(true);
    expect(eventos.some(ev => ev.tipo === 'EdificioConstruido' && ev.datos.edificio === 'university')).toBe(true);
  });
});

describe('la IA mejora sus ciudades', () => {
  it('sube el nivel de una ciudad cuando le sobran ciencia y oro', () => {
    const e = partidaConBot('dificil');
    const jugador = recursos(e, { science: 9000, gold: 9000, food: 9000, wood: 9000, stone: 9000 });
    jugador.tecnologias = Object.keys(TECNOLOGIAS); // ya investigo todo: la ciencia solo sirve para mejorar

    jugarTurnoIA(e, 'bot', crearRng('mej-1'));

    const capital = e.mapa.find(t => t.ciudad && t.dueno === 'bot');
    expect(capital.ciudad.nivel).toBeGreaterThan(1);
  });

  it('la facil no mejora ciudades: es parte de que juegue peor', () => {
    const e = partidaConBot('facil');
    const jugador = recursos(e, { science: 9000, gold: 9000, food: 9000, wood: 9000, stone: 9000 });
    jugador.tecnologias = Object.keys(TECNOLOGIAS);

    jugarTurnoIA(e, 'bot', crearRng('mej-2'));

    const capital = e.mapa.find(t => t.ciudad && t.dueno === 'bot');
    expect(capital.ciudad.nivel).toBe(1);
    expect(PERFILES_DIFICULTAD.facil.mejoraCiudades).toBe(false);
  });

  it('mejorar no le come el oro a lo demas: primero investiga, funda y recluta', () => {
    const e = partidaConBot('normal');
    const jugador = recursos(e, { science: 60, gold: 60, food: 200, wood: 200, stone: 200 });
    const costoPrimerNivel = COSTO_MEJORA_CIUDAD(1);
    expect(costoPrimerNivel.science).toBeLessThanOrEqual(60); // podria pagarla si quisiera

    const eventos = jugarTurnoIA(e, 'bot', crearRng('mej-3'));
    const orden = eventos.map(ev => ev.tipo);
    const iMejora = orden.indexOf('CiudadMejorada');
    const iFunda = orden.indexOf('CiudadFundada');

    // Si en el mismo turno hizo las dos cosas, fundar tiene que haber ido antes.
    if (iMejora !== -1 && iFunda !== -1) expect(iFunda).toBeLessThan(iMejora);
  });
});
